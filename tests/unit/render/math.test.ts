import { describe, expect, it } from 'vitest';

import type { NoteSnapshot } from '../../../src/domain/article';
import { RenderArtifactBuilder } from '../../../src/render/artifact-builder';
import { BUILTIN_THEMES } from '../../../src/themes/builtin';

const theme = BUILTIN_THEMES.find(item => item.manifest.id === 'native');
if (theme === undefined) throw new Error('Native theme fixture is missing.');

function snapshot(markdown: string): Readonly<NoteSnapshot> {
  return Object.freeze({
    vaultPath: 'math.md', basename: 'math', modifiedAt: 1, markdown,
    frontmatter: Object.freeze({}),
    metadata: Object.freeze({ title: 'Math', author: '', digest: '', cover: null, contentSourceUrl: '' }),
    selectedThemeId: 'native', sourceHash: 'math-source',
  });
}

describe('KaTeX projection', () => {
  it('renders inline and display math as stable generated assets', async () => {
    const builder = new RenderArtifactBuilder();
    const markdown = 'Inline $E = mc^2$.\n\n$$\n\\sum_{i=1}^{n} i\n$$';

    const first = await builder.build(snapshot(markdown), theme);
    const second = await builder.build(snapshot(markdown), theme);

    expect(first.assets.map(asset => asset.kind)).toEqual(['generated-math', 'generated-math']);
    expect(first.assets.every(asset => asset.status === 'resolved')).toBe(true);
    expect(first.canonicalHtml).toContain('class="katex"');
    expect(first.canonicalHtml).toContain('math-display');
    expect(first.canonicalHtml).toBe(second.canonicalHtml);
    expect(first.assets).toEqual(second.assets);
  });

  it('does not enable KaTeX trusted HTML or links', async () => {
    const artifact = await new RenderArtifactBuilder().build(
      snapshot('$\\href{javascript:alert(1)}{unsafe} \\htmlClass{evil}{x}$'),
      theme,
    );

    expect(artifact.canonicalHtml).not.toMatch(/href=|javascript:|class="evil"/iu);
  });
});
