import type { SyncedDraftState } from './publish-state-store';

export interface PublishHashes {
  contentHash: string;
  themeId: string;
  themeVersion: string;
  coverHash: string;
}

export type RemoteDraftState = 'NOT_CHECKED' | 'EXISTS' | 'MISSING';

export type PublishDecision = Readonly<{
  kind: 'CREATE' | 'UPDATE' | 'SKIP' | 'BLOCK_ACCOUNT_MISMATCH' | 'BLOCK_REMOTE_MISSING';
  mediaId: string | null;
}>;

export function decidePublish(
  local: Readonly<SyncedDraftState> | null,
  remote: RemoteDraftState,
  hashes: Readonly<PublishHashes>,
  accountHash: string,
): PublishDecision {
  if (local === null) return Object.freeze({ kind: 'CREATE', mediaId: null });
  if (local.accountId !== accountHash) {
    return Object.freeze({ kind: 'BLOCK_ACCOUNT_MISMATCH', mediaId: local.draftId });
  }
  if (remote === 'MISSING') {
    return Object.freeze({ kind: 'BLOCK_REMOTE_MISSING', mediaId: local.draftId });
  }
  const unchanged = local.contentHash === hashes.contentHash
    && local.themeId === hashes.themeId
    && local.themeVersion === hashes.themeVersion
    && local.coverHash === hashes.coverHash;
  return Object.freeze({
    kind: unchanged ? 'SKIP' : 'UPDATE',
    mediaId: local.draftId,
  });
}
