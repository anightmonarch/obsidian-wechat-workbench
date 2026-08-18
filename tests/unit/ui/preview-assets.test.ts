import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

import type { AssetSlot } from '../../../src/domain/artifact';
import type { BinaryFilePort } from '../../../src/domain/ports';
import type { DiagramRenderer } from '../../../src/render/diagram-renderer';
import { WorkbenchPreviewAssetResolver } from '../../../src/ui/preview-asset-resolver';

const png = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
]);

function localAsset(contentHash: string): Readonly<AssetSlot> {
  return Object.freeze({
    id: 'asset:local', kind: 'local-image', source: 'assets/local.png', status: 'resolved',
    contentHash, resolvedUrl: null,
  });
}

describe('WorkbenchPreviewAssetResolver', () => {
  it('returns a bounded local Data URL only when bytes still match the artifact hash', async () => {
    const readBinary = vi.fn(async () => png);
    const files: BinaryFilePort = { resolveLink: vi.fn(), readBinary };
    const diagrams = {} as DiagramRenderer;
    const resolver = new WorkbenchPreviewAssetResolver(files, diagrams);
    const hash = createHash('sha256').update(png).digest('hex');

    await expect(resolver.resolve(localAsset(hash))).resolves.toMatch(/^data:image\/png;base64,/u);
    await expect(resolver.resolve(localAsset('stale-hash'))).resolves.toBeNull();
    expect(readBinary).toHaveBeenCalledTimes(2);
  });

  it('resolves generated diagrams locally and never resolves remote images', async () => {
    const files: BinaryFilePort = { resolveLink: vi.fn(), readBinary: vi.fn() };
    const renderMermaid = vi.fn(async () => ({
      id: 'asset:diagram', source: 'graph TD; A-->B', mimeType: 'image/png' as const,
      bytes: png, contentHash: 'generated',
    }));
    const diagrams = { renderMermaid } as unknown as DiagramRenderer;
    const resolver = new WorkbenchPreviewAssetResolver(files, diagrams);
    const diagram: Readonly<AssetSlot> = Object.freeze({
      id: 'asset:diagram', kind: 'generated-diagram', source: 'graph TD; A-->B',
      status: 'unresolved', contentHash: null, resolvedUrl: null,
    });
    const remote: Readonly<AssetSlot> = Object.freeze({
      id: 'asset:remote', kind: 'remote-image', source: 'https://example.test/image.png',
      status: 'unresolved', contentHash: null, resolvedUrl: null,
    });

    await expect(resolver.resolve(diagram)).resolves.toMatch(/^data:image\/png;base64,/u);
    await expect(resolver.resolve(remote)).resolves.toBeNull();
    expect(renderMermaid).toHaveBeenCalledWith('graph TD; A-->B');
  });
});
