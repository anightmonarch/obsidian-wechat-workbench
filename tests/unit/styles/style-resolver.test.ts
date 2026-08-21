import { describe, expect, it } from 'vitest';

import { DEFAULT_ARTICLE_STYLE, patchArticleStyle, serializeArticleStyle } from '../../../src/styles/style-config';
import { StyleResolver } from '../../../src/styles/style-resolver';

describe('StyleResolver', () => {
  const resolver = new StyleResolver();
  const articleStyle = patchArticleStyle(DEFAULT_ARTICLE_STYLE, { primaryColor: '#009874' });

  it('gives a valid article style precedence over legacy and global values', () => {
    const resolved = resolver.resolve({
      frontmatter: {
        'wechat-style': serializeArticleStyle(articleStyle),
        'wechat-theme-id': 'native',
      },
      selectedThemeId: 'native',
      defaultStyle: DEFAULT_ARTICLE_STYLE,
    });

    expect(resolved.source).toBe('article');
    expect(resolved.renderMode).toBe('compiled');
    expect(resolved.config.primaryColor).toBe('#009874');
    expect(resolved.unsupportedVersion).toBeNull();
  });

  it('keeps an explicit legacy theme uncompiled', () => {
    const resolved = resolver.resolve({
      frontmatter: { 'wechat-theme-id': 'technical' },
      selectedThemeId: 'technical',
      defaultStyle: DEFAULT_ARTICLE_STYLE,
    });

    expect(resolved).toMatchObject({
      source: 'legacy',
      renderMode: 'legacy',
      themeId: 'technical',
    });
  });

  it('uses the global style when no article style fields exist', () => {
    const resolved = resolver.resolve({
      frontmatter: {},
      selectedThemeId: 'native',
      defaultStyle: articleStyle,
    });

    expect(resolved).toMatchObject({
      source: 'global',
      renderMode: 'compiled',
      themeId: articleStyle.themeId,
      config: articleStyle,
    });
  });

  it('does not silently overwrite a future style schema', () => {
    const resolved = resolver.resolve({
      frontmatter: { 'wechat-style': { version: 2, theme: 'doocs-grace' } },
      selectedThemeId: 'native',
      defaultStyle: articleStyle,
    });

    expect(resolved).toMatchObject({
      source: 'unsupported-fallback',
      renderMode: 'compiled',
      themeId: articleStyle.themeId,
      unsupportedVersion: 2,
    });
  });
});
