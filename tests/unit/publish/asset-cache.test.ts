import { describe, expect, it } from 'vitest';

import { AssetCache, type AssetCacheDataPort } from '../../../src/publish/asset-cache';

class MemoryData implements AssetCacheDataPort {
  entries: AssetCacheDataPort['entries'] = Object.freeze([]);
  async save(entries: AssetCacheDataPort['entries']): Promise<void> { this.entries = entries; }
}

describe('AssetCache', () => {
  it('caps persisted records at 500 and evicts the least recently used', async () => {
    const data = new MemoryData();
    let now = 0;
    const cache = new AssetCache(data, () => now += 1);

    for (let index = 0; index < 501; index += 1) {
      await cache.put('ACCOUNT', 'body', `hash-${index}`, { mediaId: null, url: `https://example.test/${index}` });
    }

    expect(data.entries).toHaveLength(500);
    expect(data.entries.some(entry => entry.contentHash === 'hash-0')).toBe(false);
    expect(data.entries.some(entry => entry.contentHash === 'hash-500')).toBe(true);
  });

  it('refreshes last-used time without changing the cache key', async () => {
    const data = new MemoryData();
    let now = 10;
    const cache = new AssetCache(data, () => now);
    await cache.put('ACCOUNT', 'cover', 'hash', { mediaId: 'TEST_MEDIA_ID', url: null });
    now = 20;

    const found = await cache.get('ACCOUNT', 'cover', 'hash');

    expect(found?.key).toBe('ACCOUNT:cover:hash');
    expect(found?.lastUsedAt).toBe(20);
    expect(data.entries[0]?.lastUsedAt).toBe(20);
  });
});
