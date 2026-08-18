import type { MediaCacheRecord } from '../settings/model';

const MAX_ENTRIES = 500;

export interface AssetCacheDataPort {
  entries: readonly Readonly<MediaCacheRecord>[];
  save(entries: readonly Readonly<MediaCacheRecord>[]): Promise<void>;
}

export interface AssetCacheValue {
  mediaId: string | null;
  url: string | null;
}

function cacheKey(accountHash: string, kind: 'body' | 'cover', contentHash: string): string {
  return `${accountHash}:${kind}:${contentHash}`;
}

function frozen(entry: MediaCacheRecord): Readonly<MediaCacheRecord> {
  return Object.freeze(entry);
}

export class AssetCache {
  constructor(
    private readonly data: AssetCacheDataPort,
    private readonly now: () => number = Date.now,
  ) {}

  async get(
    accountHash: string,
    kind: 'body' | 'cover',
    contentHash: string,
  ): Promise<Readonly<MediaCacheRecord> | null> {
    const key = cacheKey(accountHash, kind, contentHash);
    const found = this.data.entries.find(entry => entry.key === key);
    if (found === undefined) return null;
    const updated = frozen({ ...found, lastUsedAt: this.now() });
    await this.data.save(Object.freeze(this.data.entries.map(entry => (
      entry.key === key ? updated : entry
    ))));
    return updated;
  }

  async put(
    accountHash: string,
    kind: 'body' | 'cover',
    contentHash: string,
    value: Readonly<AssetCacheValue>,
  ): Promise<Readonly<MediaCacheRecord>> {
    const key = cacheKey(accountHash, kind, contentHash);
    const timestamp = this.now();
    const entry = frozen({
      key,
      accountHash,
      kind,
      contentHash,
      mediaId: value.mediaId,
      url: value.url,
      createdAt: timestamp,
      lastUsedAt: timestamp,
    });
    const entries = [...this.data.entries.filter(item => item.key !== key), entry]
      .sort((left, right) => (
        right.lastUsedAt - left.lastUsedAt
        || right.createdAt - left.createdAt
        || left.key.localeCompare(right.key)
      ))
      .slice(0, MAX_ENTRIES);
    await this.data.save(Object.freeze(entries));
    return entry;
  }
}
