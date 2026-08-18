import { describe, expect, it } from 'vitest';

import { validateThemePack } from '../../../src/themes/theme-validator';

const manifest = Object.freeze({
  id: 'custom-green',
  name: 'Custom green',
  version: '1.0.0',
  author: 'Test author',
  description: 'A synthetic custom theme.',
});

describe('validateThemePack', () => {
  it.each([
    '@import "https://example.test/theme.css";',
    '.wechat-article { background: url(https://example.test/image.png) }',
    'body { color: red }',
    '.wechat-article { position: fixed; inset: 0 }',
    '.wechat-article { z-index: 999 }',
  ])('rejects unsafe CSS: %s', css => {
    const result = validateThemePack(manifest, css);

    expect(result.ok).toBe(false);
    expect(result.diagnostics[0]?.severity).toBe('BLOCKING');
  });

  it('scopes bare article selectors under the article root', () => {
    const result = validateThemePack(manifest, 'h1, p.note { color: #123456; }');

    expect(result.ok).toBe(true);
    expect(result.css).toBe('.wechat-article h1, .wechat-article p.note { color: #123456; }');
  });

  it('accepts selectors that are already scoped', () => {
    const css = '.wechat-article blockquote { border-left: 2px solid #07c160; }';

    const result = validateThemePack(manifest, css);

    expect(result.ok).toBe(true);
    expect(result.css).toBe(css);
  });
});
