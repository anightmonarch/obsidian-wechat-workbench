import { describe, expect, it, vi } from 'vitest';

import { Menu } from '../../mocks/obsidian';
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
  it('renders the WeSight-style shell without login or account internals', async () => {
    const openSettings = vi.fn();
    const view = new WeChatWorkbenchView({} as never, undefined, openSettings);

    await view.onOpen();

    expect([...view.contentEl.children].slice(0, 4).map(node => node.className)).toEqual([
      'wechat-workbench__brand-header',
      'wechat-workbench__tabs',
      'wechat-workbench__action-bar',
      'wechat-workbench__summary-row',
    ]);
    expect(view.contentEl.querySelector('[data-testid="workbench-title"]')?.textContent)
      .toBe('WeChat Workbench');
    expect(view.contentEl.querySelectorAll('[role="tab"]')).toHaveLength(2);
    expect(view.contentEl.textContent).toContain('公众号预览');
    expect(view.contentEl.textContent).toContain('发布设置');
    expect(view.contentEl.textContent).toContain('发文章');
    expect(view.contentEl.textContent).toContain('复制');
    expect(view.contentEl.textContent).not.toContain('123456');
    expect(view.contentEl.textContent).not.toContain('登录');
    expect(view.contentEl.querySelector('[data-testid="workbench-empty"]')?.textContent)
      .toBe('打开一篇 Markdown 笔记开始预览');
    view.contentEl.querySelector<HTMLButtonElement>('[data-testid="account-settings"]')?.click();
    expect(openSettings).toHaveBeenCalledOnce();
  });

  it('renders a compact ready state and opens a checked theme menu', async () => {
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

    expect(view.contentEl.querySelector('[data-testid="active-article"]')?.textContent)
      .toBe('已连接 · article');
    expect(view.contentEl.querySelector('[data-testid="active-article"]')?.textContent)
      .not.toContain('article.md');
    expect(view.contentEl.querySelector('[data-testid="preflight-status"]')?.textContent)
      .toBe('发布检查通过');
    expect(view.contentEl.textContent).not.toContain('Digest is empty.');
    view.contentEl.querySelector<HTMLButtonElement>('[data-testid="preflight-status"]')?.click();
    expect(view.contentEl.textContent).toContain('Digest is empty.');
    expect(view.contentEl.querySelector('.wechat-article h1')?.textContent).toBe('Article');
    expect(view.contentEl.querySelector('.wechat-workbench__remote-placeholder')?.textContent)
      .toContain('远程图片');
    expect(view.contentEl.querySelector('.wechat-article img[src]')).toBeNull();

    view.contentEl.querySelector<HTMLButtonElement>('[data-testid="theme-trigger"]')
      ?.dispatchEvent(new MouseEvent('click'));
    const option = Menu.last?.items.find(item => item.title === '原生简洁');
    expect(option?.checked).toBe(true);
    option?.callback?.();
    expect(selected).toEqual(['native']);

    view.contentEl.querySelector<HTMLButtonElement>('[data-testid="copy-rich"]')?.click();
    await Promise.resolve();
    expect(copied).toEqual(['rich']);
  });

  it('keeps a stable preview during rebuild and exposes focused publishing settings', async () => {
    const view = new WeChatWorkbenchView({} as never);
    view.setController({
      start: () => undefined,
      stop: () => undefined,
      rebuild: () => undefined,
      selectTheme: () => undefined,
      copyForWeChat: async () => undefined,
      copyHtmlSource: async () => undefined,
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
    view.contentEl.querySelector<HTMLButtonElement>('[data-testid="preflight-status"]')?.click();
    expect(view.contentEl.textContent).toContain('Digest is empty.');
    view.showLoading('article.md');

    expect(view.contentEl.querySelector('.wechat-article h1')?.textContent).toBe('Article');
    expect(view.contentEl.querySelector('[data-testid="publish-state"]')?.textContent).toBe('正在排版');
    expect(view.contentEl.querySelector<HTMLButtonElement>('[data-testid="preflight-status"]')?.disabled)
      .toBe(true);
    expect(view.contentEl.querySelector('[data-testid="preflight-status"]')?.getAttribute('aria-expanded'))
      .toBe('false');
    expect(view.contentEl.textContent).not.toContain('Digest is empty.');

    const settingsTab = [...view.contentEl.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
      .find(tab => tab.textContent === '发布设置');
    settingsTab?.click();
    const settings = view.contentEl.querySelector('.wechat-workbench__publish-settings');
    expect(settings?.textContent).not.toContain('Article');
    expect(settings?.textContent).toContain('正在排版');
  });

  it('offers a safe retry after a render error without exposing raw diagnostics', async () => {
    const rebuild = vi.fn();
    const view = new WeChatWorkbenchView({} as never);
    view.setController({
      start: () => undefined,
      stop: () => undefined,
      rebuild,
      selectTheme: () => undefined,
      copyForWeChat: async () => undefined,
      copyHtmlSource: async () => undefined,
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

    view.showError('ENOENT: /Users/private/article.md and secret=should-not-render');

    expect(view.contentEl.textContent).toContain('文章排版失败');
    expect(view.contentEl.textContent).not.toContain('/Users/private/article.md');
    const retry = view.contentEl.querySelector<HTMLButtonElement>('[data-testid="recheck"]');
    expect(retry?.disabled).toBe(false);
    retry?.click();
    expect(rebuild).toHaveBeenCalledWith('manual-check');
  });

  it('opens local account settings when draft preparation reports missing configuration', async () => {
    const openSettings = vi.fn();
    const view = new WeChatWorkbenchView({} as never, undefined, openSettings);
    view.setController({
      start: () => undefined,
      stop: () => undefined,
      rebuild: () => undefined,
      selectTheme: () => undefined,
      copyForWeChat: async () => undefined,
      copyHtmlSource: async () => undefined,
      preparePublish: async () => Promise.reject(Object.assign(
        new Error('微信公众号 AppSecret 未配置。'),
        { code: 'PUBLISH_PREPARE_BLOCKED' },
      )),
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

    view.contentEl.querySelector<HTMLButtonElement>('[data-testid="publish-draft"]')?.click();
    await new Promise(resolve => window.setTimeout(resolve, 0));

    expect(openSettings).toHaveBeenCalledOnce();
  });
});
