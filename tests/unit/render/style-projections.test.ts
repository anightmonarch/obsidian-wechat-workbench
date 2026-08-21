import { describe, expect, it } from 'vitest';

import { parseArticleRoot } from '../../../src/render/canonicalize';
import { highlightCodeBlocks } from '../../../src/render/extensions/code';
import { applyImageCaptions } from '../../../src/render/style-projections';

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
  });

  it('does not add structural chrome when both options are disabled', () => {
    const root = parseArticleRoot('<section class="wechat-article"><pre><code class="language-ts">const answer = 42;</code></pre></section>');

    highlightCodeBlocks(root, { showLineNumbers: false, macWindow: false });

    expect(root.querySelector('.code-line')).toBeNull();
    expect(root.querySelector('.code-window-dots')).toBeNull();
  });
});
