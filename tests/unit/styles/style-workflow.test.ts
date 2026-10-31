import { describe, expect, it } from 'vitest';

import type { ThemeDefinition } from '../../../src/domain/theme';
import type { VaultFileRef } from '../../../src/domain/ports';
import { DEFAULT_ARTICLE_STYLE, defaultStyleForTheme, patchArticleStyle } from '../../../src/styles/style-config';
import { CodeThemeRegistry } from '../../../src/styles/code-theme-registry';
import { StyleCompiler } from '../../../src/styles/style-compiler';
import { StyleFrontmatterStore } from '../../../src/styles/style-frontmatter-store';
import { StyleWorkflow, type StyleGlobalSettingsPort } from '../../../src/styles/style-workflow';
import { StyleResolver } from '../../../src/styles/style-resolver';
import { BUILTIN_THEMES } from '../../../src/themes/builtin';

const classicTheme = BUILTIN_THEMES.find(theme => theme.manifest.id === 'doocs-classic');
if (classicTheme === undefined) throw new Error('Theme fixture is missing.');

function settingsPort(): StyleGlobalSettingsPort & {
  state: {
    defaultStyle: Readonly<ReturnType<typeof defaultStyleForTheme>>;
    recentStyles: Readonly<Record<string, Readonly<ReturnType<typeof defaultStyleForTheme>>>>;
  };
  updates: unknown[];
} {
  const state = {
    defaultStyle: DEFAULT_ARTICLE_STYLE,
    recentStyles: {} as Record<string, Readonly<ReturnType<typeof defaultStyleForTheme>>>,
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

function workflowWith(
  settings: ReturnType<typeof settingsPort>,
  frontmatter: Record<string, unknown>,
): StyleWorkflow {
  return new StyleWorkflow(
    new StyleResolver(),
    settings,
    { get: (id: string): Readonly<ThemeDefinition> | undefined => BUILTIN_THEMES.find(theme => theme.manifest.id === id) },
    new StyleCompiler(new CodeThemeRegistry()),
    new StyleFrontmatterStore({ async processFrontmatter(_file, mutate) { mutate(frontmatter); } }),
  );
}

describe('StyleWorkflow', () => {
  it('resolves the global default and compiles it into the theme', () => {
    const settings = settingsPort();
    const workflow = workflowWith(settings, {});
    settings.state.defaultStyle = patchArticleStyle(DEFAULT_ARTICLE_STYLE, { themeId: 'doocs-grace' });

    const resolved = workflow.resolve();
    expect(resolved.source).toBe('global');
    const materialized = workflow.materialize(resolved);
    expect(materialized.manifest.id).toBe('doocs-grace');
    expect(materialized.compiledStyle?.config.themeId).toBe('doocs-grace');
  });

  it('writes every panel change into the global default and the per-theme memory', async () => {
    const settings = settingsPort();
    const workflow = workflowWith(settings, {});
    const style = patchArticleStyle(DEFAULT_ARTICLE_STYLE, {
      themeId: 'doocs-grace',
      primaryColor: '#009874',
    });

    await workflow.setGlobalDefault(style);

    expect(settings.state.defaultStyle).toEqual(style);
    expect(settings.state.recentStyles['doocs-grace']).toEqual(style);
  });

  it('loads a theme remembered config when switching themes', async () => {
    const settings = settingsPort();
    const workflow = workflowWith(settings, {});
    const graceStyle = patchArticleStyle(DEFAULT_ARTICLE_STYLE, {
      themeId: 'doocs-grace',
      primaryColor: '#009874',
      lineHeight: 1.9,
    });
    await workflow.setGlobalDefault(graceStyle);

    expect(workflow.configForTheme('doocs-grace')).toEqual(graceStyle);
    expect(workflow.configForTheme('doocs-simple')).toEqual(defaultStyleForTheme('doocs-simple'));
  });

  it('resets a theme to its default config', () => {
    const settings = settingsPort();
    const workflow = workflowWith(settings, {});

    expect(workflow.reset('doocs-simple')).toEqual(defaultStyleForTheme('doocs-simple'));
  });

  it('records a publish-time style snapshot into frontmatter as an archive', async () => {
    const settings = settingsPort();
    const frontmatter: Record<string, unknown> = {};
    const workflow = workflowWith(settings, frontmatter);
    const style = patchArticleStyle(DEFAULT_ARTICLE_STYLE, { themeId: 'doocs-grace' });
    const file: VaultFileRef = { path: 'article.md', basename: 'article', modifiedAt: 1 };

    await workflow.recordPublishSnapshot(file, style);

    expect(frontmatter['wechat-theme-id']).toBe('doocs-grace');
    expect(frontmatter['wechat-style']).toMatchObject({
      version: 3,
      theme: 'doocs-grace',
      'line-height': 1.75,
    });
  });
});
