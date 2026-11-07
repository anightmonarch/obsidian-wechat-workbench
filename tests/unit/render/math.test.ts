import { describe, expect, it } from 'vitest';

import type { NoteSnapshot } from '../../../src/domain/article';
import { RenderArtifactBuilder } from '../../../src/render/artifact-builder';
import { CodeThemeRegistry } from '../../../src/styles/code-theme-registry';
import { DEFAULT_ARTICLE_STYLE } from '../../../src/styles/style-config';
import { StyleCompiler } from '../../../src/styles/style-compiler';
import { BUILTIN_THEMES } from '../../../src/themes/builtin';

const theme = BUILTIN_THEMES.find(item => item.manifest.id === 'native');
if (theme === undefined) throw new Error('Native theme fixture is missing.');
const compiledTheme = new StyleCompiler(new CodeThemeRegistry()).compile(theme, DEFAULT_ARTICLE_STYLE);

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
    const markdown = 'Inline $E = mc^2$.\n\n$$\n\\sum_{i=1}^{n} i\n$$';

    const first = await new RenderArtifactBuilder().build(snapshot(markdown), compiledTheme);
    const second = await new RenderArtifactBuilder().build(snapshot(markdown), compiledTheme);

    expect(first.assets.map(asset => asset.kind)).toEqual(['generated-math', 'generated-math']);
    expect(first.assets.every(asset => asset.status === 'resolved')).toBe(true);
    expect(first.canonicalHtml).toContain('class="katex"');
    expect(first.canonicalHtml).toContain('math-display');
    expect(first.canonicalHtml).toMatch(/<p[^>]*math-display/u);
    const displayWrapper = /<p[^>]*math-display[^>]*style="([^"]*)"/u.exec(first.canonicalHtml);
    expect(displayWrapper?.[1] ?? '').toContain('text-align: center');
    expect(displayWrapper?.[1] ?? '').toContain('text-indent: 0');
    expect(first.canonicalHtml).toMatch(/katex-display[^>]*style="[^"]*text-align:\s*center/u);
    expect(first.canonicalHtml).not.toContain('katex-mathml');
    expect(first.canonicalHtml).toContain('aria-label="E = mc^2"');
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
