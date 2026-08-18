import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

import type { RenderArtifact } from '../../../src/domain/artifact';
import type { BinaryFilePort } from '../../../src/domain/ports';
import type { DiagramRenderer } from '../../../src/render/diagram-renderer';
import {
  ClipboardAssetResolver,
  ClipboardResolutionError,
} from '../../../src/clipboard/asset-resolver';

const png = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
]);

function artifact(assets: RenderArtifact['assets'], html: string): Readonly<RenderArtifact> {
  return Object.freeze({
    artifactVersion: '1', rendererVersion: '0.1.0',
    source: Object.freeze({ vaultPath: 'article.md', modifiedAt: 1, sourceHash: 'source' }),
    theme: Object.freeze({ id: 'native', version: '1.0.0', contentHash: 'theme' }),
    metadata: Object.freeze({ title: 'Article', author: '', digest: '', cover: null, contentSourceUrl: '' }),
    canonicalHtml: html, plainText: 'Article', assets: Object.freeze([...assets]),
    diagnostics: Object.freeze([]), contentHash: 'content',
  });
}

function files(bytes: Uint8Array = png): { port: BinaryFilePort; readBinary: ReturnType<typeof vi.fn> } {
  const readBinary = vi.fn(async () => bytes);
  return { port: { resolveLink: vi.fn(), readBinary }, readBinary };
}

describe('ClipboardAssetResolver', () => {
  it('resolves local and generated images to Data URLs and remote images to HTTPS', async () => {
    const localHash = createHash('sha256').update(png).digest('hex');
    const input = artifact([
      Object.freeze({ id: 'asset:local', kind: 'local-image', source: 'local.png', status: 'resolved', contentHash: localHash, resolvedUrl: null }),
      Object.freeze({ id: 'asset:remote', kind: 'remote-image', source: 'https://example.test/image.png', status: 'unresolved', contentHash: null, resolvedUrl: null }),
      Object.freeze({ id: 'asset:diagram', kind: 'generated-diagram', source: 'graph TD; A-->B', status: 'unresolved', contentHash: null, resolvedUrl: null }),
    ], '<section class="wechat-article"><img data-asset-id="asset:local"><img data-asset-id="asset:remote"><figure data-asset-id="asset:diagram"></figure></section>');
    const binary = files();
    const renderMermaid = vi.fn(async () => ({
      id: 'asset:diagram', source: 'graph TD; A-->B', mimeType: 'image/png' as const,
      bytes: png, contentHash: localHash,
    }));
    const resolver = new ClipboardAssetResolver(
      binary.port,
      { renderMermaid } as unknown as DiagramRenderer,
    );

    const html = await resolver.resolve(input);

    expect(html).toContain('src="data:image/png;base64,');
    expect(html).toContain('src="https://example.test/image.png"');
    expect(html).not.toContain('data-asset-id');
    expect(binary.readBinary).toHaveBeenCalledOnce();
    expect(renderMermaid).toHaveBeenCalledOnce();
  });

  it('fails the whole projection when a local image is unreadable or changed', async () => {
    const unreadable: BinaryFilePort = {
      resolveLink: vi.fn(),
      readBinary: vi.fn(async () => { throw new Error('unreadable'); }),
    };
    const local = Object.freeze({
      id: 'asset:local', kind: 'local-image' as const, source: 'local.png', status: 'resolved' as const,
      contentHash: 'expected', resolvedUrl: null,
    });
    const input = artifact([local], '<section class="wechat-article"><img data-asset-id="asset:local"></section>');

    await expect(new ClipboardAssetResolver(unreadable, {} as DiagramRenderer).resolve(input))
      .rejects.toMatchObject({ code: 'LOCAL_ASSET_UNREADABLE', source: 'local.png' });

    const changed = files();
    await expect(new ClipboardAssetResolver(changed.port, {} as DiagramRenderer).resolve(input))
      .rejects.toMatchObject({ code: 'LOCAL_ASSET_CHANGED', source: 'local.png' });
  });

  it('rejects unsupported magic bytes and per-image size limits', async () => {
    const local = Object.freeze({
      id: 'asset:local', kind: 'local-image' as const, source: 'local.bin', status: 'resolved' as const,
      contentHash: null, resolvedUrl: null,
    });
    const input = artifact([local], '<section class="wechat-article"><img data-asset-id="asset:local"></section>');

    await expect(new ClipboardAssetResolver(files(Uint8Array.from([1, 2, 3])).port, {} as DiagramRenderer).resolve(input))
      .rejects.toMatchObject({ code: 'IMAGE_TYPE_UNSUPPORTED' });

    const oversized = new Uint8Array(5 * 1024 * 1024 + 1);
    oversized.set(png.slice(0, 8));
    await expect(new ClipboardAssetResolver(files(oversized).port, {} as DiagramRenderer).resolve(input))
      .rejects.toMatchObject({ code: 'IMAGE_TOO_LARGE' });
  });

  it('rejects articles whose decoded local images exceed the total limit', async () => {
    const bytes = new Uint8Array(4 * 1024 * 1024 + 256 * 1024);
    bytes.set(png.slice(0, 8));
    const assets = Array.from({ length: 5 }, (_, index) => Object.freeze({
      id: `asset:${index}`, kind: 'local-image' as const, source: `image-${index}.png`,
      status: 'resolved' as const, contentHash: null, resolvedUrl: null,
    }));
    const html = `<section class="wechat-article">${assets.map(item => (
      `<img data-asset-id="${item.id}">`
    )).join('')}</section>`;

    await expect(new ClipboardAssetResolver(files(bytes).port, {} as DiagramRenderer)
      .resolve(artifact(assets, html)))
      .rejects.toMatchObject({ code: 'TOTAL_IMAGE_BYTES_EXCEEDED' });
  });

  it('reports an unresolved slot instead of silently dropping it', async () => {
    const input = artifact([], '<section class="wechat-article"><img data-asset-id="asset:missing"></section>');

    await expect(new ClipboardAssetResolver(files().port, {} as DiagramRenderer).resolve(input))
      .rejects.toBeInstanceOf(ClipboardResolutionError);
    await expect(new ClipboardAssetResolver(files().port, {} as DiagramRenderer).resolve(input))
      .rejects.toMatchObject({ code: 'ASSET_SLOT_UNRESOLVED' });
  });
});
