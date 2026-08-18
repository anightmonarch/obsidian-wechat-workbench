import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';

import type { NoteSnapshot } from '../../../src/domain/article';
import type { BinaryFilePort } from '../../../src/domain/ports';
import { RenderArtifactBuilder } from '../../../src/render/artifact-builder';
import { BUILTIN_THEMES } from '../../../src/themes/builtin';

const theme = BUILTIN_THEMES.find(item => item.manifest.id === 'native');
if (theme === undefined) throw new Error('Native theme fixture is missing.');

describe('rich article golden output', () => {
  it('is deterministic and keeps resources as inert slots', async () => {
    const markdown = await readFile('tests/fixtures/articles/rich-elements.md', 'utf8');
    const snapshot: Readonly<NoteSnapshot> = Object.freeze({
      vaultPath: 'tests/fixtures/articles/rich-elements.md',
      basename: 'rich-elements',
      modifiedAt: 1,
      markdown,
      frontmatter: Object.freeze({}),
      metadata: Object.freeze({
        title: 'Rich elements', author: '', digest: '', cover: null, contentSourceUrl: '',
      }),
      selectedThemeId: 'native',
      sourceHash: 'rich-source',
    });
    const resolveLink = vi.fn(async () => 'tests/fixtures/assets/photo-one.png');
    const readBinary = vi.fn(async () => Uint8Array.from([0x89, 0x50, 0x4e, 0x47]));
    const files: BinaryFilePort = { resolveLink, readBinary };
    const builder = new RenderArtifactBuilder(files);

    const first = await builder.build(snapshot, theme);
    const second = await builder.build(snapshot, theme);
    const golden = await readFile('tests/golden/rich-elements.html', 'utf8');

    expect(first.canonicalHtml).toBe(second.canonicalHtml);
    expect(first.contentHash).toBe(second.contentHash);
    expect(first.assets.map(asset => asset.kind)).toEqual([
      'local-image', 'remote-image', 'generated-math', 'generated-math', 'generated-diagram',
    ]);
    expect(first.canonicalHtml).not.toMatch(/src="https:|src="data:/iu);
    expect(readBinary).toHaveBeenCalledTimes(2);
    expect(first.canonicalHtml).toBe(golden.trimEnd());
  });
});
