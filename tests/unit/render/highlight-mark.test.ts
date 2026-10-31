import { describe, expect, it } from 'vitest';

import type { NoteSnapshot } from '../../../src/domain/article';
import { markdownToSafeHtml } from '../../../src/render/markdown-pipeline';
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
    vaultPath: 'highlight.md', basename: 'highlight', modifiedAt: 1, markdown,
    frontmatter: Object.freeze({}),
    metadata: Object.freeze({ title: 'Highlight', author: '', digest: '', cover: null, contentSourceUrl: '' }),
    selectedThemeId: 'native', sourceHash: 'hl-source',
  });
}

describe('Obsidian ==highlight== → <mark>', () => {
  it('projects inline highlights to mark in safe HTML', async () => {
    const html = await markdownToSafeHtml('正文中应有 ==高亮片段== 保留。');
    expect(html).toContain('<mark');
    expect(html).toContain('高亮片段');
    expect(html).toMatch(/<mark[^>]*>高亮片段<\/mark>/u);
    expect(html).not.toContain('==高亮片段==');
  });

  it('does not treat highlights inside inline code or fences', async () => {
    const inline = await markdownToSafeHtml('code `==nope==` stays');
    expect(inline).toContain('==nope==');
    expect(inline).not.toMatch(/<mark[^>]*>nope<\/mark>/u);

    const fence = await markdownToSafeHtml('```\n==raw==\n```');
    expect(fence).toContain('==raw==');
    expect(fence).not.toMatch(/<mark[^>]*>raw<\/mark>/u);
  });

  it('inlines highlight styles into the publish artifact', async () => {
    const artifact = await new RenderArtifactBuilder().build(
      snapshot('请看 ==重点== 一词。'),
      compiledTheme,
    );
    expect(artifact.canonicalHtml).toMatch(/<mark[^>]*>重点<\/mark>/u);
    expect(artifact.canonicalHtml).toMatch(/<mark[^>]*style="[^"]*background/u);
    expect(artifact.canonicalHtml).not.toContain('==重点==');
  });
});
