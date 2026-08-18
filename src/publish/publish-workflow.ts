import { posix } from 'node:path';

import type { RenderArtifact } from '../domain/artifact';
import type { VaultFileRef } from '../domain/ports';
import { detectImageMime } from '../media/image-format';
import type { PreflightEngine } from '../preflight/preflight-engine';
import { hashContent } from '../render/canonicalize';
import type { DefaultCoverStrategy } from '../settings/model';
import { accountHashForAppId } from '../settings/account';
import { PublicError } from '../wechat/errors';
import type { PublishCoordinator } from './publish-coordinator';
import { decidePublish } from './publish-decision';
import type { PublishCommand, PublishDialogInput, PublishOutcome } from './publish-types';
import type { AmbiguousReconciler } from './reconcile-ambiguous';
import type { RecoveryReceiptStore } from './recovery-receipt-store';
import type { PublishStateStore, SyncedDraftState } from './publish-state-store';

export interface PublishWorkflowSettings {
  appId: string;
  accountHash: string | null;
  defaultCoverStrategy: DefaultCoverStrategy;
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
  receipts: Pick<RecoveryReceiptStore, 'get' | 'record' | 'resolve'>;
  tokens: { getValidToken(): Promise<string> };
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

export class PublishWorkflow {
  constructor(
    private readonly settings: PublishWorkflowSettingsPort,
    private readonly state: Pick<PublishStateStore, 'read' | 'commit' | 'unlink'>,
    private readonly files: PublishCoverFilePort,
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
    const local = await this.state.read(file);
    const coverPath = await this.coverPath(file, artifact, settings.defaultCoverStrategy);
    let coverBytes: Uint8Array | null = null;
    let coverMime: ReturnType<typeof detectImageMime> = null;
    if (coverPath !== null) {
      try {
        coverBytes = await this.files.readBinary(coverPath);
        coverMime = detectImageMime(coverBytes);
      } catch {
        coverBytes = null;
      }
    }
    const associationMatches = local === null || accountHash === local.accountId;
    const report = this.preflight.run(artifact, {
      purpose: 'publish',
      themeValid: true,
      accountConfigured: settings.appId.trim().length > 0 && accountHash !== null,
      coverReady: coverBytes !== null && coverMime !== null,
      associationAccountMatches: associationMatches,
    });
    if (report.blocking.length > 0 || accountHash === null || coverBytes === null
      || coverMime === null || coverPath === null) {
      throw preparationError(report.blocking.map(item => item.message));
    }

    const coverHash = hashContent(coverBytes);
    const decision = decidePublish(local, 'NOT_CHECKED', {
      contentHash: artifact.contentHash,
      themeId: artifact.theme.id,
      themeVersion: artifact.theme.version,
      coverHash,
    }, accountHash);
    if (decision.kind === 'BLOCK_ACCOUNT_MISMATCH' || decision.kind === 'BLOCK_REMOTE_MISSING') {
      throw preparationError(['Draft association must be repaired before publishing.']);
    }
    const command: Readonly<PublishCommand> = Object.freeze({
      file: Object.freeze({ ...file }),
      artifact,
      accountHash,
      cover: Object.freeze({
        bytes: Uint8Array.from(coverBytes),
        mimeType: coverMime,
        filename: posix.basename(coverPath),
      }),
      coverHash,
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
        coverLabel: posix.basename(coverPath),
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
    const token = await this.recovery.tokens.getValidToken();
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
  ): Promise<Readonly<PublishOutcome>> {
    if (this.recovery === undefined) throw preparationError(['Recovery service is unavailable.']);
    const receipt = this.recovery.receipts.get(taskId);
    if (receipt === null || receipt.mediaId.length === 0) {
      throw preparationError(['A committed remote draft receipt was not found.']);
    }
    return this.commitRecovered(command, taskId, receipt.mediaId, receipt.operation);
  }

  async unlink(file: VaultFileRef): Promise<void> {
    await this.state.unlink(file);
  }

  private async coverPath(
    file: VaultFileRef,
    artifact: Readonly<RenderArtifact>,
    strategy: DefaultCoverStrategy,
  ): Promise<string | null> {
    if (artifact.metadata.cover !== null) {
      return this.files.resolveLink(artifact.metadata.cover, file.path);
    }
    if (strategy !== 'first-image') return null;
    return artifact.assets.find(asset => asset.kind === 'local-image')?.source ?? null;
  }

  private async commitRecovered(
    command: Readonly<PublishCommand>,
    taskId: string,
    mediaId: string,
    operation: 'CREATE' | 'UPDATE',
  ): Promise<Readonly<PublishOutcome>> {
    if (this.recovery === undefined) throw preparationError(['Recovery service is unavailable.']);
    const timestamp = (this.recovery.now ?? Date.now)();
    const state: SyncedDraftState = {
      draftId: mediaId,
      accountId: command.accountHash,
      contentHash: command.artifact.contentHash,
      themeId: command.artifact.theme.id,
      themeVersion: command.artifact.theme.version,
      coverHash: command.coverHash,
      syncedAt: new Date(timestamp).toISOString(),
    };
    try {
      await this.state.commit(command.file, state);
      await this.recovery.receipts.resolve(taskId);
      return Object.freeze({
        taskId, state: 'LOCAL_COMMITTED', action: operation, mediaId,
        error: null, hasUnsyncedChanges: false,
      });
    } catch (error) {
      return Object.freeze({
        taskId, state: 'REMOTE_COMMITTED', action: operation, mediaId,
        error: error instanceof PublicError ? error : preparationError(['Local association repair failed.']),
        hasUnsyncedChanges: false,
      });
    }
  }
}
