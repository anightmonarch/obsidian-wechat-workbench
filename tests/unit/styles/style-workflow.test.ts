import { describe, expect, it } from 'vitest';

import type { NoteSnapshot } from '../../../src/domain/article';
import type { ThemeDefinition } from '../../../src/domain/theme';
import type { VaultFileRef } from '../../../src/domain/ports';
import { DEFAULT_ARTICLE_STYLE, patchArticleStyle, serializeArticleStyle } from '../../../src/styles/style-config';
import { CodeThemeRegistry } from '../../../src/styles/code-theme-registry';
import { StyleCompiler } from '../../../src/styles/style-compiler';
import { StyleFrontmatterStore } from '../../../src/styles/style-frontmatter-store';
import { StyleWorkflow, type StyleGlobalSettingsPort } from '../../../src/styles/style-workflow';
import { StyleResolver } from '../../../src/styles/style-resolver';
import { BUILTIN_THEMES } from '../../../src/themes/builtin';

const nativeTheme = BUILTIN_THEMES.find(theme => theme.manifest.id === 'native');
const classicTheme = BUILTIN_THEMES.find(theme => theme.manifest.id === 'doocs-classic');
if (nativeTheme === undefined || classicTheme === undefined) throw new Error('Theme fixture is missing.');

function snapshot(frontmatter: Readonly<Record<string, unknown>>): Readonly<NoteSnapshot> {
  return Object.freeze({
    vaultPath: 'article.md', basename: 'article', modifiedAt: 1, markdown: '# Article',
    frontmatter: Object.freeze(frontmatter),
    metadata: Object.freeze({ title: 'Article', author: '', digest: '', cover: null, contentSourceUrl: '' }),
    selectedThemeId: 'native', sourceHash: 'source',
  });
}

function settingsPort(): StyleGlobalSettingsPort & { state: { defaultStyle: Readonly<typeof DEFAULT_ARTICLE_STYLE>; recentStyles: Readonly<Record<string, Readonly<typeof DEFAULT_ARTICLE_STYLE>>> }; updates: unknown[] } {
  const state = {
    defaultStyle: DEFAULT_ARTICLE_STYLE,
    recentStyles: {},
  };
  const updates: unknown[] = [];
  return {
    state,
    updates,
    get: () => state,
    async update(patch) {
      updates.push(patch);
      if (patch.defaultStyle !== undefined) state.defaultStyle = patch.defaultStyle;
      if (patch.recentStyles !== undefined) state.recentStyles = patch.recentStyles;
    },
  };
}

describe('StyleWorkflow', () => {
  it('materializes compiled styles and preserves legacy themes', () => {
    const settings = settingsPort();
    const frontmatter: Record<string, unknown> = { 'wechat-theme-id': 'native' };
    const workflow = new StyleWorkflow(
      new StyleResolver(),
      settings,
      { get: (id: string): Readonly<ThemeDefinition> | undefined => BUILTIN_THEMES.find(theme => theme.manifest.id === id) },
      new StyleCompiler(new CodeThemeRegistry()),
      new StyleFrontmatterStore({ async processFrontmatter(_file, mutate) { mutate(frontmatter); } }),
    );

    const legacy = workflow.resolve(snapshot(frontmatter));
    expect(workflow.materialize(legacy)).toBe(nativeTheme);

    const compiled = workflow.resolve(snapshot({}));
    expect(workflow.materialize(compiled).compiledStyle?.config).toEqual(DEFAULT_ARTICLE_STYLE);
    expect(workflow.materialize(compiled).manifest.id).toBe('doocs-classic');
  });

  it('saves article style and updates only the recent style entry', async () => {
    const settings = settingsPort();
    const frontmatter: Record<string, unknown> = {};
    const workflow = new StyleWorkflow(
      new StyleResolver(),
      settings,
      { get: (id: string): Readonly<ThemeDefinition> | undefined => BUILTIN_THEMES.find(theme => theme.manifest.id === id) },
      new StyleCompiler(new CodeThemeRegistry()),
      new StyleFrontmatterStore({ async processFrontmatter(_file, mutate) { mutate(frontmatter); } }),
    );
    const style = patchArticleStyle(DEFAULT_ARTICLE_STYLE, { themeId: 'doocs-grace', primaryColor: '#009874' });
    const file: VaultFileRef = { path: 'article.md', basename: 'article', modifiedAt: 1 };

    await workflow.saveArticle(file, style);

    expect(frontmatter).toMatchObject({
      'wechat-theme-id': 'doocs-grace',
      'wechat-style': serializeArticleStyle(style),
    });
    expect(settings.state.recentStyles['doocs-grace']).toEqual(style);
    expect(settings.state.defaultStyle).toEqual(DEFAULT_ARTICLE_STYLE);
  });

  it('sets the global default and can reset to a theme baseline', async () => {
    const settings = settingsPort();
    const workflow = new StyleWorkflow(
      new StyleResolver(),
      settings,
      { get: (id: string): Readonly<ThemeDefinition> | undefined => BUILTIN_THEMES.find(theme => theme.manifest.id === id) },
      new StyleCompiler(new CodeThemeRegistry()),
      new StyleFrontmatterStore({ async processFrontmatter(_file, mutate) { mutate({}); } }),
    );
    const style = patchArticleStyle(DEFAULT_ARTICLE_STYLE, { themeId: 'doocs-grace' });

    await workflow.setGlobalDefault(style);

    expect(settings.state.defaultStyle).toEqual(style);
    expect(settings.state.recentStyles['doocs-grace']).toEqual(style);
    expect(workflow.reset('native').themeId).toBe('native');
  });
});
