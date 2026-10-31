import { describe, expect, it } from 'vitest';

import {
  DEFAULT_ARTICLE_STYLE,
  defaultStyleForTheme,
  parseArticleStyle,
  patchArticleStyle,
  serializeArticleStyle,
} from '../../../src/styles/style-config';

describe('style config', () => {
  it('provides an immutable Doocs classic default aligned with the official editor', () => {
    expect(DEFAULT_ARTICLE_STYLE).toMatchObject({
      version: 3,
      themeId: 'doocs-classic',
      fontFamily: 'sans-serif',
      fontSize: 16,
      primaryColor: '#0F4C81',
      codeThemeId: 'github-dark',
      showCodeLineNumbers: false,
      macCodeBlock: true,
      imageCaption: 'alt',
      externalLinkCitation: false,
      paragraphIndent: false,
      textJustify: false,
      wordCount: false,
      lineHeight: 1.75,
      blockSpacing: 1,
      linkColor: 'wechat-blue',
      blockquoteBackground: 'default',
    });
    expect(Object.isFrozen(DEFAULT_ARTICLE_STYLE)).toBe(true);
    expect(Object.isFrozen(DEFAULT_ARTICLE_STYLE.headingStyles)).toBe(true);
  });

  it('supports both data.json and Frontmatter field names', () => {
    const typed = parseArticleStyle({
      version: 1,
      themeId: 'doocs-grace',
      fontFamily: 'serif',
      fontSize: 18,
      primaryColor: '#009874',
      headingStyles: { h2: 'border-bottom' },
    });
    const frontmatter = parseArticleStyle({
      version: 1,
      theme: 'doocs-grace',
      font: 'serif',
      'font-size': 18,
      'primary-color': '#009874',
      headings: { h2: 'border-bottom' },
    });

    expect(typed.status).toBe('valid');
    expect(frontmatter.status).toBe('valid');
    if (typed.status !== 'valid' || frontmatter.status !== 'valid') return;
    expect(frontmatter.config).toEqual(typed.config);
  });

  it('repairs invalid supported fields and rejects a future schema', () => {
    const repaired = parseArticleStyle({
      version: 1,
      theme: 'doocs-grace',
      'font-size': 99,
      'primary-color': 'red',
      headings: { h2: 'unknown-style' },
    });
    const future = parseArticleStyle({ version: 4, theme: 'future' });

    expect(repaired.status).toBe('valid');
    if (repaired.status === 'valid') {
      expect(repaired.config.themeId).toBe('doocs-grace');
      expect(repaired.config.fontSize).toBe(16);
      expect(repaired.config.primaryColor).toBe('#0F4C81');
      expect(repaired.config.headingStyles.h2).toBe('default');
    }
    expect(future).toEqual({ status: 'unsupported', config: null, version: 4 });
  });

  it('migrates v1 to the current schema without enabling new projections', () => {
    const result = parseArticleStyle({
      version: 1,
      theme: 'doocs-classic',
      'font-size': 16,
    });

    expect(result.status).toBe('valid');
    if (result.status !== 'valid') return;
    expect(result.config).toMatchObject({
      version: 3,
      externalLinkCitation: false,
      wordCount: false,
      lineHeight: 1.75,
      blockSpacing: 1,
      linkColor: 'wechat-blue',
      blockquoteBackground: 'default',
    });
    expect(result.version).toBe(1);
  });

  it('upgrades v2 configs to v3 with official defaults for the new fields', () => {
    const result = parseArticleStyle({
      version: 2,
      theme: 'doocs-grace',
      'primary-color': '#009874',
    });

    expect(result.status).toBe('valid');
    if (result.status !== 'valid') return;
    expect(result.config).toMatchObject({
      version: 3,
      themeId: 'doocs-grace',
      primaryColor: '#009874',
      lineHeight: 1.75,
      blockSpacing: 1,
      linkColor: 'wechat-blue',
      blockquoteBackground: 'default',
    });
  });

  it('accepts v3 options in both naming styles and repairs invalid values', () => {
    const typed = parseArticleStyle({
      version: 3,
      lineHeight: 1.9,
      blockSpacing: 1.15,
      linkColor: 'primary',
      blockquoteBackground: 'primary',
    });
    const frontmatter = parseArticleStyle({
      version: 3,
      'line-height': 2.05,
      'block-spacing': 0.75,
      'link-color': 'inherit',
      'blockquote-background': 'transparent',
    });
    const repaired = parseArticleStyle({
      version: 3,
      lineHeight: 3.2,
      blockSpacing: 'wide',
      linkColor: 'purple',
      blockquoteBackground: 'green',
    });

    expect(typed.status).toBe('valid');
    expect(frontmatter.status).toBe('valid');
    if (typed.status !== 'valid' || frontmatter.status !== 'valid') return;
    expect(typed.config.lineHeight).toBe(1.9);
    expect(typed.config.blockSpacing).toBe(1.15);
    expect(typed.config.linkColor).toBe('primary');
    expect(typed.config.blockquoteBackground).toBe('primary');
    expect(frontmatter.config.lineHeight).toBe(2.05);
    expect(frontmatter.config.blockSpacing).toBe(0.75);
    expect(frontmatter.config.linkColor).toBe('inherit');
    expect(frontmatter.config.blockquoteBackground).toBe('transparent');
    if (repaired.status !== 'valid') return;
    expect(repaired.config.lineHeight).toBe(1.75);
    expect(repaired.config.blockSpacing).toBe(1);
    expect(repaired.config.linkColor).toBe('wechat-blue');
    expect(repaired.config.blockquoteBackground).toBe('default');
  });

  it('accepts v2 projection settings and serializes stable frontmatter keys', () => {
    const parsed = parseArticleStyle({
      version: 2,
      theme: 'doocs-classic',
      'external-link-citation': true,
      'word-count': true,
    });

    expect(parsed.status).toBe('valid');
    if (parsed.status !== 'valid') return;
    expect(parsed.config.externalLinkCitation).toBe(true);
    expect(parsed.config.wordCount).toBe(true);

    const updated = patchArticleStyle(DEFAULT_ARTICLE_STYLE, {
      externalLinkCitation: true,
      wordCount: true,
    });
    expect(serializeArticleStyle(updated)).toMatchObject({
      version: 3,
      'external-link-citation': true,
      'word-count': true,
    });
  });

  it('serializes v3 layout fields with stable frontmatter keys', () => {
    const updated = patchArticleStyle(DEFAULT_ARTICLE_STYLE, {
      lineHeight: 1.9,
      blockSpacing: 1.35,
      linkColor: 'inherit',
      blockquoteBackground: 'primary',
    });

    expect(serializeArticleStyle(updated)).toMatchObject({
      version: 3,
      'line-height': 1.9,
      'block-spacing': 1.35,
      'link-color': 'inherit',
      'blockquote-background': 'primary',
    });
  });

  it('serializes normalized values and applies a partial patch', () => {
    const updated = patchArticleStyle(DEFAULT_ARTICLE_STYLE, {
      primaryColor: '#009874',
      fontSize: 18,
      headingStyles: { h2: 'border-bottom' },
    });

    expect(serializeArticleStyle(updated)).toMatchObject({
      version: 3,
      theme: 'doocs-classic',
      'font-size': 18,
      'primary-color': '#009874',
      headings: { h2: 'border-bottom' },
    });
    expect(defaultStyleForTheme('doocs-simple').themeId).toBe('doocs-simple');
    expect(DEFAULT_ARTICLE_STYLE.primaryColor).toBe('#0F4C81');
  });

  it('returns a fresh immutable config for each theme default', () => {
    const first = defaultStyleForTheme('doocs-grace');
    const second = defaultStyleForTheme('doocs-grace');

    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(Object.isFrozen(first)).toBe(true);
  });
});
