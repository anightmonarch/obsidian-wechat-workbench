import type { VaultFileRef } from '../domain/ports';
import { PublicError } from '../wechat/errors';
import { WECHAT_FRONTMATTER_FIELDS, WECHAT_OWNED_FRONTMATTER_KEYS } from './frontmatter-fields';

export interface SyncedDraftState {
  draftId: string;
  accountId: string;
  contentHash: string;
  themeId: string;
  themeVersion: string;
  coverHash: string;
  syncedAt: string;
}

export interface FrontmatterReadPort {
  getFrontmatter(path: string): Readonly<Record<string, unknown>>;
}

export interface FrontmatterMutationPort {
  processFrontmatter(
    file: VaultFileRef,
    mutate: (frontmatter: Record<string, unknown>) => void,
  ): Promise<void>;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function localWriteError(error: unknown, remoteCommitted: boolean): PublicError {
  const reason = error instanceof Error ? error.message : 'Unknown Frontmatter write failure.';
  return new PublicError({
    code: 'LOCAL_STATE_WRITE_FAILED',
    stage: 'LOCAL_STATE',
    errcode: null,
    errmsg: `Could not update local draft association: ${reason}`,
    rid: null,
    remoteEffect: remoteCommitted ? 'COMMITTED' : 'NONE',
    retryable: true,
    nextAction: 'Make the note writable, then repair the local association from the recovery receipt.',
  });
}

function associationChangedError(): PublicError {
  return new PublicError({
    code: 'DRAFT_ASSOCIATION_CHANGED',
    stage: 'LOCAL_STATE',
    errcode: null,
    errmsg: 'The local draft association changed before it could be removed.',
    rid: null,
    remoteEffect: 'NONE',
    retryable: false,
    nextAction: 'Reopen the recovery action and verify the current draft association.',
  });
}

export class PublishStateStore {
  constructor(
    private readonly reader: FrontmatterReadPort,
    private readonly writer: FrontmatterMutationPort,
  ) {}

  async read(file: VaultFileRef): Promise<Readonly<SyncedDraftState> | null> {
    const frontmatter = this.reader.getFrontmatter(file.path);
    const draftId = text(frontmatter[WECHAT_FRONTMATTER_FIELDS.draftId]);
    if (draftId.length === 0) return null;
    return Object.freeze({
      draftId,
      accountId: text(frontmatter[WECHAT_FRONTMATTER_FIELDS.accountId]),
      contentHash: text(frontmatter[WECHAT_FRONTMATTER_FIELDS.contentHash]),
      themeId: text(frontmatter[WECHAT_FRONTMATTER_FIELDS.themeId]),
      themeVersion: text(frontmatter[WECHAT_FRONTMATTER_FIELDS.themeVersion]),
      coverHash: text(frontmatter[WECHAT_FRONTMATTER_FIELDS.coverHash]),
      syncedAt: text(frontmatter[WECHAT_FRONTMATTER_FIELDS.syncedAt]),
    });
  }

  async commit(file: VaultFileRef, state: Readonly<SyncedDraftState>): Promise<void> {
    try {
      await this.writer.processFrontmatter(file, frontmatter => {
        frontmatter[WECHAT_FRONTMATTER_FIELDS.draftId] = state.draftId;
        frontmatter[WECHAT_FRONTMATTER_FIELDS.accountId] = state.accountId;
        frontmatter[WECHAT_FRONTMATTER_FIELDS.contentHash] = state.contentHash;
        frontmatter[WECHAT_FRONTMATTER_FIELDS.themeId] = state.themeId;
        frontmatter[WECHAT_FRONTMATTER_FIELDS.themeVersion] = state.themeVersion;
        frontmatter[WECHAT_FRONTMATTER_FIELDS.coverHash] = state.coverHash;
        frontmatter[WECHAT_FRONTMATTER_FIELDS.syncedAt] = state.syncedAt;
      });
    } catch (error) {
      throw localWriteError(error, true);
    }
  }

  async unlink(
    file: VaultFileRef,
    expected: Readonly<Pick<SyncedDraftState, 'draftId' | 'accountId'>>,
  ): Promise<void> {
    try {
      await this.writer.processFrontmatter(file, frontmatter => {
        if (text(frontmatter[WECHAT_FRONTMATTER_FIELDS.draftId]) !== expected.draftId
          || text(frontmatter[WECHAT_FRONTMATTER_FIELDS.accountId]) !== expected.accountId) {
          throw associationChangedError();
        }
        for (const key of WECHAT_OWNED_FRONTMATTER_KEYS) delete frontmatter[key];
      });
    } catch (error) {
      if (error instanceof PublicError) throw error;
      throw localWriteError(error, false);
    }
  }
}
