import { describe, expect, it } from 'vitest';

import { canonicalizeHtml } from '../../../src/render/canonicalize';

function styleOf(html: string, selector: string): string {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const element = document.querySelector(selector);
  return element?.getAttribute('style') ?? '';
}

describe('canonicalize style declarations', () => {
  it('expands conflicting shorthand/longhand borders into final longhands', () => {
    const html = canonicalizeHtml(
      '<section class="wechat-article"><blockquote class="callout" style="border-left-color: #478BE6; border-left: 4px solid #0F4C81; background: #eef5ff">x</blockquote></section>',
    );

    const style = styleOf(html, 'blockquote');
    expect(style).toContain('border-left-width: 4px');
    expect(style).toContain('border-left-style: solid');
    expect(style).toContain('border-left-color: #0F4C81');
    expect(style).not.toContain('border-left:');
    expect(style).not.toContain('#478BE6');
  });

  it('applies source order so later longhands override earlier shorthands', () => {
    const html = canonicalizeHtml(
      '<section class="wechat-article"><div style="margin: 1em 0; margin-top: 2em">x</div></section>',
    );

    const style = styleOf(html, 'div');
    expect(style).toContain('margin-top: 2em');
    expect(style).toContain('margin-right: 0');
    expect(style).toContain('margin-bottom: 1em');
    expect(style).not.toContain('margin:');
  });

  it('expands a plain border shorthand reset plus a per-side override', () => {
    const html = canonicalizeHtml(
      '<section class="wechat-article"><h2 style="border: 0; border-bottom: 2px solid #0F4C81">x</h2></section>',
    );

    const style = styleOf(html, 'h2');
    expect(style).toContain('border-top-width: 0');
    expect(style).toContain('border-bottom-width: 2px');
    expect(style).toContain('border-bottom-color: #0F4C81');
    expect(style).not.toMatch(/border:|border-bottom:/u);
  });

  it('keeps declarations without conflicts intact', () => {
    const html = canonicalizeHtml(
      '<section class="wechat-article"><p style="margin: 1.25em 0; color: #333333">x</p></section>',
    );

    const style = styleOf(html, 'p');
    expect(style).toContain('margin-top: 1.25em');
    expect(style).toContain('margin-bottom: 1.25em');
    expect(style).toContain('margin-right: 0');
    expect(style).toContain('margin-left: 0');
    expect(style).toContain('color: #333333');
  });

  it('leaves unparseable or complex values untouched', () => {
    const html = canonicalizeHtml(
      '<section class="wechat-article"><div style="background: color-mix(in srgb, #0F4C81 8%, transparent)">x</div></section>',
    );

    const style = styleOf(html, 'div');
    expect(style).toContain('background-color: color-mix(in srgb, #0F4C81 8%, transparent)');
  });
});
