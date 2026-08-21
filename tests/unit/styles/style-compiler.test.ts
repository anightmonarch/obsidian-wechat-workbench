import { describe, expect, it } from 'vitest';

import type { ThemeDefinition } from '../../../src/domain/theme';
import { DEFAULT_ARTICLE_STYLE, patchArticleStyle } from '../../../src/styles/style-config';
import { CodeThemeRegistry, DOOCS_CODE_THEME_IDS } from '../../../src/styles/code-theme-registry';
import { StyleCompiler } from '../../../src/styles/style-compiler';
import { BUILTIN_THEMES } from '../../../src/themes/builtin';

const baseTheme = BUILTIN_THEMES.find(theme => theme.manifest.id === 'doocs-classic');
if (baseTheme === undefined) throw new Error('Doocs classic theme fixture is missing.');

const customTheme: ThemeDefinition = Object.freeze({
  manifest: Object.freeze({
    id: 'custom-green',
    name: 'Custom green',
    version: '1.0.0',
    author: 'Test',
    description: 'Test theme',
  }),
  css: '.wechat-article { color: #263238; } .wechat-article h2 { content: custom-marker; }',
  contentHash: 'custom-hash',
  source: 'vault',
  previewPath: null,
});

describe('StyleCompiler', () => {
  const compiler = new StyleCompiler(new CodeThemeRegistry());

  it('materializes values and hashes the complete style input', () => {
    const first = compiler.compile(baseTheme, DEFAULT_ARTICLE_STYLE);
    const second = compiler.compile(baseTheme, DEFAULT_ARTICLE_STYLE);
    const green = compiler.compile(baseTheme, patchArticleStyle(DEFAULT_ARTICLE_STYLE, {
      primaryColor: '#009874',
    }));

    expect(first.css).toBe(second.css);
    expect(first.contentHash).toBe(second.contentHash);
    expect(green.contentHash).not.toBe(first.contentHash);
    expect(first.css).not.toMatch(/var\(--|:root|@import|url\s*\(/iu);
    expect(first.css).toContain('.wechat-article');
  });

  it('appends overrides after a valid Vault theme', () => {
    const result = compiler.compile(customTheme, patchArticleStyle(DEFAULT_ARTICLE_STYLE, {
      themeId: 'custom-green',
      headingStyles: { h2: 'border-left' },
    }));

    expect(result.css.indexOf('custom-marker')).toBeLessThan(result.css.lastIndexOf('border-left'));
    expect(result.manifest.id).toBe('custom-green');
    expect(result.source).toBe('vault');
  });

  it.each(DOOCS_CODE_THEME_IDS)('compiles the local code theme %s safely', codeThemeId => {
    const result = compiler.compile(baseTheme, patchArticleStyle(DEFAULT_ARTICLE_STYLE, { codeThemeId }));

    expect(result.css).toMatch(/\.wechat-article[\s\S]*\.hljs/iu);
    expect(result.css).not.toMatch(/@(?:import|media|font-face)|url\s*\(|:root|::(?:before|after)/iu);
  });
});
