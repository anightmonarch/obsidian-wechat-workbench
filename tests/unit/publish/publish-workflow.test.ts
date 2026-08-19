import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

import type { RenderArtifact } from '../../../src/domain/artifact';
import type { VaultFileRef } from '../../../src/domain/ports';
import { PreflightEngine } from '../../../src/preflight/preflight-engine';
import { buildPublishDialogModel } from '../../../src/ui/publish-dialog';
import {
  PublishWorkflow,
  type PublishRecoveryPorts,
  type PublishWorkflowSettings,
} from '../../../src/publish/publish-workflow';
import type { SyncedDraftState } from '../../../src/publish/publish-state-store';
import { transactionFingerprint } from '../../../src/publish/publish-content';
import type { RecoveryReceipt } from '../../../src/publish/recovery-receipt-store';

const png = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
]);
const file: VaultFileRef = { path: 'article.md', basename: 'article', modifiedAt: 1 };
const artifact: Readonly<RenderArtifact> = Object.freeze({
  artifactVersion: '1', rendererVersion: '0.1.0',
  source: Object.freeze({ vaultPath: file.path, modifiedAt: 1, sourceHash: 'SOURCE_HASH' }),
  theme: Object.freeze({ id: 'native', version: '1.0.0', contentHash: 'THEME_HASH' }),
  metadata: Object.freeze({ title: 'Article', author: '', digest: '', cover: null, contentSourceUrl: '' }),
  canonicalHtml: '<section class="wechat-article"><p>Body</p><img data-asset-id="asset:cover" data-asset-kind="local-image"></section>',
  plainText: 'Body',
  assets: Object.freeze([Object.freeze({
    id: 'asset:cover', kind: 'local-image', source: 'assets/cover.png', status: 'resolved',
    contentHash: createHash('sha256').update(png).digest('hex'), resolvedUrl: null,
  })]),
  diagnostics: Object.freeze([]), contentHash: 'CONTENT_HASH',
});

function harness(
  settings: PublishWorkflowSettings = {
    appId: 'wxSYNTHETIC123456', accountHash: 'ACCOUNT_HASH', defaultCoverStrategy: 'first-image',
  },
  local: Readonly<SyncedDraftState> | null = null,
  recovery?: PublishRecoveryPorts,
) {
  const publish = vi.fn(async () => ({
    taskId: 'TASK_1', state: 'LOCAL_COMMITTED' as const, action: 'CREATE' as const,
    mediaId: 'TEST_MEDIA_ID', error: null, hasUnsyncedChanges: false,
  }));
  const state = {
    read: vi.fn(async () => local),
    commit: vi.fn(async () => undefined),
    unlink: vi.fn(async () => undefined),
  };
  const workflow = new PublishWorkflow(
    { get: () => settings },
    state,
    {
      resolveLink: vi.fn(async (source: string) => source),
      readBinary: vi.fn(async () => png),
    },
    new PreflightEngine(),
    { publish },
    recovery,
  );
  return { workflow, publish, state };
}

describe('PublishWorkflow', () => {
  it('prepares a frozen CREATE command using the first local image as cover', async () => {
    const current = harness();

    const prepared = await current.workflow.prepare(file, artifact);

    expect(buildPublishDialogModel(prepared.dialogInput)).toMatchObject({
      action: 'CREATE', coverLabel: 'cover.png', formalPublish: false,
    });
    expect(prepared.command.coverHash).toBe(createHash('sha256').update(png).digest('hex'));
    expect(prepared.command.coverPath).toBe('assets/cover.png');
    expect(Object.isFrozen(prepared.command)).toBe(true);
  });

  it('blocks missing account, cover, and account mismatch before any network call', async () => {
    await expect(harness({ appId: '', accountHash: null, defaultCoverStrategy: 'first-image' })
      .workflow.prepare(file, { ...artifact, assets: Object.freeze([]) }))
      .rejects.toMatchObject({ code: 'PUBLISH_PREPARE_BLOCKED' });

    const mismatched: Readonly<SyncedDraftState> = Object.freeze({
      draftId: 'TEST_MEDIA_ID', accountId: 'OTHER_ACCOUNT', contentHash: 'OLD',
      themeId: 'native', themeVersion: '1.0.0', coverHash: 'OLD', syncedAt: 'old',
    });
    await expect(harness(undefined, mismatched).workflow.prepare(file, artifact))
      .rejects.toMatchObject({ code: 'PUBLISH_PREPARE_BLOCKED' });
  });

  it('executes only an explicitly prepared command', async () => {
    const current = harness();
    const prepared = await current.workflow.prepare(file, artifact);

    const outcome = await current.workflow.execute(prepared.command);

    expect(outcome.state).toBe('LOCAL_COMMITTED');
    expect(current.publish).toHaveBeenCalledWith(prepared.command);
  });

  it('unlinks only the active note local association', async () => {
    const current = harness();

    await current.workflow.unlink(file);

    expect(current.state.unlink).toHaveBeenCalledWith(file);
    expect(current.publish).not.toHaveBeenCalled();
  });

  it('reconciles an ambiguous create and commits the recovered media ID locally', async () => {
    const commit = vi.fn(async () => undefined);
    const record = vi.fn(async () => undefined);
    const resolve = vi.fn(async () => undefined);
    let receipt: Readonly<RecoveryReceipt> | null = null;
    const workflow = new PublishWorkflow(
      { get: () => ({ appId: 'wxSYNTHETIC123456', accountHash: 'ACCOUNT_HASH', defaultCoverStrategy: 'first-image' }) },
      { read: vi.fn(async () => null), commit, unlink: vi.fn(async () => undefined) },
      { resolveLink: vi.fn(async (source: string) => source), readBinary: vi.fn(async () => png) },
      new PreflightEngine(),
      { publish: vi.fn() },
      {
        receipts: { get: vi.fn(() => receipt), record, resolve, listUnresolved: vi.fn(() => []) },
        tokens: { getValidToken: vi.fn(async () => 'SYNTHETIC_TOKEN') },
        reconciler: { reconcile: vi.fn(async () => ({ kind: 'MATCHED' as const, mediaId: 'RECOVERED_MEDIA_ID' })) },
        now: () => 1_700_000_100_000,
      },
    );
    const command = (await workflow.prepare(file, artifact)).command;
    receipt = Object.freeze({
      taskId: 'TASK_RECOVERY', vaultPath: file.path, accountHash: 'ACCOUNT_HASH',
      fingerprint: transactionFingerprint(command), mediaId: '', operation: 'CREATE' as const,
      contentHash: 'CONTENT_HASH', themeHash: 'THEME_HASH', coverHash: 'COVER_HASH',
      remoteTimestamp: 1_700_000_000_000, status: 'UNRESOLVED' as const,
    });

    const outcome = await workflow.reconcile(command, receipt.taskId);

    expect(outcome).toMatchObject({ state: 'LOCAL_COMMITTED', mediaId: 'RECOVERED_MEDIA_ID' });
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ mediaId: 'RECOVERED_MEDIA_ID' }));
    expect(commit).toHaveBeenCalledWith(file, expect.objectContaining({ draftId: 'RECOVERED_MEDIA_ID' }));
    expect(resolve).toHaveBeenCalledWith(receipt.taskId);
  });

  it('blocks another CREATE while the same note has an unresolved CREATE receipt', async () => {
    const base = harness();
    const command = (await base.workflow.prepare(file, artifact)).command;
    const receipt: Readonly<RecoveryReceipt> = Object.freeze({
      taskId: 'TASK_PENDING', vaultPath: file.path, accountHash: command.accountHash,
      fingerprint: transactionFingerprint(command), mediaId: '', operation: 'CREATE',
      contentHash: 'CONTENT_HASH', themeHash: 'THEME_HASH', coverHash: command.coverHash,
      remoteTimestamp: 1, status: 'UNRESOLVED',
    });
    const blocked = harness(undefined, null, {
      receipts: {
        get: vi.fn(() => receipt), record: vi.fn(), resolve: vi.fn(),
        listUnresolved: vi.fn(() => [receipt]),
      },
      tokens: { getValidToken: vi.fn(async () => 'SYNTHETIC_TOKEN') },
      reconciler: { reconcile: vi.fn() },
    });

    await expect(blocked.workflow.prepare(file, artifact))
      .rejects.toMatchObject({ code: 'PUBLISH_PREPARE_BLOCKED' });
    expect(blocked.publish).not.toHaveBeenCalled();
  });

  it('repairs local state from the known remote result when receipt persistence failed', async () => {
    const resolve = vi.fn(async () => undefined);
    const current = harness(undefined, null, {
      receipts: {
        get: vi.fn(() => null), record: vi.fn(), resolve, listUnresolved: vi.fn(() => []),
      },
      tokens: { getValidToken: vi.fn(async () => 'SYNTHETIC_TOKEN') },
      reconciler: { reconcile: vi.fn() },
    });
    const command = (await current.workflow.prepare(file, artifact)).command;

    const outcome = await current.workflow.repairLocal(command, 'TASK_NO_RECEIPT', {
      mediaId: 'KNOWN_REMOTE_MEDIA_ID', operation: 'CREATE',
    });

    expect(outcome).toMatchObject({ state: 'LOCAL_COMMITTED', mediaId: 'KNOWN_REMOTE_MEDIA_ID' });
    expect(current.state.commit).toHaveBeenCalledWith(file, expect.objectContaining({
      draftId: 'KNOWN_REMOTE_MEDIA_ID',
    }));
  });
});
