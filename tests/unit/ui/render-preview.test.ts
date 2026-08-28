import { describe, expect, it, vi } from 'vitest';

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

  it('copies code without adding the preview control to the publish artifact', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const writeText = vi.fn(async (_value: string) => undefined);
    const codeArtifact = Object.freeze({
      ...artifact,
      canonicalHtml: [
        '<section class="wechat-article">',
        '<pre class="code-window"><code>',
        '<span class="code-window-dots" aria-hidden="true"></span>',
        '<span class="code-line"><span class="code-line-number">1</span><span class="code-line-content">const answer = 42;</span></span>',
        '<span class="code-line"><span class="code-line-number">2</span><span class="code-line-content">return answer;</span></span>',
        '</code></pre>',
        '</section>',
      ].join(''),
      assets: Object.freeze([]),
    });
    vi.stubGlobal('createEl', (tag: string) => document.createElement(tag));

    try {
      new ArticlePreviewRenderer(undefined, writeText).render(container, codeArtifact);
      const copy = container.querySelector<HTMLButtonElement>('[data-testid="code-copy"]');

      expect(copy?.getAttribute('aria-label')).toBe('复制代码');
      expect(copy?.dataset.icon).toBe('copy');
      expect(copy?.textContent).toBe('');
      copy?.click();
      await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith(
        'const answer = 42;\nreturn answer;',
      ));
      expect(copy?.dataset.icon).toBe('check');
      expect(copy?.getAttribute('aria-label')).toBe('代码已复制');
      expect(copy?.textContent).toBe('');
      expect(codeArtifact.canonicalHtml).not.toContain('code-copy');
    } finally {
      container.remove();
      vi.unstubAllGlobals();
    }
  });
});
