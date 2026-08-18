import { describe, expect, it } from 'vitest';

import { decidePublish } from '../../../src/publish/publish-decision';
import type { SyncedDraftState } from '../../../src/publish/publish-state-store';

const hashes = Object.freeze({
  contentHash: 'CONTENT_NEW', themeId: 'native', themeVersion: '1.0.0', coverHash: 'COVER_NEW',
});

function local(overrides: Partial<SyncedDraftState> = {}): Readonly<SyncedDraftState> {
  return Object.freeze({
    draftId: 'TEST_MEDIA_ID', accountId: 'ACCOUNT_A', contentHash: 'CONTENT_OLD',
    themeId: 'native', themeVersion: '1.0.0', coverHash: 'COVER_OLD', syncedAt: 'old',
    ...overrides,
  });
}

describe('decidePublish', () => {
  it('creates when no local association exists', () => {
    expect(decidePublish(null, 'NOT_CHECKED', hashes, 'ACCOUNT_A').kind).toBe('CREATE');
  });

  it('blocks an association owned by another account', () => {
    expect(decidePublish(local({ accountId: 'ACCOUNT_B' }), 'EXISTS', hashes, 'ACCOUNT_A').kind)
      .toBe('BLOCK_ACCOUNT_MISMATCH');
  });

  it('requires confirmation instead of silently recreating a missing remote draft', () => {
    expect(decidePublish(local(), 'MISSING', hashes, 'ACCOUNT_A').kind).toBe('BLOCK_REMOTE_MISSING');
  });

  it('skips unchanged drafts and updates changed drafts', () => {
    expect(decidePublish(local({
      contentHash: hashes.contentHash,
      themeId: hashes.themeId,
      themeVersion: hashes.themeVersion,
      coverHash: hashes.coverHash,
    }), 'EXISTS', hashes, 'ACCOUNT_A').kind).toBe('SKIP');
    expect(decidePublish(local(), 'EXISTS', hashes, 'ACCOUNT_A').kind).toBe('UPDATE');
  });
});
