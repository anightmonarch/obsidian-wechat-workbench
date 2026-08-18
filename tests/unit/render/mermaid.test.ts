import { describe, expect, it, vi } from 'vitest';

import type { NoteSnapshot } from '../../../src/domain/article';
import { DiagramRenderer, type MermaidEnginePort, type SvgRasterizerPort } from '../../../src/render/diagram-renderer';
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
    }));
    expect(parse).toHaveBeenCalledWith('graph TD; A-->B');
    expect(toPng).toHaveBeenCalledOnce();
    expect(generated.mimeType).toBe('image/png');
    expect(generated.bytes).toEqual(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]));
  });
});
