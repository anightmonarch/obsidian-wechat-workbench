import { describe, expect, it, vi } from 'vitest';

import { AmbiguousReconciler } from '../../../src/publish/reconcile-ambiguous';
import { normalizedFinalHtmlHash } from '../../../src/publish/publish-content';
import type { RecoveryReceipt } from '../../../src/publish/recovery-receipt-store';

const html = '<section class="wechat-article"><p>Body</p></section>';
const contentHash = normalizedFinalHtmlHash(html);

function receipt(operation: 'CREATE' | 'UPDATE'): Readonly<RecoveryReceipt> {
  return Object.freeze({
    taskId: 'TASK_1', accountHash: 'ACCOUNT_A',
    mediaId: operation === 'UPDATE' ? 'TEST_MEDIA_ID' : '', operation,
    contentHash, themeHash: 'THEME_HASH', coverHash: 'COVER_HASH',
    remoteTimestamp: 10_000, status: 'UNRESOLVED',
  });
}

describe('AmbiguousReconciler', () => {
  it('reconciles an update only when the known draft content matches', async () => {
    const drafts = {
      getDraft: vi.fn(async () => ({
        mediaId: 'TEST_MEDIA_ID', articles: [{ content: html }], updateTime: 10,
      })),
      listRecentDrafts: vi.fn(),
    };

    await expect(new AmbiguousReconciler(drafts).reconcile(receipt('UPDATE'), 'TEST_ACCESS_TOKEN'))
      .resolves.toMatchObject({ kind: 'MATCHED', mediaId: 'TEST_MEDIA_ID' });
    expect(drafts.listRecentDrafts).not.toHaveBeenCalled();
  });

  it('requires exactly one recent title/content-independent hash match for create', async () => {
    const match = { mediaId: 'TEST_MEDIA_ID', articles: [{ content: html }], updateTime: 10 };
    const drafts = {
      getDraft: vi.fn(),
      listRecentDrafts: vi.fn(async () => ({ totalCount: 1, itemCount: 1, items: [match] })),
    };
    const reconciler = new AmbiguousReconciler(drafts);

    await expect(reconciler.reconcile(receipt('CREATE'), 'TEST_ACCESS_TOKEN'))
      .resolves.toMatchObject({ kind: 'MATCHED', mediaId: 'TEST_MEDIA_ID' });

    drafts.listRecentDrafts.mockResolvedValue({ totalCount: 2, itemCount: 2, items: [match, { ...match, mediaId: 'TEST_MEDIA_ID_2' }] });
    await expect(reconciler.reconcile(receipt('CREATE'), 'TEST_ACCESS_TOKEN'))
      .resolves.toMatchObject({ kind: 'NEEDS_CONFIRMATION' });
  });
});
