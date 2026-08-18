import { describe, expect, it } from 'vitest';

import { markdownToSafeHtml } from '../../src/render/markdown-pipeline';

describe('large untrusted article inputs', () => {
  it('processes a 5 MiB plain article without introducing markup', async () => {
    const markdown = 'a'.repeat(5 * 1024 * 1024);

    const html = await markdownToSafeHtml(markdown);

    expect(html.startsWith('<p>')).toBe(true);
    expect(html).not.toMatch(/<script|onerror=/iu);
  }, 20_000);

  it('keeps 500 image sources inert', async () => {
    const markdown = Array.from({ length: 500 }, (_, index) => (
      `![image-${index}](https://example.test/${index}.png)`
    )).join('\n');

    const html = await markdownToSafeHtml(markdown);

    expect(html.match(/data-asset-source=/gu)).toHaveLength(500);
    expect(html).not.toContain(' src=');
  }, 10_000);

  it('handles 200 nested quote markers without active output', async () => {
    const html = await markdownToSafeHtml(`${'> '.repeat(200)}deep`);

    expect(html).toContain('deep');
    expect(html).not.toMatch(/script|iframe|object/iu);
  });
});
