import type { RemoteDraft, RemoteDraftPage } from '../wechat/wechat-types';
import { normalizedFinalHtmlHash } from './publish-content';
import type { RecoveryReceipt } from './recovery-receipt-store';

const RECONCILIATION_WINDOW_MS = 5 * 60 * 1000;

export interface DraftReadPort {
  getDraft(mediaId: string, token: string): Promise<Readonly<RemoteDraft> | null>;
  listRecentDrafts(offset: number, count: number, token: string): Promise<Readonly<RemoteDraftPage>>;
}

export type ReconciliationResult = Readonly<{
  kind: 'MATCHED' | 'NOT_FOUND' | 'MISMATCH' | 'NEEDS_CONFIRMATION';
  mediaId: string | null;
}>;

function articleContent(draft: Readonly<RemoteDraft>): string | null {
  const content = draft.articles[0]?.content;
  return typeof content === 'string' ? content : null;
}

function contentMatches(draft: Readonly<RemoteDraft>, expectedHash: string): boolean {
  const content = articleContent(draft);
  return content !== null && normalizedFinalHtmlHash(content) === expectedHash;
}

export class AmbiguousReconciler {
  constructor(private readonly drafts: DraftReadPort) {}

  async reconcile(
    receipt: Readonly<RecoveryReceipt>,
    accessToken: string,
  ): Promise<ReconciliationResult> {
    if (receipt.operation === 'UPDATE') {
      const draft = await this.drafts.getDraft(receipt.mediaId, accessToken);
      if (draft === null) return Object.freeze({ kind: 'NOT_FOUND', mediaId: receipt.mediaId });
      return Object.freeze({
        kind: contentMatches(draft, receipt.contentHash) ? 'MATCHED' : 'MISMATCH',
        mediaId: receipt.mediaId,
      });
    }

    const recent = await this.drafts.listRecentDrafts(0, 20, accessToken);
    const matches = recent.items.filter(draft => {
      const timestamp = draft.updateTime * 1000;
      return Math.abs(timestamp - receipt.remoteTimestamp) <= RECONCILIATION_WINDOW_MS
        && contentMatches(draft, receipt.contentHash);
    });
    if (matches.length === 0) return Object.freeze({ kind: 'NOT_FOUND', mediaId: null });
    if (matches.length > 1) return Object.freeze({ kind: 'NEEDS_CONFIRMATION', mediaId: null });
    return Object.freeze({ kind: 'MATCHED', mediaId: matches[0]?.mediaId ?? null });
  }
}
