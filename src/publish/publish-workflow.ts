import { posix } from 'node:path';

import type { PublishCoverResolverPort } from '../cover/cover-workflow';
import type { RenderArtifact } from '../domain/artifact';
import type { VaultFileRef } from '../domain/ports';
import type { PreflightEngine } from '../preflight/preflight-engine';
import { publishPayloadHash, transactionFingerprint } from './publish-content';
import { accountHashForAppId } from '../settings/account';
import { PublicError } from '../wechat/errors';
import type { PublishCoordinator } from './publish-coordinator';
import { decidePublish } from './publish-decision';
import type {
  DraftAssociationRef,
  PublishCommand,
  PublishDialogInput,
  PublishOutcome,
} from './publish-types';
import type { AmbiguousReconciler } from './reconcile-ambiguous';
import type { RecoveryReceipt, RecoveryReceiptStore } from './recovery-receipt-store';
import type { PublishStateStore, SyncedDraftState } from './publish-state-store';

export interface PublishWorkflowSettings {
  appId: string;
  accountHash: string | null;
}

export interface PublishWorkflowSettingsPort {
  get(): Readonly<PublishWorkflowSettings>;
}

export interface PublishCoverFilePort {
  resolveLink(source: string, fromPath: string): Promise<string | null>;
  readBinary(path: string): Promise<Uint8Array>;
}

export interface PreparedPublish {
  command: Readonly<PublishCommand>;
  dialogInput: Readonly<PublishDialogInput>;
}

export interface PublishRecoveryPorts {
  receipts: Pick<RecoveryReceiptStore, 'get' | 'record' | 'resolve' | 'listUnresolved'>;
  tokens: { getValidToken(expectedAccountHash: string): Promise<string> };
  reconciler: Pick<AmbiguousReconciler, 'reconcile'>;
  now?: () => number;
}

function preparationError(messages: readonly string[]): PublicError {
  return new PublicError({
    code: 'PUBLISH_PREPARE_BLOCKED',
    stage: 'LOCAL_STATE',
    errcode: null,
    errmsg: messages.join(' '),
    rid: null,
    remoteEffect: 'NONE',
    retryable: false,
    nextAction: 'Fix the listed article, account, or cover settings before retrying.',
  });
}

function accountConfigurationError(): PublicError {
  return new PublicError({
    code: 'WECHAT_ACCOUNT_NOT_CONFIGURED',
    stage: 'LOCAL_STATE',
    errcode: null,
    errmsg: 'WeChat account is not configured.',
    rid: null,
    remoteEffect: 'NONE',
    retryable: false,
    nextAction: 'Configure the local WeChat account before preparing a draft.',
  });
}

export class DraftAssociationMismatchError extends PublicError {
  constructor(readonly association: Readonly<DraftAssociationRef>) {
    super({
      code: 'DRAFT_ACCOUNT_MISMATCH',
      stage: 'LOCAL_STATE',
      errcode: null,
      errmsg: 'The existing draft association belongs to a different WeChat account.',
      rid: null,
      remoteEffect: 'NONE',
      retryable: false,
      nextAction: 'Switch accounts or explicitly unlink the captured local association.',
    });
    this.name = 'DraftAssociationMismatchError';
  }
}

function associationRef(
  file: VaultFileRef,
  local: Readonly<SyncedDraftState>,
): Readonly<DraftAssociationRef> {
  return Object.freeze({
    file: Object.freeze({ ...file }),
    draftId: local.draftId,
    accountId: local.accountId,
  });
}

export class PublishWorkflow {
  constructor(
    private readonly settings: PublishWorkflowSettingsPort,
    private readonly state: Pick<PublishStateStore, 'read' | 'commit' | 'unlink'>,
    private readonly covers: PublishCoverResolverPort,
    private readonly preflight: PreflightEngine,
    private readonly coordinator: Pick<PublishCoordinator, 'publish'>,
    private readonly recovery?: PublishRecoveryPorts,
  ) {}

  async prepare(
    file: VaultFileRef,
    artifact: Readonly<RenderArtifact>,
  ): Promise<Readonly<PreparedPublish>> {
    const settings = this.settings.get();
    const accountHash = settings.accountHash ?? accountHashForAppId(settings.appId);
    if (settings.appId.trim().length === 0 || accountHash === null) {
      throw accountConfigurationError();
    }
    const local = await this.state.read(file);
    const pendingCreate = this.recovery?.receipts.listUnresolved().find(receipt => (
      receipt.operation === 'CREATE'
      && receipt.vaultPath === file.path
      && receipt.accountHash === accountHash
    ));
    if (local === null && pendingCreate !== undefined) {
      throw preparationError(['An unresolved CREATE receipt must be reconciled before creating another draft.']);
    }
    if (local !== null && local.accountId !== accountHash) {
      throw new DraftAssociationMismatchError(associationRef(file, local));
    }
    const preparedCover = await this.covers.prepareForPublish(file, artifact);
    const associationMatches = local === null || accountHash === local.accountId;
    const report = this.preflight.run(artifact, {
      purpose: 'publish',
      themeValid: true,
      accountConfigured: settings.appId.trim().length > 0 && accountHash !== null,
      coverReady: preparedCover !== null,
      associationAccountMatches: associationMatches,
    });
    if (report.blocking.length > 0 || accountHash === null || preparedCover === null) {
      throw preparationError(report.blocking.map(item => item.message));
    }

    const coverHash = preparedCover.contentHash;
    const payloadHash = publishPayloadHash(artifact);
    const decision = decidePublish(local, 'NOT_CHECKED', {
      contentHash: payloadHash,
      themeId: artifact.theme.id,
      themeVersion: artifact.theme.version,
      coverHash,
    }, accountHash);
    if (decision.kind === 'BLOCK_ACCOUNT_MISMATCH' || decision.kind === 'BLOCK_REMOTE_MISSING') {
      throw preparationError(['Draft association must be repaired before publishing.']);
    }
    const command: Readonly<PublishCommand> = Object.freeze({
      file: Object.freeze({ ...file }),
      expectedAssociation: local === null ? null : associationRef(file, local),
      artifact,
      accountHash,
      cover: Object.freeze({
        bytes: Uint8Array.from(preparedCover.bytes),
        mimeType: preparedCover.mimeType,
        filename: posix.basename(preparedCover.vaultPath),
      }),
      coverPath: preparedCover.vaultPath,
      coverHash,
      payloadHash,
    });
    return Object.freeze({
      command,
      dialogInput: Object.freeze({
        action: decision.kind,
        appId: settings.appId,
        title: artifact.metadata.title,
        digest: artifact.metadata.digest,
        themeId: artifact.theme.id,
        themeVersion: artifact.theme.version,
        contentHash: artifact.contentHash,
        themeHash: artifact.theme.contentHash,
        coverHash,
        imageCount: artifact.assets.filter(asset => asset.kind !== 'generated-math').length,
        coverLabel: posix.basename(preparedCover.vaultPath),
      }),
    });
  }

  async execute(command: Readonly<PublishCommand>): Promise<Readonly<PublishOutcome>> {
    return this.coordinator.publish(command);
  }

  async reconcile(
    command: Readonly<PublishCommand>,
    taskId: string,
  ): Promise<Readonly<PublishOutcome>> {
    if (this.recovery === undefined) throw preparationError(['Recovery service is unavailable.']);
    const receipt = this.recovery.receipts.get(taskId);
    if (receipt === null) throw preparationError(['Recovery receipt was not found.']);
    this.assertReceiptMatches(command, receipt);
    const token = await this.recovery.tokens.getValidToken(receipt.accountHash);
    const result = await this.recovery.reconciler.reconcile(receipt, token);
    if (result.kind !== 'MATCHED' || result.mediaId === null) {
      return Object.freeze({
        taskId,
        state: 'AMBIGUOUS',
        action: receipt.operation,
        mediaId: receipt.mediaId || null,
        error: new PublicError({
          code: 'RECONCILIATION_REQUIRED',
          stage: receipt.operation === 'CREATE' ? 'DRAFT_CREATE' : 'DRAFT_UPDATE',
          errcode: null,
          errmsg: result.kind === 'NEEDS_CONFIRMATION'
            ? 'Multiple matching drafts require manual confirmation.'
            : 'No unique matching draft was found.',
          rid: null,
          remoteEffect: 'UNKNOWN',
          retryable: false,
          nextAction: 'Check the WeChat draft box and link the correct draft manually.',
        }),
        hasUnsyncedChanges: false,
      });
    }
    await this.recovery.receipts.record(Object.freeze({ ...receipt, mediaId: result.mediaId }));
    return this.commitRecovered(command, taskId, result.mediaId, receipt.operation);
  }

  async repairLocal(
    command: Readonly<PublishCommand>,
    taskId: string,
    fallback?: Readonly<{ mediaId: string; operation: 'CREATE' | 'UPDATE' }>,
  ): Promise<Readonly<PublishOutcome>> {
    if (this.recovery === undefined) throw preparationError(['Recovery service is unavailable.']);
    const receipt = this.recovery.receipts.get(taskId);
    if (receipt !== null) this.assertReceiptMatches(command, receipt);
    const mediaId = receipt?.mediaId || fallback?.mediaId || '';
    const operation = receipt?.operation ?? fallback?.operation;
    if (mediaId.length === 0 || operation === undefined) {
      throw preparationError(['A committed remote draft receipt was not found.']);
    }
    return this.commitRecovered(command, taskId, mediaId, operation);
  }

  async unlink(association: Readonly<DraftAssociationRef>): Promise<void> {
    await this.state.unlink(association.file, {
      draftId: association.draftId,
      accountId: association.accountId,
    });
  }

  private async commitRecovered(
    command: Readonly<PublishCommand>,
    taskId: string,
    mediaId: string,
    operation: 'CREATE' | 'UPDATE',
  ): Promise<Readonly<PublishOutcome>> {
    if (this.recovery === undefined) throw preparationError(['Recovery service is unavailable.']);
    const timestamp = (this.recovery.now ?? Date.now)();
    const current = await this.state.read(command.file);
    if (current !== null && current.draftId !== mediaId) {
      return Object.freeze({
        taskId, state: 'FAILED', action: operation, mediaId,
        error: preparationError(['The note is already associated with a different draft.']),
        hasUnsyncedChanges: false,
      });
    }
    const state: SyncedDraftState = {
      draftId: mediaId,
      accountId: command.accountHash,
      contentHash: command.payloadHash,
      themeId: command.artifact.theme.id,
      themeVersion: command.artifact.theme.version,
      coverHash: command.coverHash,
      syncedAt: new Date(timestamp).toISOString(),
    };
    try {
      await this.state.commit(command.file, state);
    } catch (error) {
      return Object.freeze({
        taskId, state: 'REMOTE_COMMITTED', action: operation, mediaId,
        error: error instanceof PublicError ? error : preparationError(['Local association repair failed.']),
        hasUnsyncedChanges: false,
      });
    }
    try {
      await this.recovery.receipts.resolve(taskId);
      return Object.freeze({
        taskId, state: 'LOCAL_COMMITTED', action: operation, mediaId,
        error: null, hasUnsyncedChanges: false,
      });
    } catch {
      return Object.freeze({
        taskId, state: 'LOCAL_COMMITTED', action: operation, mediaId,
        error: new PublicError({
          code: 'RECOVERY_RECEIPT_RESOLVE_FAILED', stage: 'LOCAL_STATE', errcode: null,
          errmsg: 'The draft association was repaired, but the recovery receipt remains unresolved.',
          rid: null, remoteEffect: 'COMMITTED', retryable: true,
          nextAction: 'Review and resolve the stale local recovery receipt.',
        }),
        hasUnsyncedChanges: false,
      });
    }
  }

  private assertReceiptMatches(
    command: Readonly<PublishCommand>,
    receipt: Readonly<RecoveryReceipt>,
  ): void {
    if (receipt.vaultPath === command.file.path
      && receipt.accountHash === command.accountHash
      && receipt.fingerprint === transactionFingerprint(command)) return;
    throw preparationError(['The recovery receipt does not belong to this note, account, or frozen transaction.']);
  }
}
