import { describe, expect, it, vi } from 'vitest';

import type { VaultFileRef } from '../../../src/domain/ports';
import {
  PublishStateStore,
  type FrontmatterMutationPort,
  type FrontmatterReadPort,
  type SyncedDraftState,
} from '../../../src/publish/publish-state-store';

const file: VaultFileRef = { path: 'article.md', basename: 'article', modifiedAt: 1 };
const synced: Readonly<SyncedDraftState> = Object.freeze({
  draftId: 'TEST_MEDIA_ID',
  accountId: 'ACCOUNT_HASH',
  contentHash: 'CONTENT_HASH',
  themeId: 'native',
  themeVersion: '1.0.0',
  coverHash: 'COVER_HASH',
  syncedAt: '2026-08-19T00:00:00.000Z',
});

function harness(initial: Record<string, unknown>) {
  const frontmatter = { ...initial };
  const reader: FrontmatterReadPort = { getFrontmatter: () => frontmatter };
  const processFrontmatter = vi.fn(async (_file: VaultFileRef, mutate: (value: Record<string, unknown>) => void) => {
    mutate(frontmatter);
  });
  const writer: FrontmatterMutationPort = { processFrontmatter };
  return { store: new PublishStateStore(reader, writer), frontmatter, processFrontmatter };
}

describe('PublishStateStore', () => {
  it('updates owned fields without deleting unknown frontmatter', async () => {
    const current = harness({ title: 'Keep title', custom_user_field: 'keep-me' });

    await current.store.commit(file, synced);

    expect(current.frontmatter).toMatchObject({
      title: 'Keep title',
      custom_user_field: 'keep-me',
      'wechat-draft-id': 'TEST_MEDIA_ID',
      'wechat-account-id': 'ACCOUNT_HASH',
      'wechat-content-hash': 'CONTENT_HASH',
      'wechat-theme-id': 'native',
      'wechat-theme-version': '1.0.0',
      'wechat-cover-hash': 'COVER_HASH',
      'wechat-synced-at': '2026-08-19T00:00:00.000Z',
    });
    expect(await current.store.read(file)).toEqual(synced);
  });

  it('removes only local association fields and never calls a remote API', async () => {
    const current = harness({
      title: 'Keep title',
      custom_user_field: 'keep-me',
      'wechat-draft-id': 'TEST_MEDIA_ID',
      'wechat-account-id': 'ACCOUNT_HASH',
      'wechat-content-hash': 'CONTENT_HASH',
      'wechat-theme-id': 'native',
      'wechat-theme-version': '1.0.0',
      'wechat-cover-hash': 'COVER_HASH',
      'wechat-synced-at': '2026-08-19T00:00:00.000Z',
    });

    await current.store.unlink(file);

    expect(current.frontmatter).toEqual({ title: 'Keep title', custom_user_field: 'keep-me' });
  });

  it('returns a stable local-state error when Frontmatter is read-only', async () => {
    const reader: FrontmatterReadPort = { getFrontmatter: () => ({}) };
    const writer: FrontmatterMutationPort = {
      processFrontmatter: vi.fn(async () => { throw new Error('read only'); }),
    };

    await expect(new PublishStateStore(reader, writer).commit(file, synced)).rejects.toMatchObject({
      code: 'LOCAL_STATE_WRITE_FAILED', stage: 'LOCAL_STATE', remoteEffect: 'COMMITTED',
    });
  });
});
