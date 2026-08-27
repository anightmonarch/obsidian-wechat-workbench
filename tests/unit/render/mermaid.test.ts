import { describe, expect, it, vi } from 'vitest';

import type { NoteSnapshot } from '../../../src/domain/article';
import {
  DiagramRenderer,
  ElectronSvgRasterizer,
  type MermaidEnginePort,
  type SvgRasterizerPort,
} from '../../../src/render/diagram-renderer';
import { RenderArtifactBuilder } from '../../../src/render/artifact-builder';
import { BUILTIN_THEMES } from '../../../src/themes/builtin';

const theme = BUILTIN_THEMES.find(item => item.manifest.id === 'native');
if (theme === undefined) throw new Error('Native theme fixture is missing.');

function snapshot(markdown: string): Readonly<NoteSnapshot> {
  return Object.freeze({
    vaultPath: 'diagram.md', basename: 'diagram', modifiedAt: 1, markdown,
    frontmatter: Object.freeze({}),
    metadata: Object.freeze({ title: 'Diagram', author: '', digest: '', cover: null, contentSourceUrl: '' }),
    selectedThemeId: 'native', sourceHash: 'diagram-source',
  });
}

describe('Mermaid resource slots', () => {
  it('turns Mermaid fences into stable unresolved generated assets', async () => {
    const markdown = '```mermaid\ngraph TD; A-->B\n```';
    const builder = new RenderArtifactBuilder();

    const first = await builder.build(snapshot(markdown), theme);
    const second = await builder.build(snapshot(markdown), theme);

    expect(first.assets).toHaveLength(1);
    expect(first.assets[0]).toMatchObject({
      kind: 'generated-diagram',
      source: 'graph TD; A-->B',
      status: 'unresolved',
      contentHash: null,
      resolvedUrl: null,
    });
    expect(first.canonicalHtml).toContain('mermaid-placeholder');
    expect(first.canonicalHtml).not.toMatch(/<svg|graph TD/iu);
    expect(first.assets).toEqual(second.assets);
  });

  it('parses in strict mode and rasterizes only when explicitly requested', async () => {
    const initialize = vi.fn();
    const parse = vi.fn(async () => undefined);
    const renderSvg = vi.fn(async () => '<svg><path /></svg>');
    const engine: MermaidEnginePort = {
      initialize,
      parse,
      renderSvg,
    };
    const toPng = vi.fn(async () => Uint8Array.from([0x89, 0x50, 0x4e, 0x47]));
    const rasterizer: SvgRasterizerPort = {
      toPng,
    };
    const renderer = new DiagramRenderer(engine, rasterizer);

    const generated = await renderer.renderMermaid('graph TD; A-->B');

    expect(initialize).toHaveBeenCalledWith(expect.objectContaining({
      startOnLoad: false,
      securityLevel: 'strict',
      deterministicIds: true,
      htmlLabels: false,
    }));
    expect(parse).toHaveBeenCalledWith('graph TD; A-->B');
    expect(toPng).toHaveBeenCalledOnce();
    expect(generated.mimeType).toBe('image/png');
    expect(generated.bytes).toEqual(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]));
  });

  it('rejects active or externally loaded SVG before Electron rasterization', async () => {
    const rasterizer = new ElectronSvgRasterizer();

    await expect(rasterizer.toPng('<svg><script>alert(1)</script></svg>')).rejects
      .toThrow('external or active resource');
    await expect(rasterizer.toPng('<svg><image href="https://example.test/a.png" /></svg>')).rejects
      .toThrow('external or active resource');
  });

  it('rasterizes safe SVG through the browser canvas in the Obsidian renderer', async () => {
    const image = class {
      naturalWidth = 100;
      naturalHeight = 50;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) { this.onload?.(); }
    };
    vi.stubGlobal('Image', image);
    const drawImage = vi.fn();
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(() => ({ drawImage }) as unknown as CanvasRenderingContext2D);
    const toDataUrl = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL')
      .mockReturnValue('data:image/png;base64,iVBORw0KGgo=');
    const canvas = document.createElement('canvas');
    vi.stubGlobal('createEl', (tag: string) => tag === 'canvas' ? canvas : document.createElement(tag));

    try {
      const bytes = await new ElectronSvgRasterizer().toPng(
        '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><rect width="100" height="50" fill="red" /></svg>',
      );
      expect(bytes).toEqual(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
      expect(drawImage).toHaveBeenCalledWith(expect.any(image), 0, 0, 1200, 600);
      expect(drawImage).toHaveBeenCalledOnce();
      expect(canvas.width).toBe(1200);
      expect(canvas.height).toBe(600);
      expect(toDataUrl).toHaveBeenCalledWith('image/png');
    } finally {
      getContext.mockRestore();
      toDataUrl.mockRestore();
      vi.unstubAllGlobals();
    }
  });
});
