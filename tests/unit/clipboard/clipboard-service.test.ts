import { describe, expect, it, vi } from 'vitest';

import type { RenderArtifact } from '../../../src/domain/artifact';
import {
  ClipboardService,
  type ClipboardPort,
} from '../../../src/clipboard/clipboard-service';

const artifact: Readonly<RenderArtifact> = Object.freeze({
  artifactVersion: '1', rendererVersion: '0.1.0',
  source: Object.freeze({ vaultPath: 'article.md', modifiedAt: 1, sourceHash: 'source' }),
  theme: Object.freeze({ id: 'native', version: '1.0.0', contentHash: 'theme' }),
  metadata: Object.freeze({ title: 'Article', author: '', digest: '', cover: null, contentSourceUrl: '' }),
  canonicalHtml: '<section class="wechat-article"><p>Article</p></section>',
  plainText: 'Article', assets: Object.freeze([]), diagnostics: Object.freeze([]), contentHash: 'content',
});

describe('ClipboardService', () => {
  it('writes HTML and plain text from the same immutable artifact', async () => {
    const write = vi.fn();
    const clipboard: ClipboardPort = { write };
    const resolver = { resolve: vi.fn(async () => '<section><p>Resolved</p></section>') };
    const service = new ClipboardService(resolver, clipboard);

    const result = await service.copyForWeChat(artifact);

    expect(write).toHaveBeenCalledWith({ html: '<section><p>Resolved</p></section>', text: 'Article' });
    expect(result).toEqual({ mode: 'rich', contentHash: 'content' });
  });

  it('does not write when asset resolution fails', async () => {
    const write = vi.fn();
    const service = new ClipboardService(
      { resolve: vi.fn(async () => { throw Object.assign(new Error('unreadable'), { code: 'LOCAL_ASSET_UNREADABLE' }); }) },
      { write },
    );

    await expect(service.copyForWeChat(artifact)).rejects.toMatchObject({ code: 'LOCAL_ASSET_UNREADABLE' });
    expect(write).not.toHaveBeenCalled();
  });

  it('copies canonical HTML source as plain text without resolving assets', async () => {
    const write = vi.fn();
    const resolve = vi.fn();
    const service = new ClipboardService({ resolve }, { write });

    const result = await service.copyHtmlSource(artifact);

    expect(resolve).not.toHaveBeenCalled();
    expect(write).toHaveBeenCalledWith({ text: artifact.canonicalHtml });
    expect(result.mode).toBe('source');
  });
});
