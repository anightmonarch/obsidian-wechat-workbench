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

  it.each(['doocs-classic', 'doocs-grace', 'doocs-simple'])('keeps h2 spacing compact for %s', themeId => {
    const theme = BUILTIN_THEMES.find(candidate => candidate.manifest.id === themeId);
    if (theme === undefined) throw new Error(`Missing built-in theme: ${themeId}`);

    const result = compiler.compile(theme, patchArticleStyle(DEFAULT_ARTICLE_STYLE, { themeId }));

    expect(result.css).toMatch(/\.wechat-article h2\s*\{[^}]*margin:\s*2em auto 1em/su);
  });

  it('keeps Doocs paragraphs flush with direct heading edges', () => {
    const result = compiler.compile(baseTheme, DEFAULT_ARTICLE_STYLE);

    expect(result.css).toContain('.wechat-article p { margin: 1.25em 0; letter-spacing: 0.04em; }');
  });

  it('keeps mac code chrome inside the code surface and keeps numbered lines compact', () => {
    const result = compiler.compile(baseTheme, patchArticleStyle(DEFAULT_ARTICLE_STYLE, {
      showCodeLineNumbers: true,
      macCodeBlock: true,
    }));

    expect(result.css).toContain('.wechat-article pre.code-window > code');
    expect(result.css).toContain('padding: 1em');
    expect(result.css).toContain('.wechat-article pre.code-window .code-window-dots { display: flex; gap: 0.35em; margin: 0 0 0.6em; }');
    expect(result.css).not.toContain('position: absolute');
    expect(result.css).toContain('align-items: baseline;');
    expect(result.css).toContain('line-height: 1.5;');
  });

  it('emits the configured line-height on the article root', () => {
    const result = compiler.compile(baseTheme, patchArticleStyle(DEFAULT_ARTICLE_STYLE, {
      lineHeight: 1.9,
    }));

    expect(result.css).toMatch(/\.wechat-article \{[^}]*line-height: 1\.9;/su);
    const fallback = compiler.compile(baseTheme, DEFAULT_ARTICLE_STYLE);
    expect(fallback.css).toMatch(/\.wechat-article \{[^}]*line-height: 1\.75;/su);
  });

  it('scales theme block margins at compile time without CSS variables', () => {
    const scaled = compiler.compile(baseTheme, patchArticleStyle(DEFAULT_ARTICLE_STYLE, {
      blockSpacing: 1.35,
    }));
    expect(scaled.css).toContain('.wechat-article p { margin: 1.6875em 0; letter-spacing: 0.04em; }');
    expect(scaled.css).toMatch(/\.wechat-article h2\s*\{[^}]*margin:\s*2\.7em auto 1\.35em/su);
    expect(scaled.css).not.toMatch(/var\(--/iu);

    const tightened = compiler.compile(baseTheme, patchArticleStyle(DEFAULT_ARTICLE_STYLE, {
      blockSpacing: 0.75,
    }));
    expect(tightened.css).toContain('.wechat-article p { margin: 0.9375em 0; letter-spacing: 0.04em; }');

    const untouched = compiler.compile(baseTheme, DEFAULT_ARTICLE_STYLE);
    expect(untouched.css).toContain('.wechat-article p { margin: 1.25em 0; letter-spacing: 0.04em; }');
  });

  it('emits link colors per the selected mode', () => {
    const wechatBlue = compiler.compile(baseTheme, DEFAULT_ARTICLE_STYLE);
    expect(wechatBlue.css).toContain('.wechat-article a { color: #576b95; }');
    expect(wechatBlue.css).not.toContain(`.wechat-article a { color: ${DEFAULT_ARTICLE_STYLE.primaryColor}; }`);

    const primary = compiler.compile(baseTheme, patchArticleStyle(DEFAULT_ARTICLE_STYLE, {
      linkColor: 'primary',
    }));
    expect(primary.css).toContain(`.wechat-article a { color: ${DEFAULT_ARTICLE_STYLE.primaryColor}; }`);

    const inherit = compiler.compile(baseTheme, patchArticleStyle(DEFAULT_ARTICLE_STYLE, {
      linkColor: 'inherit',
    }));
    expect(inherit.css).toContain('.wechat-article a { color: inherit; }');
  });

  it('emits blockquote background per the selected mode', () => {
    const followTheme = compiler.compile(baseTheme, DEFAULT_ARTICLE_STYLE);
    expect(followTheme.css).not.toContain('.wechat-article blockquote { background: transparent; }');
    expect(followTheme.css).not.toContain('color-mix');

    const transparent = compiler.compile(baseTheme, patchArticleStyle(DEFAULT_ARTICLE_STYLE, {
      blockquoteBackground: 'transparent',
    }));
    expect(transparent.css).toContain('.wechat-article blockquote { background: transparent; }');

    const primary = compiler.compile(baseTheme, patchArticleStyle(DEFAULT_ARTICLE_STYLE, {
      blockquoteBackground: 'primary',
    }));
    expect(primary.css).toContain(`.wechat-article blockquote { background: color-mix(in srgb, ${DEFAULT_ARTICLE_STYLE.primaryColor} 8%, transparent); }`);
  });

  it('styles generated reading summaries and external-link references', () => {
    const result = compiler.compile(baseTheme, patchArticleStyle(DEFAULT_ARTICLE_STYLE, {
      externalLinkCitation: true,
      wordCount: true,
    }));

    expect(result.css).toContain('.wechat-article blockquote.reading-summary');
    expect(result.css).toContain('.wechat-article section.external-link-references');
    expect(result.css).toContain('.wechat-article sup.external-link-reference');
  });
});
