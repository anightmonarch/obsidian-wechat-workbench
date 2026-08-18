import { describe, expect, it, vi } from 'vitest';

import type { RenderArtifact } from '../../../src/domain/artifact';
import type { VaultFileRef } from '../../../src/domain/ports';
import type { UploadImage } from '../../../src/publish/asset-upload-service';
import {
  PublishCoordinator,
  type PublishCoordinatorPorts,
} from '../../../src/publish/publish-coordinator';
import type { RecoveryReceipt } from '../../../src/publish/recovery-receipt-store';
import type { SyncedDraftState } from '../../../src/publish/publish-state-store';
import { PublicError } from '../../../src/wechat/errors';

const file: VaultFileRef = { path: 'article.md', basename: 'article', modifiedAt: 1 };
const artifact: Readonly<RenderArtifact> = Object.freeze({
  artifactVersion: '1', rendererVersion: '0.1.0',
  source: Object.freeze({ vaultPath: file.path, modifiedAt: 1, sourceHash: 'SOURCE_HASH' }),
  theme: Object.freeze({ id: 'native', version: '1.0.0', contentHash: 'THEME_HASH' }),
  metadata: Object.freeze({ title: 'Synthetic article', author: '', digest: '', cover: null, contentSourceUrl: '' }),
  canonicalHtml: '<section class="wechat-article"><p>Body</p></section>',
  plainText: 'Body', assets: Object.freeze([]), diagnostics: Object.freeze([]), contentHash: 'CONTENT_HASH',
});
const cover: Readonly<UploadImage> = Object.freeze({
  bytes: Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  mimeType: 'image/png', filename: 'cover.png',
});

function harness(local: Readonly<SyncedDraftState> | null = null) {
  const events: string[] = [];
  const receipts: RecoveryReceipt[] = [];
  const commit = vi.fn(async (_file: VaultFileRef, _state: Readonly<SyncedDraftState>) => { events.push('frontmatter'); });
  const addDraft = vi.fn(async () => {
    events.push('remote');
    return { mediaId: 'TEST_MEDIA_ID', operation: 'CREATE' as const };
  });
  const updateDraft = vi.fn(async () => {
    events.push('remote');
    return { mediaId: 'TEST_MEDIA_ID', operation: 'UPDATE' as const };
  });
  const getValidToken = vi.fn(async () => 'TEST_ACCESS_TOKEN');
  const resolveBodyAssets = vi.fn(async () => ({ html: artifact.canonicalHtml, uploadedAssetIds: [] as string[] }));
  const uploadCover = vi.fn(async () => ({ mediaId: 'TEST_COVER_MEDIA_ID' }));
  const getDraft = vi.fn(async () => local === null ? null : ({
    mediaId: local.draftId, articles: [], updateTime: 1,
  }));
  const record = vi.fn(async (receipt: Readonly<RecoveryReceipt>) => {
    events.push('receipt');
    receipts.push({ ...receipt });
  });
  const resolve = vi.fn(async (taskId: string) => {
    const index = receipts.findIndex(item => item.taskId === taskId);
    const found = receipts[index];
    if (found !== undefined) receipts[index] = { ...found, status: 'RESOLVED' };
  });
  const currentSourceHash = vi.fn(async () => 'SOURCE_HASH');
  const ports: PublishCoordinatorPorts = {
    preflight: { run: () => Object.freeze({ ok: true, blocking: [], warnings: [], info: [] }) },
    tokens: { getValidToken },
    assets: { resolveBodyAssets, uploadCover },
    drafts: {
      addDraft,
      updateDraft,
      getDraft,
    },
    state: { read: vi.fn(async () => local), commit },
    receipts: {
      record,
      resolve,
    },
    currentSourceHash,
  };
  const coordinator = new PublishCoordinator(ports, () => 1000, () => 'TASK_1');
  return {
    coordinator, ports, events, receipts, addDraft, updateDraft, getDraft, commit,
    getValidToken, resolveBodyAssets, uploadCover, record, resolve, currentSourceHash,
  };
}

const command = Object.freeze({
  file,
  artifact,
  accountHash: 'ACCOUNT_A',
  cover,
  coverHash: 'COVER_HASH',
});

describe('PublishCoordinator', () => {
  it('creates remotely, records recovery first, then commits Frontmatter', async () => {
    const current = harness();

    const outcome = await current.coordinator.publish(command);

    expect(outcome).toMatchObject({ state: 'LOCAL_COMMITTED', action: 'CREATE', mediaId: 'TEST_MEDIA_ID' });
    expect(current.events).toEqual(['remote', 'receipt', 'frontmatter']);
    expect(current.receipts[0]?.status).toBe('RESOLVED');
    expect(typeof current.receipts[0]?.contentHash).toBe('string');
  });

  it('does not retry a timed-out draft create', async () => {
    const current = harness();
    current.addDraft.mockRejectedValue(new PublicError({
      code: 'DRAFT_COMMIT_AMBIGUOUS', stage: 'DRAFT_CREATE', errcode: null,
      errmsg: 'timed out', rid: null, remoteEffect: 'UNKNOWN', retryable: false,
      nextAction: 'Reconcile.',
    }));

    const outcome = await current.coordinator.publish(command);

    expect(outcome.state).toBe('AMBIGUOUS');
    expect(current.addDraft).toHaveBeenCalledOnce();
    expect(current.receipts[0]).toMatchObject({ operation: 'CREATE', status: 'UNRESOLVED' });
    expect(current.commit).not.toHaveBeenCalled();
  });

  it('returns REMOTE_COMMITTED and retains receipt when Frontmatter commit fails', async () => {
    const current = harness();
    current.commit.mockRejectedValue(new PublicError({
      code: 'LOCAL_STATE_WRITE_FAILED', stage: 'LOCAL_STATE', errcode: null,
      errmsg: 'read only', rid: null, remoteEffect: 'COMMITTED', retryable: true,
      nextAction: 'Repair local state.',
    }));

    const outcome = await current.coordinator.publish(command);

    expect(outcome).toMatchObject({ state: 'REMOTE_COMMITTED', mediaId: 'TEST_MEDIA_ID' });
    expect(current.receipts[0]?.status).toBe('UNRESOLVED');
  });

  it('collapses concurrent publishes for the same account and note', async () => {
    const current = harness();

    const [first, second] = await Promise.all([
      current.coordinator.publish(command),
      current.coordinator.publish(command),
    ]);

    expect(first).toEqual(second);
    expect(current.addDraft).toHaveBeenCalledOnce();
  });

  it('updates changed drafts and skips unchanged drafts without uploading', async () => {
    const changed = harness(Object.freeze({
      draftId: 'TEST_MEDIA_ID', accountId: 'ACCOUNT_A', contentHash: 'OLD',
      themeId: 'native', themeVersion: '1.0.0', coverHash: 'OLD', syncedAt: 'old',
    }));
    await expect(changed.coordinator.publish(command)).resolves.toMatchObject({
      state: 'LOCAL_COMMITTED', action: 'UPDATE', mediaId: 'TEST_MEDIA_ID',
    });
    expect(changed.updateDraft).toHaveBeenCalledOnce();
    expect(changed.addDraft).not.toHaveBeenCalled();

    const unchanged = harness(Object.freeze({
      draftId: 'TEST_MEDIA_ID', accountId: 'ACCOUNT_A', contentHash: artifact.contentHash,
      themeId: artifact.theme.id, themeVersion: artifact.theme.version,
      coverHash: command.coverHash, syncedAt: 'old',
    }));
    await expect(unchanged.coordinator.publish(command)).resolves.toMatchObject({
      state: 'LOCAL_COMMITTED', action: 'SKIP', mediaId: 'TEST_MEDIA_ID',
    });
    expect(unchanged.resolveBodyAssets).not.toHaveBeenCalled();
    expect(unchanged.updateDraft).not.toHaveBeenCalled();
  });

  it('blocks account mismatch before token access and never recreates a missing remote draft', async () => {
    const mismatch = harness(Object.freeze({
      draftId: 'TEST_MEDIA_ID', accountId: 'ACCOUNT_B', contentHash: 'OLD',
      themeId: 'native', themeVersion: '1.0.0', coverHash: 'OLD', syncedAt: 'old',
    }));
    await expect(mismatch.coordinator.publish(command)).resolves.toMatchObject({
      state: 'FAILED', error: { code: 'DRAFT_ACCOUNT_MISMATCH' },
    });
    expect(mismatch.getValidToken).not.toHaveBeenCalled();

    const missing = harness(Object.freeze({
      draftId: 'TEST_MEDIA_ID', accountId: 'ACCOUNT_A', contentHash: 'OLD',
      themeId: 'native', themeVersion: '1.0.0', coverHash: 'OLD', syncedAt: 'old',
    }));
    missing.getDraft.mockResolvedValue(null);
    await expect(missing.coordinator.publish(command)).resolves.toMatchObject({
      state: 'FAILED', error: { code: 'REMOTE_DRAFT_MISSING' },
    });
    expect(missing.addDraft).not.toHaveBeenCalled();
    expect(missing.updateDraft).not.toHaveBeenCalled();
  });

  it('fails safely before draft commit when token or image preparation fails', async () => {
    const token = harness();
    token.getValidToken.mockRejectedValue(new Error('synthetic token failure'));
    await expect(token.coordinator.publish(command)).resolves.toMatchObject({
      state: 'FAILED', error: { stage: 'TOKEN', remoteEffect: 'NONE' },
    });
    expect(token.addDraft).not.toHaveBeenCalled();

    const image = harness();
    image.resolveBodyAssets.mockRejectedValue(new Error('synthetic image failure'));
    await expect(image.coordinator.publish(command)).resolves.toMatchObject({
      state: 'FAILED', error: { stage: 'UPLOAD_BODY_IMAGE', remoteEffect: 'NONE' },
    });
    expect(image.addDraft).not.toHaveBeenCalled();
  });

  it('reports edits made after the frozen artifact was confirmed', async () => {
    const current = harness();
    current.currentSourceHash.mockResolvedValue('NEW_SOURCE_HASH');

    await expect(current.coordinator.publish(command)).resolves.toMatchObject({
      state: 'LOCAL_COMMITTED', hasUnsyncedChanges: true,
    });
  });

  it('never reports a remote success as a safe failure when receipt persistence fails', async () => {
    const current = harness();
    current.record.mockRejectedValue(new Error('synthetic receipt failure'));

    await expect(current.coordinator.publish(command)).resolves.toMatchObject({
      state: 'REMOTE_COMMITTED',
      error: { code: 'RECOVERY_RECEIPT_WRITE_FAILED', remoteEffect: 'COMMITTED' },
    });
    expect(current.commit).not.toHaveBeenCalled();
  });
});
