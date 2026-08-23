import { describe, expect, it } from 'vitest';

import { parseArticleRoot } from '../../../src/render/canonicalize';
import { highlightCodeBlocks } from '../../../src/render/extensions/code';
import {
  applyExternalLinkCitations,
  applyImageCaptions,
  applyReadingSummary,
} from '../../../src/render/style-projections';

describe('article style projections', () => {
  it.each([
    ['title-alt', 'Title'], ['alt-title', 'Alt'], ['title', 'Title'],
    ['alt', 'Alt'], ['filename', 'photo-one'], ['none', null],
  ] as const)('renders %s captions deterministically', (mode, expected) => {
    const root = parseArticleRoot('<section class="wechat-article"><p><img alt="Alt" title="Title" data-asset-source="assets/photo-one.png"></p></section>');

    applyImageCaptions(root, mode);

    expect(root.querySelector('figcaption')?.textContent ?? null).toBe(expected);
  });

  it('does not caption an inline image mixed with text', () => {
    const root = parseArticleRoot('<section class="wechat-article"><p>Before <img alt="Alt" data-asset-source="assets/photo.png"> after</p></section>');

    applyImageCaptions(root, 'alt');

    expect(root.querySelector('figure')).toBeNull();
    expect(root.querySelector('img')).not.toBeNull();
  });

  it('projects line numbers and mac window chrome as real DOM', () => {
    const root = parseArticleRoot('<section class="wechat-article"><pre><code class="language-ts">const answer = 42;\nreturn answer;</code></pre></section>');

    highlightCodeBlocks(root, { showLineNumbers: true, macWindow: true });

    expect(root.querySelectorAll('.code-line')).toHaveLength(2);
    expect(root.querySelectorAll('.code-line-number')).toHaveLength(2);
    expect(root.querySelectorAll('.code-line-content')).toHaveLength(2);
    expect(root.querySelectorAll('.code-window-dots')).toHaveLength(1);
    expect(root.querySelectorAll('.code-window-dot')).toHaveLength(3);
    expect([...root.querySelector('code')?.childNodes ?? []]
      .filter(node => node.nodeType === Node.TEXT_NODE)).toHaveLength(0);
  });

  it('does not add structural chrome when both options are disabled', () => {
    const root = parseArticleRoot('<section class="wechat-article"><pre><code class="language-ts">const answer = 42;</code></pre></section>');

    highlightCodeBlocks(root, { showLineNumbers: false, macWindow: false });

    expect(root.querySelector('.code-line')).toBeNull();
    expect(root.querySelector('.code-window-dots')).toBeNull();
  });

  it('prepends a Doocs-compatible reading summary only when enabled', () => {
    const root = parseArticleRoot('<section class="wechat-article"><p>你好 world</p></section>');

    applyReadingSummary(root, '你好 world', true);

    expect(root.firstElementChild?.classList.contains('reading-summary')).toBe(true);
    expect(root.firstElementChild?.textContent).toBe('字数 3，阅读大约需 1 分钟');
  });

  it('does not add a reading summary when disabled or empty', () => {
    const root = parseArticleRoot('<section class="wechat-article"><p>正文</p></section>');

    applyReadingSummary(root, '正文', false);
    expect(root.querySelector('.reading-summary')).toBeNull();

    applyReadingSummary(root, '', true);
    expect(root.querySelector('.reading-summary')).toBeNull();
  });

  it('deduplicates external links and excludes WeChat links and bare URLs', () => {
    const root = parseArticleRoot([
      '<section class="wechat-article">',
      '<p><a href="https://example.com/a" title="Example">A</a></p>',
      '<p><a href="https://example.com/a">Again</a></p>',
      '<p><a href="https://mp.weixin.qq.com/s/id">WeChat</a></p>',
      '<p><a href="https://example.com/raw">https://example.com/raw</a></p>',
      '</section>',
    ].join(''));

    applyExternalLinkCitations(root, true);

    expect(root.querySelectorAll('.external-link-reference')).toHaveLength(2);
    expect(root.querySelectorAll('.external-link-references li')).toHaveLength(1);
    expect(root.querySelector('.external-link-references')?.textContent).toContain('Example');
    expect(root.querySelector('.external-link-references a')?.getAttribute('href')).toBe('https://example.com/a');
    expect(root.querySelector('a[href="https://mp.weixin.qq.com/s/id"] sup')).toBeNull();
    expect(root.querySelector('a[href="https://example.com/raw"] sup')).toBeNull();
  });

  it('keeps citation order stable and does nothing when disabled', () => {
    const root = parseArticleRoot([
      '<section class="wechat-article">',
      '<p><a href="https://example.com/second">Second</a></p>',
      '<p><a href="https://example.com/first">First</a></p>',
      '</section>',
    ].join(''));

    applyExternalLinkCitations(root, false);
    expect(root.querySelector('.external-link-references')).toBeNull();

    applyExternalLinkCitations(root, true);
    expect([...root.querySelectorAll('.external-link-references li')].map(item => item.textContent)).toEqual([
      'Second', 'First',
    ]);
  });
});
