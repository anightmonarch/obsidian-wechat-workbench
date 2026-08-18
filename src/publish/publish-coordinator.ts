import type { PreflightContext, PreflightReport } from '../preflight/preflight-engine';
import { PublicError, toPublicError, type WeChatStage } from '../wechat/errors';
import type { DraftReceipt, RemoteDraft, WeChatDraftArticle } from '../wechat/wechat-types';
import type { AssetUploadService, PublishAccount, ResolvedArtifact, UploadImage } from './asset-upload-service';
import { decidePublish, type PublishDecision, type PublishHashes } from './publish-decision';
import type { PublishCommand, PublishOutcome } from './publish-types';
import { normalizedFinalHtmlHash } from './publish-content';
import type { RecoveryReceipt } from './recovery-receipt-store';
import type { SyncedDraftState } from './publish-state-store';

export interface PublishCoordinatorPorts {
  preflight: {
    run(artifact: PublishCommand['artifact'], context: Readonly<PreflightContext>): Readonly<PreflightReport>;
  };
  tokens: { getValidToken(): Promise<string> };
  assets: Pick<AssetUploadService, 'resolveBodyAssets' | 'uploadCover'>;
  drafts: {
    addDraft(article: Readonly<WeChatDraftArticle>, token: string): Promise<Readonly<DraftReceipt>>;
    updateDraft(mediaId: string, article: Readonly<WeChatDraftArticle>, token: string): Promise<Readonly<DraftReceipt>>;
    getDraft(mediaId: string, token: string): Promise<Readonly<RemoteDraft> | null>;
  };
  state: {
    read(file: PublishCommand['file']): Promise<Readonly<SyncedDraftState> | null>;
    commit(file: PublishCommand['file'], state: Readonly<SyncedDraftState>): Promise<void>;
  };
  receipts: {
    record(receipt: Readonly<RecoveryReceipt>): Promise<void>;
    resolve(taskId: string): Promise<void>;
  };
  currentSourceHash(file: PublishCommand['file']): Promise<string>;
  currentCover(command: Readonly<PublishCommand>): Promise<Readonly<{ path: string; hash: string }>>;
}

type Clock = () => number;
type TaskIdFactory = () => string;

function publishError(code: string, message: string, nextAction: string): PublicError {
  return new PublicError({
    code,
    stage: 'LOCAL_STATE',
    errcode: null,
    errmsg: message,
    rid: null,
    remoteEffect: 'NONE',
    retryable: false,
    nextAction,
  });
}

function outcome(
  taskId: string,
  state: PublishOutcome['state'],
  action: PublishOutcome['action'],
  mediaId: string | null,
  error: PublicError | null,
  hasUnsyncedChanges = false,
): Readonly<PublishOutcome> {
  return Object.freeze({ taskId, state, action, mediaId, error, hasUnsyncedChanges });
}

function digestFor(artifact: PublishCommand['artifact']): string {
  if (artifact.metadata.digest.trim().length > 0) return artifact.metadata.digest;
  return [...artifact.plainText.trim()].slice(0, 120).join('');
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function frozenCommand(command: Readonly<PublishCommand>): Readonly<PublishCommand> {
  const artifact = deepFreeze(structuredClone(command.artifact));
  const cover: UploadImage = {
    bytes: Uint8Array.from(command.cover.bytes),
    mimeType: command.cover.mimeType,
    filename: command.cover.filename,
  };
  return Object.freeze({
    file: Object.freeze({ ...command.file }),
    artifact,
    accountHash: command.accountHash,
    cover: Object.freeze(cover),
    coverPath: command.coverPath,
    coverHash: command.coverHash,
  });
}

function committedLocalError(code: string, message: string, nextAction: string): PublicError {
  return new PublicError({
    code,
    stage: 'LOCAL_STATE',
    errcode: null,
    errmsg: message,
    rid: null,
    remoteEffect: 'COMMITTED',
    retryable: true,
    nextAction,
  });
}

export class PublishCoordinator {
  private readonly flights = new Map<string, Promise<Readonly<PublishOutcome>>>();

  constructor(
    private readonly ports: PublishCoordinatorPorts,
    private readonly now: Clock = Date.now,
    private readonly taskId: TaskIdFactory = randomUUID,
  ) {}

  publish(command: Readonly<PublishCommand>): Promise<Readonly<PublishOutcome>> {
    const key = `${command.accountHash}:${command.file.path}`;
    const existing = this.flights.get(key);
    if (existing !== undefined) return existing;
    const task = this.execute(frozenCommand(command)).finally(() => {
      if (this.flights.get(key) === task) this.flights.delete(key);
    });
    this.flights.set(key, task);
    return task;
  }

  private async execute(command: Readonly<PublishCommand>): Promise<Readonly<PublishOutcome>> {
    const taskId = this.taskId();
    let action: PublishOutcome['action'] = null;
    let mediaId: string | null = null;
    let failureStage: WeChatStage = 'LOCAL_STATE';
    try {
      const report = this.ports.preflight.run(command.artifact, {
        purpose: 'publish',
        themeValid: true,
        accountConfigured: command.accountHash.length > 0,
        coverReady: command.cover.bytes.byteLength > 0,
        associationAccountMatches: true,
      });
      if (report.blocking.length > 0) {
        return outcome(taskId, 'FAILED', null, null, publishError(
          'PUBLISH_PREFLIGHT_BLOCKED',
          'Publish preflight contains blocking issues.',
          'Fix all blocking issues before retrying.',
        ));
      }

      let currentCover: Readonly<{ path: string; hash: string }>;
      try {
        currentCover = await this.ports.currentCover(command);
      } catch {
        return outcome(taskId, 'FAILED', null, null, publishError(
          'COVER_RECHECK_FAILED',
          'The confirmed cover could not be read again before publishing.',
          'Reopen the cover picker, confirm the cover, and retry.',
        ));
      }
      if (currentCover.path !== command.coverPath || currentCover.hash !== command.coverHash) {
        return outcome(taskId, 'FAILED', null, null, publishError(
          'COVER_CHANGED_AFTER_CONFIRMATION',
          'The selected cover path or bytes changed after confirmation.',
          'Review and confirm the current cover before publishing.',
        ));
      }

      const local = await this.ports.state.read(command.file);
      const hashes: PublishHashes = {
        contentHash: command.artifact.contentHash,
        themeId: command.artifact.theme.id,
        themeVersion: command.artifact.theme.version,
        coverHash: command.coverHash,
      };
      let decision = decidePublish(local, 'NOT_CHECKED', hashes, command.accountHash);
      if (decision.kind === 'BLOCK_ACCOUNT_MISMATCH') return this.blockedDecision(taskId, decision);

      failureStage = 'TOKEN';
      const token = await this.ports.tokens.getValidToken();
      if (local !== null) {
        failureStage = 'DRAFT_READ';
        const remote = await this.ports.drafts.getDraft(local.draftId, token);
        decision = decidePublish(local, remote === null ? 'MISSING' : 'EXISTS', hashes, command.accountHash);
      }
      if (decision.kind === 'BLOCK_REMOTE_MISSING' || decision.kind === 'BLOCK_ACCOUNT_MISMATCH') {
        return this.blockedDecision(taskId, decision);
      }
      if (decision.kind === 'SKIP') {
        return outcome(taskId, 'LOCAL_COMMITTED', 'SKIP', decision.mediaId, null);
      }

      action = decision.kind;
      const account: PublishAccount = { accountHash: command.accountHash, accessToken: token };
      failureStage = 'UPLOAD_BODY_IMAGE';
      const resolved = await this.ports.assets.resolveBodyAssets(command.artifact, account);
      failureStage = 'UPLOAD_COVER';
      const cover = await this.ports.assets.uploadCover(command.cover, account);
      const article = this.finalArticle(command, resolved, cover.mediaId);

      let receipt: Readonly<DraftReceipt>;
      failureStage = action === 'CREATE' ? 'DRAFT_CREATE' : 'DRAFT_UPDATE';
      try {
        receipt = action === 'CREATE'
          ? await this.ports.drafts.addDraft(article, token)
          : await this.ports.drafts.updateDraft(decision.mediaId ?? '', article, token);
      } catch (error) {
        const publicError = error instanceof PublicError ? error : toPublicError(error, action === 'CREATE' ? 'DRAFT_CREATE' : 'DRAFT_UPDATE');
        if (publicError.remoteEffect === 'UNKNOWN') {
          try {
            await this.recordReceipt(taskId, command, action, decision.mediaId ?? '', resolved, 'UNRESOLVED');
          } catch {
            return outcome(taskId, 'AMBIGUOUS', action, decision.mediaId, new PublicError({
              ...publicError,
              code: 'AMBIGUOUS_RECEIPT_WRITE_FAILED',
              nextAction: 'Check the WeChat draft box manually; no durable local receipt could be saved.',
            }));
          }
          return outcome(taskId, 'AMBIGUOUS', action, decision.mediaId, publicError);
        }
        return outcome(taskId, 'FAILED', action, decision.mediaId, publicError);
      }

      mediaId = receipt.mediaId;
      try {
        await this.recordReceipt(taskId, command, action, mediaId, resolved, 'UNRESOLVED');
      } catch {
        return outcome(taskId, 'REMOTE_COMMITTED', action, mediaId, committedLocalError(
          'RECOVERY_RECEIPT_WRITE_FAILED',
          'The WeChat draft was committed, but its local recovery receipt could not be saved.',
          'Do not publish again; record or link the remote draft manually.',
        ));
      }
      const localState: SyncedDraftState = {
        draftId: mediaId,
        accountId: command.accountHash,
        contentHash: command.artifact.contentHash,
        themeId: command.artifact.theme.id,
        themeVersion: command.artifact.theme.version,
        coverHash: command.coverHash,
        syncedAt: new Date(this.now()).toISOString(),
      };
      try {
        await this.ports.state.commit(command.file, localState);
      } catch (error) {
        const publicError = error instanceof PublicError ? error : toPublicError(error, 'LOCAL_STATE');
        return outcome(taskId, 'REMOTE_COMMITTED', action, mediaId, publicError);
      }
      try {
        await this.ports.receipts.resolve(taskId);
      } catch {
        return outcome(taskId, 'LOCAL_COMMITTED', action, mediaId, committedLocalError(
          'RECOVERY_RECEIPT_RESOLVE_FAILED',
          'Draft and Frontmatter were committed, but the recovery receipt remains unresolved.',
          'Review and resolve the duplicate local recovery receipt.',
        ));
      }
      let currentHash = command.artifact.source.sourceHash;
      try { currentHash = await this.ports.currentSourceHash(command.file); } catch { /* State is already committed. */ }
      return outcome(
        taskId, 'LOCAL_COMMITTED', action, mediaId, null,
        currentHash !== command.artifact.source.sourceHash,
      );
    } catch (error) {
      const publicError = error instanceof PublicError ? error : toPublicError(error, failureStage);
      return outcome(taskId, 'FAILED', action, mediaId, publicError);
    }
  }

  private blockedDecision(taskId: string, decision: Readonly<PublishDecision>): Readonly<PublishOutcome> {
    const mismatch = decision.kind === 'BLOCK_ACCOUNT_MISMATCH';
    return outcome(taskId, 'FAILED', null, decision.mediaId, publishError(
      mismatch ? 'DRAFT_ACCOUNT_MISMATCH' : 'REMOTE_DRAFT_MISSING',
      mismatch
        ? 'The note is associated with a different WeChat account.'
        : 'The associated WeChat draft no longer exists.',
      mismatch
        ? 'Switch accounts or unlink the local association.'
        : 'Confirm the missing draft before explicitly creating a replacement.',
    ));
  }

  private finalArticle(
    command: Readonly<PublishCommand>,
    resolved: Readonly<ResolvedArtifact>,
    coverMediaId: string,
  ): Readonly<WeChatDraftArticle> {
    return Object.freeze({
      title: command.artifact.metadata.title,
      author: command.artifact.metadata.author,
      digest: digestFor(command.artifact),
      html: resolved.html,
      contentSourceUrl: command.artifact.metadata.contentSourceUrl,
      coverMediaId,
    });
  }

  private async recordReceipt(
    taskId: string,
    command: Readonly<PublishCommand>,
    operation: 'CREATE' | 'UPDATE',
    mediaId: string,
    resolved: Readonly<ResolvedArtifact>,
    status: RecoveryReceipt['status'],
  ): Promise<void> {
    await this.ports.receipts.record(Object.freeze({
      taskId,
      accountHash: command.accountHash,
      mediaId,
      operation,
      contentHash: normalizedFinalHtmlHash(resolved.html),
      themeHash: command.artifact.theme.contentHash,
      coverHash: command.coverHash,
      remoteTimestamp: this.now(),
      status,
    }));
  }
}
import { randomUUID } from 'node:crypto';
