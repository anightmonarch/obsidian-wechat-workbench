import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import type { NoteSnapshot } from '../../../src/domain/article';
import { RenderArtifactBuilder } from '../../../src/render/artifact-builder';
import { CodeThemeRegistry } from '../../../src/styles/code-theme-registry';
import { DEFAULT_ARTICLE_STYLE, patchArticleStyle } from '../../../src/styles/style-config';
import { StyleCompiler } from '../../../src/styles/style-compiler';
import { BUILTIN_THEMES } from '../../../src/themes/builtin';

const fixtureMarkdown = await readFile('tests/fixtures/articles/style-elements.md', 'utf8');

function snapshot(themeId: string): Readonly<NoteSnapshot> {
  return Object.freeze({
    vaultPath: 'tests/fixtures/articles/style-elements.md',
    basename: 'style-elements', modifiedAt: 1, markdown: fixtureMarkdown,
    frontmatter: Object.freeze({}),
    metadata: Object.freeze({
      title: '样式工作台验证', author: 'WeChat Workbench', digest: 'Synthetic style fixture',
      cover: null, contentSourceUrl: 'https://example.test/article',
    }),
    selectedThemeId: themeId, sourceHash: 'style-elements-source',
  });
}

async function buildStyleFixture(themeId: string) {
  const base = BUILTIN_THEMES.find(theme => theme.manifest.id === themeId);
  if (base === undefined) throw new Error(`Missing theme fixture: ${themeId}`);
  const style = patchArticleStyle(DEFAULT_ARTICLE_STYLE, { themeId, imageCaption: 'alt' });
  const compiled = new StyleCompiler(new CodeThemeRegistry()).compile(base, style);
  return new RenderArtifactBuilder().build(snapshot(themeId), compiled, style);
}

describe('Doocs style golden HTML', () => {
  it.each([
    ['doocs-classic', 'tests/golden/doocs-classic.html'],
    ['doocs-grace', 'tests/golden/doocs-grace.html'],
    ['doocs-simple', 'tests/golden/doocs-simple.html'],
  ] as const)('matches %s golden HTML', async (themeId, goldenPath) => {
    const artifact = await buildStyleFixture(themeId);
    expect(artifact.canonicalHtml).toBe((await readFile(goldenPath, 'utf8')).trimEnd());
  });

  it.each(['doocs-classic', 'doocs-grace', 'doocs-simple'])(
    'keeps paragraphs flush with the article edge for %s',
    async themeId => {
      const artifact = await buildStyleFixture(themeId);

      expect(artifact.canonicalHtml).toContain('margin: 1.25em 0');
    },
  );

  it.each(['doocs-classic', 'doocs-grace', 'doocs-simple'])(
    'keeps images, Mermaid diagrams, and tables aligned with the text edge for %s',
    async themeId => {
      const artifact = await buildStyleFixture(themeId);

      expect(artifact.canonicalHtml).toContain('class="image-figure" style="margin: 1.5em 0"');
      expect(artifact.canonicalHtml).toContain('class="mermaid-placeholder"');
      expect(artifact.canonicalHtml).toContain('data-asset-kind="generated-diagram" style="margin: 1.5em 0"');
      expect(artifact.canonicalHtml).toContain('<table style="border-collapse: collapse; margin: 1em 0; width: 100%"');
    },
  );
});
