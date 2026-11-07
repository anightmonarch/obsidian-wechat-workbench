import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RenderArtifact } from '../../../src/domain/artifact';
import { ArticlePreviewRenderer } from '../../../src/ui/render-preview';

const diagram = Object.freeze({
  id: 'asset:diagram',
  kind: 'generated-diagram' as const,
  source: 'graph TD; A-->B',
  status: 'unresolved' as const,
  contentHash: null,
  resolvedUrl: null,
});

const artifact: Readonly<RenderArtifact> = Object.freeze({
  artifactVersion: '1', rendererVersion: '0.1.0',
  source: Object.freeze({ vaultPath: 'article.md', modifiedAt: 1, sourceHash: 'source' }),
  theme: Object.freeze({ id: 'native', version: '1.0.0', contentHash: 'theme' }),
  metadata: Object.freeze({ title: 'Article', author: '', digest: '', cover: null, contentSourceUrl: '' }),
  canonicalHtml: '<section class="wechat-article"><figure data-asset-id="asset:diagram" data-asset-kind="generated-diagram"></figure></section>',
  plainText: 'Article', assets: Object.freeze([diagram]), diagnostics: Object.freeze([]), contentHash: 'content',
});

describe('ArticlePreviewRenderer', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('shows a generated Mermaid image at the full article width', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const resolve = vi.fn(async () => 'data:image/png;base64,iVBORw0KGgo=');
    vi.stubGlobal('createEl', (tag: string) => document.createElement(tag));

    try {
      new ArticlePreviewRenderer({ resolve }).render(container, artifact);

      await vi.waitFor(() => {
        const image = container.querySelector<HTMLImageElement>('img[alt="Mermaid 图表"]');
        expect(image?.style.width).toBe('100%');
        expect(image?.style.maxWidth).toBe('100%');
        expect(image?.style.height).toBe('auto');
      });
      expect(resolve).toHaveBeenCalledWith(diagram);
    } finally {
      container.remove();
      vi.unstubAllGlobals();
    }
  });

  it('adds a source/image toggle with copy actions for Mermaid previews only', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const resolve = vi.fn(async () => 'data:image/png;base64,iVBORw0KGgo=');
    const written: unknown[][] = [];
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal('createEl', (tag: string) => document.createElement(tag));
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText, write: vi.fn(async (items: unknown) => { written.push([items]); }) },
      configurable: true,
    });
    vi.stubGlobal('fetch', vi.fn(async () => ({ blob: async () => new Blob(['png-bytes'], { type: 'image/png' }) })));
    vi.stubGlobal('ClipboardItem', class { constructor(public data: Record<string, Blob>) {} });
    // dataUrlToBlob decodes base64; the fixture payload must be valid base64
    expect('iVBORw0KGgo=').toMatch(/^[A-Za-z0-9+/=]+$/u);

    try {
      new ArticlePreviewRenderer({ resolve }).render(container, artifact);
      await vi.waitFor(() => {
        expect(container.querySelector('[data-testid="mermaid-preview"]')).not.toBeNull();
      });

      const frame = container.querySelector<HTMLElement>('[data-testid="mermaid-preview"]');
      expect(frame?.querySelector('img[alt="Mermaid 图表"]')).not.toBeNull();
      expect(frame?.querySelector('pre[data-testid="mermaid-source"]')?.textContent).toBe('graph TD; A-->B');
      expect(artifact.canonicalHtml).not.toContain('mermaid-preview');

      const toggle = frame?.querySelector<HTMLButtonElement>('[data-testid="mermaid-toggle"]');
      const source = frame?.querySelector<HTMLElement>('[data-testid="mermaid-source"]');
      expect(toggle?.textContent).toBe('查看源码');
      toggle?.click();
      expect(source?.hidden).toBe(false);
      expect(frame?.querySelector<HTMLImageElement>('img[alt="Mermaid 图表"]')?.style.display).toBe('none');
      expect(toggle?.textContent).toBe('查看图片');
      toggle?.click();
      expect(source?.hidden).toBe(true);
      expect(frame?.querySelector<HTMLImageElement>('img[alt="Mermaid 图表"]')?.style.display).toBe('');

      container.querySelector<HTMLButtonElement>('[data-testid="mermaid-copy-source"]')?.click();
      await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith('graph TD; A-->B'));

      container.querySelector<HTMLButtonElement>('[data-testid="mermaid-copy-image"]')?.click();
      await vi.waitFor(() => expect(written.length).toBeGreaterThan(0));
    } finally {
      container.remove();
    }
  });

  it('copies code without adding the preview control to the publish artifact', async () => {
    vi.useFakeTimers();
    const container = document.createElement('div');
    document.body.append(container);
    const writeText = vi.fn(async (_value: string) => undefined);
    const codeArtifact = Object.freeze({
      ...artifact,
      canonicalHtml: [
        '<section class="wechat-article">',
        '<pre class="code-window"><code>',
        '<span class="code-window-chrome" aria-hidden="true"><span class="code-window-dots"></span><span class="code-window-copy">复制</span></span>',
        '<span class="code-line"><span class="code-line-number">1</span><span class="code-line-content">const answer = 42;</span></span>',
        '<span class="code-line"><span class="code-line-number">2</span><span class="code-line-content">return answer;</span></span>',
        '</code></pre>',
        '</section>',
      ].join(''),
      assets: Object.freeze([]),
    });
    const blockArtifact = Object.freeze({
      ...codeArtifact,
      canonicalHtml: [
        '<section class="wechat-article">',
        '<section class="code-scroll" style="overflow-x: auto"><pre><code class="hljs language-ts">',
        '<span aria-hidden="true" class="code-line-block code-window-chrome-spacer">&nbsp;</span>',
        '<span class="code-line-block" style="display: block; white-space: pre"><span class="hljs-keyword">const</span>&nbsp;answer&nbsp;=&nbsp;42;</span>',
        '<span class="code-line-block" style="display: block; white-space: pre">return&nbsp;answer;</span>',
        '</code></pre></section>',
        '</section>',
      ].join(''),
    });
    vi.stubGlobal('createEl', (tag: string) => document.createElement(tag));

    try {
      new ArticlePreviewRenderer(undefined, writeText).render(container, codeArtifact);
      const copy = container.querySelector<HTMLButtonElement>('[data-testid="code-copy"]');

      expect(container.querySelectorAll('[data-testid="code-copy"]')).toHaveLength(1);
      expect(container.querySelector('.code-window-copy')).toBeNull();
      expect(copy?.getAttribute('aria-label')).toBe('复制代码');
      expect(copy?.dataset.icon).toBe('copy');
      expect(copy?.textContent).toBe('');
      expect(copy?.textContent).not.toContain('复制');
      copy?.click();
      await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith(
        'const answer = 42;\nreturn answer;',
      ));
      expect(copy?.dataset.icon).toBe('check');
      expect(copy?.getAttribute('aria-label')).toBe('代码已复制');
      expect(copy?.textContent).toBe('');
      await vi.advanceTimersByTimeAsync(999);
      expect(copy?.dataset.icon).toBe('check');
      await vi.advanceTimersByTimeAsync(1);
      expect(copy?.dataset.icon).toBe('copy');
      expect(copy?.getAttribute('aria-label')).toBe('复制代码');
      expect(codeArtifact.canonicalHtml).not.toContain('wechat-workbench__code-copy');
      expect(codeArtifact.canonicalHtml).toContain('code-window-copy');
    } finally {
      container.remove();
    }
    const blockContainer = document.createElement('div');
    document.body.append(blockContainer);
    const blockWrite = vi.fn(async (_value: string) => undefined);
    try {
      new ArticlePreviewRenderer(undefined, blockWrite).render(blockContainer, blockArtifact);
      blockContainer.querySelector<HTMLButtonElement>('[data-testid="code-copy"]')?.click();
      await vi.waitFor(() => expect(blockWrite).toHaveBeenCalledWith(
        'const answer = 42;\nreturn answer;',
      ));
    } finally {
      blockContainer.remove();
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });
});
