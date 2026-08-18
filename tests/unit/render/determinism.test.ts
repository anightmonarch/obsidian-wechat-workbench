import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import type { NoteSnapshot } from '../../../src/domain/article';
import { RenderArtifactBuilder } from '../../../src/render/artifact-builder';
import { BUILTIN_THEMES } from '../../../src/themes/builtin';

describe('render determinism', () => {
  it('produces byte-identical canonical HTML and content hashes', async () => {
    const markdown = await readFile('tests/fixtures/articles/core-elements.md', 'utf8');
    const snapshot: Readonly<NoteSnapshot> = Object.freeze({
      vaultPath: 'fixtures/core-elements.md',
      basename: 'core-elements',
      modifiedAt: 100,
      markdown,
      frontmatter: Object.freeze({}),
      metadata: Object.freeze({
        title: 'Core elements', author: 'Test author', digest: '', cover: null, contentSourceUrl: '',
      }),
      selectedThemeId: 'native',
      sourceHash: 'fixture-source-hash',
    });
    const theme = BUILTIN_THEMES.find(item => item.manifest.id === 'native');
    if (theme === undefined) throw new Error('Native theme fixture is missing.');
    const builder = new RenderArtifactBuilder();

    const outputs = await Promise.all(Array.from({ length: 5 }, () => builder.build(snapshot, theme)));

    expect(new Set(outputs.map(output => output.canonicalHtml)).size).toBe(1);
    expect(new Set(outputs.map(output => output.contentHash)).size).toBe(1);
  });
});
