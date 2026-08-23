import { describe, expect, it } from 'vitest';

import {
  DEFAULT_ARTICLE_STYLE,
  defaultStyleForTheme,
  parseArticleStyle,
  patchArticleStyle,
  serializeArticleStyle,
} from '../../../src/styles/style-config';

describe('style config', () => {
  it('provides an immutable Doocs classic default', () => {
    expect(DEFAULT_ARTICLE_STYLE).toMatchObject({
      version: 2,
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
    const future = parseArticleStyle({ version: 3, theme: 'future' });

    expect(repaired.status).toBe('valid');
    if (repaired.status === 'valid') {
      expect(repaired.config.themeId).toBe('doocs-grace');
      expect(repaired.config.fontSize).toBe(16);
      expect(repaired.config.primaryColor).toBe('#0F4C81');
      expect(repaired.config.headingStyles.h2).toBe('default');
    }
    expect(future).toEqual({ status: 'unsupported', config: null, version: 3 });
  });

  it('migrates v1 to v2 without enabling new projections', () => {
    const result = parseArticleStyle({
      version: 1,
      theme: 'doocs-classic',
      'font-size': 16,
    });

    expect(result.status).toBe('valid');
    if (result.status !== 'valid') return;
    expect(result.config).toMatchObject({
      version: 2,
      externalLinkCitation: false,
      wordCount: false,
    });
    expect(result.version).toBe(1);
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
      version: 2,
      'external-link-citation': true,
      'word-count': true,
    });
  });

  it('serializes normalized values and applies a partial patch', () => {
    const updated = patchArticleStyle(DEFAULT_ARTICLE_STYLE, {
      primaryColor: '#009874',
      fontSize: 18,
      headingStyles: { h2: 'border-bottom' },
    });

    expect(serializeArticleStyle(updated)).toMatchObject({
      version: 2,
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
