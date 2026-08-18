import { describe, expect, it } from 'vitest';

import type { WorkbenchRenderState } from '../../../src/ui/workbench-controller';
import { WeChatWorkbenchView } from '../../../src/ui/workbench-view';

const renderState: Readonly<WorkbenchRenderState> = Object.freeze({
  snapshot: Object.freeze({
    vaultPath: 'article.md', basename: 'article', modifiedAt: 1, markdown: '# Article',
    frontmatter: Object.freeze({}),
    metadata: Object.freeze({ title: 'Article', author: 'Author', digest: '', cover: null, contentSourceUrl: '' }),
    selectedThemeId: 'native', sourceHash: 'source',
  }),
  artifact: Object.freeze({
    artifactVersion: '1', rendererVersion: '0.1.0',
    source: Object.freeze({ vaultPath: 'article.md', modifiedAt: 1, sourceHash: 'source' }),
    theme: Object.freeze({ id: 'native', version: '1.0.0', contentHash: 'theme' }),
    metadata: Object.freeze({ title: 'Article', author: 'Author', digest: '', cover: null, contentSourceUrl: '' }),
    canonicalHtml: '<section class="wechat-article"><h1>Article</h1><p><img alt="remote" data-asset-id="asset:remote" data-asset-kind="remote-image"></p></section>',
    plainText: 'Article',
    assets: Object.freeze([Object.freeze({
      id: 'asset:remote', kind: 'remote-image', source: 'https://example.test/image.png',
      status: 'unresolved', contentHash: null, resolvedUrl: null,
    })]),
    diagnostics: Object.freeze([]), contentHash: 'content',
  }),
  preflight: Object.freeze({
    ok: true,
    blocking: Object.freeze([]),
    warnings: Object.freeze([Object.freeze({
      code: 'DIGEST_EMPTY', severity: 'WARNING', message: 'Digest is empty.', source: null,
    })]),
    info: Object.freeze([]),
  }),
  themes: Object.freeze([Object.freeze({
    manifest: Object.freeze({ id: 'native', name: '原生简洁', version: '1.0.0', author: 'Test', description: '' }),
    css: '', contentHash: 'theme', source: 'builtin', previewPath: null,
  })]),
  selectedThemeId: 'native',
});

describe('WeChatWorkbenchView', () => {
  it('renders the approved empty workbench shell without editable article content', async () => {
    const view = new WeChatWorkbenchView({} as never);

    await view.onOpen();

    expect(view.contentEl.querySelector('[data-testid="workbench-title"]')?.textContent)
      .toBe('WeChat Workbench');
    expect(view.contentEl.querySelectorAll('[role="tab"]')).toHaveLength(2);
    expect(view.contentEl.querySelector('[data-testid="workbench-empty"]')?.textContent)
      .toBe('打开一篇 Markdown 笔记开始预览');
    expect(view.contentEl.querySelectorAll('button:disabled')).toHaveLength(5);
  });

  it('renders artifact, preflight, theme selector, and inert remote placeholder', async () => {
    const selected: string[] = [];
    const copied: string[] = [];
    const view = new WeChatWorkbenchView({} as never);
    view.setController({
      start: () => undefined,
      stop: () => undefined,
      rebuild: () => undefined,
      selectTheme: id => selected.push(id),
      copyForWeChat: async () => { copied.push('rich'); },
      copyHtmlSource: async () => { copied.push('source'); },
      preparePublish: async () => { throw new Error('not used'); },
      executePublish: async () => { throw new Error('not used'); },
      reconcilePublish: async () => { throw new Error('not used'); },
      repairLocalPublish: async () => { throw new Error('not used'); },
      prepareUnlinkAssociation: () => ({ path: 'article.md', basename: 'article', modifiedAt: 1 }),
      unlinkPublishAssociation: async () => undefined,
      coverPickerModel: () => ({ localOptions: [], aiEnabled: false, aiDisabledReason: 'not used' }),
      aiCoverDisclosure: () => { throw new Error('not used'); },
      prepareCover: async () => { throw new Error('not used'); },
      generateAiCover: async () => { throw new Error('not used'); },
      confirmCover: async () => undefined,
    });
    await view.onOpen();

    view.showArtifact(renderState);

    expect(view.contentEl.querySelector('[data-testid="active-article"]')?.textContent).toContain('article.md');
    expect(view.contentEl.querySelector('[data-testid="preflight-status"]')?.textContent).toContain('1 条警告');
    expect(view.contentEl.querySelector('.wechat-article h1')?.textContent).toBe('Article');
    expect(view.contentEl.querySelector('.wechat-workbench__remote-placeholder')?.textContent)
      .toContain('远程图片');
    expect(view.contentEl.querySelector('.wechat-article img[src]')).toBeNull();

    const theme = view.contentEl.querySelector<HTMLSelectElement>('[data-testid="theme-select"]');
    if (theme === null) throw new Error('Theme selector is missing.');
    theme.value = 'native';
    theme.dispatchEvent(new Event('change'));
    expect(selected).toEqual(['native']);

    view.contentEl.querySelector<HTMLButtonElement>('[data-testid="copy-rich"]')?.click();
    await Promise.resolve();
    expect(copied).toEqual(['rich']);
  });
});
