import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

import type { RenderArtifact } from '../../../src/domain/artifact';
import type { BinaryFilePort } from '../../../src/domain/ports';
import { AssetCache, type AssetCacheDataPort } from '../../../src/publish/asset-cache';
import {
  AssetUploadService,
  type MediaUploadPort,
  type PublishAccount,
} from '../../../src/publish/asset-upload-service';
import type { RemoteImageFetcher } from '../../../src/security/remote-image-fetcher';
import type { DiagramRenderer } from '../../../src/render/diagram-renderer';

const png = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
]);
const imageHash = createHash('sha256').update(png).digest('hex');

class MemoryCacheData implements AssetCacheDataPort {
  entries = [] as AssetCacheDataPort['entries'];
  async save(entries: AssetCacheDataPort['entries']): Promise<void> { this.entries = entries; }
}

function artifact(): Readonly<RenderArtifact> {
  return Object.freeze({
    artifactVersion: '1', rendererVersion: '0.1.0',
    source: Object.freeze({ vaultPath: 'article.md', modifiedAt: 1, sourceHash: 'source' }),
    theme: Object.freeze({ id: 'native', version: '1.0.0', contentHash: 'theme' }),
    metadata: Object.freeze({ title: 'Article', author: '', digest: '', cover: null, contentSourceUrl: '' }),
    canonicalHtml: '<section class="wechat-article"><p><img data-asset-id="asset:local"></p><p><img data-asset-id="asset:local"></p></section>',
    plainText: 'Article',
    assets: Object.freeze([Object.freeze({
      id: 'asset:local', kind: 'local-image', source: 'assets/local.png', status: 'resolved',
      contentHash: imageHash, resolvedUrl: null,
    })]),
    diagnostics: Object.freeze([]), contentHash: 'content',
  });
}

const accountA: Readonly<PublishAccount> = Object.freeze({
  accountHash: 'ACCOUNT_A', accessToken: 'TEST_ACCESS_TOKEN_A',
});
const accountB: Readonly<PublishAccount> = Object.freeze({
  accountHash: 'ACCOUNT_B', accessToken: 'TEST_ACCESS_TOKEN_B',
});

function harness() {
  const readBinary = vi.fn(async () => png);
  const files: BinaryFilePort = { resolveLink: vi.fn(), readBinary };
  const uploadBodyImage = vi.fn(async () => ({ url: 'https://mmbiz.qpic.cn/TEST_IMAGE_URL' }));
  const uploadCover = vi.fn(async () => ({ mediaId: 'TEST_MEDIA_ID', url: 'https://mmbiz.qpic.cn/TEST_COVER_URL' }));
  const media: MediaUploadPort = { uploadBodyImage, uploadCover };
  const data = new MemoryCacheData();
  const cache = new AssetCache(data, () => 1000);
  const service = new AssetUploadService(
    files,
    {} as RemoteImageFetcher,
    {} as DiagramRenderer,
    media,
    cache,
  );
  return { service, uploadBodyImage, uploadCover, readBinary, data };
}

describe('AssetUploadService', () => {
  it('uploads identical body image once per account and content hash', async () => {
    const { service, uploadBodyImage } = harness();

    const first = await service.resolveBodyAssets(artifact(), accountA);
    const second = await service.resolveBodyAssets(artifact(), accountA);

    expect(uploadBodyImage).toHaveBeenCalledOnce();
    expect(first.html.match(/https:\/\/mmbiz\.qpic\.cn\/TEST_IMAGE_URL/gu)).toHaveLength(2);
    expect(second.html).toBe(first.html);
    expect(first.html).not.toContain('data-asset-id');
  });

  it('does not share media cache across accounts', async () => {
    const { service, uploadBodyImage } = harness();

    await service.resolveBodyAssets(artifact(), accountA);
    await service.resolveBodyAssets(artifact(), accountB);

    expect(uploadBodyImage).toHaveBeenCalledTimes(2);
  });

  it('uploads and caches cover material separately from body images', async () => {
    const { service, uploadCover } = harness();

    const first = await service.uploadCover({ bytes: png, mimeType: 'image/png', filename: 'cover.png' }, accountA);
    const second = await service.uploadCover({ bytes: png, mimeType: 'image/png', filename: 'cover.png' }, accountA);

    expect(uploadCover).toHaveBeenCalledOnce();
    expect(first).toEqual({ mediaId: 'TEST_MEDIA_ID', url: 'https://mmbiz.qpic.cn/TEST_COVER_URL' });
    expect(second).toEqual(first);
  });

  it('never caches a failed upload', async () => {
    const current = harness();
    current.uploadBodyImage.mockRejectedValueOnce(new Error('synthetic upload failure'));

    await expect(current.service.resolveBodyAssets(artifact(), accountA)).rejects.toThrow('synthetic upload failure');
    await current.service.resolveBodyAssets(artifact(), accountA);

    expect(current.uploadBodyImage).toHaveBeenCalledTimes(2);
    expect(current.data.entries).toHaveLength(1);
  });
});
