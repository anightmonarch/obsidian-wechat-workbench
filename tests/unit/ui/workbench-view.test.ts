import { describe, expect, it, vi } from 'vitest';

import { Menu } from '../../mocks/obsidian';
import { UnlinkAssociationModal } from '../../../src/ui/publish-dialog';
import type { WorkbenchRenderState } from '../../../src/ui/workbench-controller';
import { defaultStyleForTheme } from '../../../src/styles/style-config';
import {
  copyFailureMessage,
  isMissingAccountConfiguration,
  publishPreparationMessage,
  WeChatWorkbenchView,
} from '../../../src/ui/workbench-view';

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
    manifest: Object.freeze({ id: 'native', name: '原生简约', version: '1.0.0', author: 'Test', description: '' }),
    css: '', contentHash: 'theme', source: 'builtin', previewPath: null,
  })]),
  selectedThemeId: 'native',
  style: Object.freeze({
    source: 'legacy', renderMode: 'legacy', themeId: 'native',
    config: defaultStyleForTheme('native'), unsupportedVersion: null,
  }),
  styleSaveStatus: 'saved',
});

describe('WeChatWorkbenchView', () => {
  it('maps internal copy and account failures to specific Chinese actions', () => {
    expect(copyFailureMessage(Object.assign(new Error('raw oversized path'), {
      code: 'IMAGE_TOO_LARGE',
    }))).toBe('文章图片过大，请压缩后再复制。');
    expect(copyFailureMessage(Object.assign(new Error('raw body failure'), {
      code: 'COPY_PREFLIGHT_BLOCKED',
    }))).toBe('请检查文章标题、正文和主题设置后再复制。');
    expect(copyFailureMessage(Object.assign(new Error('raw title failure'), {
      code: 'TITLE_EMPTY',
    }))).toBe('请先填写文章标题再复制。');
    expect(copyFailureMessage(Object.assign(new Error('raw theme failure'), {
      code: 'THEME_INVALID',
    }))).toBe('当前主题不可用，请更换主题后再复制。');
    expect(copyFailureMessage(new Error('provider raw failure')))
      .toBe('复制失败，请检查文章中的图片或 Mermaid 图表。');
    expect(isMissingAccountConfiguration(Object.assign(
      new Error('WeChat account is not configured.'),
      { code: 'WECHAT_ACCOUNT_NOT_CONFIGURED' },
    ))).toBe(true);
    expect(publishPreparationMessage(new Error('A local article image is missing or unreadable.')))
      .toBe('请检查文章中的本地图片后再发文章。');
  });

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
    expect(view.contentEl.textContent).toContain('文章预览');
    expect(view.contentEl.textContent).toContain('发布设置');
    expect(view.contentEl.textContent).toContain('发文章');
    expect(view.contentEl.textContent).toContain('复制');
    expect(view.contentEl.textContent).not.toContain('需处理');
    expect(view.contentEl.textContent).not.toContain('发布检查');
    expect(view.contentEl.textContent).not.toContain('复制 HTML 源码');
    expect(view.contentEl.textContent).not.toContain('重新检查');
    expect(view.contentEl.textContent).not.toContain('解除草稿关联');
    expect(view.contentEl.querySelector('.wechat-workbench__more')).toBeNull();
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
      unlinkPublishAssociation: async () => undefined,
      coverPickerModel: () => ({ localOptions: [], aiEnabled: false, aiDisabledReason: 'not used' }),
      aiCoverDisclosure: () => { throw new Error('not used'); },
      prepareCover: async () => { throw new Error('not used'); },
      generateAiCover: async () => { throw new Error('not used'); },
      confirmCover: async () => undefined,
      saveArticleSettings: async () => undefined,
    });
    await view.onOpen();

    view.showArtifact(renderState);

    const previewTab = [...view.contentEl.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
      .find(tab => tab.textContent === '文章预览');
    expect(previewTab?.textContent).toBe('文章预览');
    expect(previewTab?.textContent).not.toContain('article');

    expect(view.contentEl.querySelector('[data-testid="active-article"]')?.textContent)
      .toBe('已连接 · article');
    expect(view.contentEl.querySelector('[data-testid="active-article"]')?.textContent)
      .not.toContain('article.md');
    expect(view.contentEl.querySelector('[data-testid="preflight-status"]')).toBeNull();
    expect(view.contentEl.querySelector('[data-testid="publish-state"]')).toBeNull();
    expect(view.contentEl.querySelector('.wechat-article h1')?.textContent).toBe('Article');
    expect(view.contentEl.querySelector('.wechat-workbench__remote-placeholder')?.textContent)
      .toContain('远程图片');
    expect(view.contentEl.querySelector('.wechat-article img[src]')).toBeNull();

    view.contentEl.querySelector<HTMLButtonElement>('[data-testid="theme-trigger"]')
      ?.dispatchEvent(new MouseEvent('click'));
    expect(view.contentEl.querySelector('[data-testid="theme-trigger"]')?.textContent)
      .toBe('主题 · 原生简约');
    const option = Menu.last?.items.find(item => item.title === '原生简约');
    expect(option?.checked).toBe(true);
    option?.callback?.();
    expect(selected).toEqual(['native']);

    view.contentEl.querySelector<HTMLButtonElement>('[data-testid="copy-rich"]')?.click();
    await Promise.resolve();
    expect(copied).toEqual(['rich']);
  });

  it('keeps preview actions clickable even when internal preflight has blocking items', async () => {
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
      unlinkPublishAssociation: async () => undefined,
      coverPickerModel: () => ({ localOptions: [], aiEnabled: false, aiDisabledReason: 'not used' }),
      aiCoverDisclosure: () => { throw new Error('not used'); },
      prepareCover: async () => { throw new Error('not used'); },
      generateAiCover: async () => { throw new Error('not used'); },
      confirmCover: async () => undefined,
      saveArticleSettings: async () => undefined,
    });
    await view.onOpen();
    view.showArtifact(Object.freeze({
      ...renderState,
      preflight: Object.freeze({
        ok: false,
        blocking: Object.freeze([Object.freeze({
          code: 'SYNTHETIC_BLOCK', severity: 'BLOCKING' as const,
          message: 'Internal validation detail.', source: null,
        })]),
        warnings: Object.freeze([]),
        info: Object.freeze([]),
      }),
    }));

    expect(view.contentEl.querySelector<HTMLButtonElement>('[data-testid="copy-rich"]')?.disabled)
      .toBe(false);
    expect(view.contentEl.querySelector<HTMLButtonElement>('[data-testid="publish-draft"]')?.disabled)
      .toBe(false);
    expect(view.contentEl.textContent).not.toContain('Internal validation detail.');
  });

  it('hides preview controls on publishing settings and restores them on preview', async () => {
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
      unlinkPublishAssociation: async () => undefined,
      coverPickerModel: () => ({ localOptions: [], aiEnabled: false, aiDisabledReason: 'not used' }),
      aiCoverDisclosure: () => { throw new Error('not used'); },
      prepareCover: async () => { throw new Error('not used'); },
      generateAiCover: async () => { throw new Error('not used'); },
      confirmCover: async () => undefined,
      saveArticleSettings: async () => undefined,
    });
    await view.onOpen();
    view.showArtifact(renderState);

    const settingsTab = [...view.contentEl.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
      .find(tab => tab.textContent === '发布设置');
    settingsTab?.click();
    expect(view.contentEl.querySelector<HTMLElement>('[data-testid="preview-actions"]')?.hidden)
      .toBe(true);
    expect(view.contentEl.querySelector<HTMLElement>('[data-testid="preview-actions"]')?.style.display)
      .toBe('none');
    expect(view.contentEl.querySelector<HTMLElement>('[data-testid="article-connection"]')?.hidden)
      .toBe(true);
    expect(view.contentEl.querySelector<HTMLElement>('[data-testid="article-connection"]')?.style.display)
      .toBe('none');
    expect(view.contentEl.querySelector<HTMLElement>('.wechat-workbench__publish-settings')?.hidden)
      .toBe(false);

    const previewTab = [...view.contentEl.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
      .find(tab => tab.textContent === '文章预览');
    previewTab?.click();
    expect(view.contentEl.querySelector<HTMLElement>('[data-testid="preview-actions"]')?.hidden)
      .toBe(false);
    expect(view.contentEl.querySelector<HTMLElement>('[data-testid="preview-actions"]')?.style.display)
      .toBe('');
    expect(view.contentEl.querySelector<HTMLElement>('[data-testid="article-connection"]')?.hidden)
      .toBe(false);
    expect(view.contentEl.querySelector<HTMLElement>('[data-testid="article-connection"]')?.style.display)
      .toBe('');
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
      unlinkPublishAssociation: async () => undefined,
      coverPickerModel: () => ({ localOptions: [], aiEnabled: false, aiDisabledReason: 'not used' }),
      aiCoverDisclosure: () => { throw new Error('not used'); },
      prepareCover: async () => { throw new Error('not used'); },
      generateAiCover: async () => { throw new Error('not used'); },
      confirmCover: async () => undefined,
      saveArticleSettings: async () => undefined,
    });
    await view.onOpen();

    view.showError('ENOENT: /Users/private/article.md and secret=should-not-render');

    expect(view.contentEl.textContent).toContain('文章排版失败');
    expect(view.contentEl.textContent).not.toContain('/Users/private/article.md');
    expect(view.contentEl.textContent).not.toContain('重新检查');
    expect(rebuild).not.toHaveBeenCalled();
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
        new Error('WeChat account is not configured.'),
        { code: 'WECHAT_ACCOUNT_NOT_CONFIGURED' },
      )),
      executePublish: async () => { throw new Error('not used'); },
      reconcilePublish: async () => { throw new Error('not used'); },
      repairLocalPublish: async () => { throw new Error('not used'); },
      unlinkPublishAssociation: async () => undefined,
      coverPickerModel: () => ({ localOptions: [], aiEnabled: false, aiDisabledReason: 'not used' }),
      aiCoverDisclosure: () => { throw new Error('not used'); },
      prepareCover: async () => { throw new Error('not used'); },
      generateAiCover: async () => { throw new Error('not used'); },
      confirmCover: async () => undefined,
      saveArticleSettings: async () => undefined,
    });
    await view.onOpen();
    view.showArtifact(renderState);

    view.contentEl.querySelector<HTMLButtonElement>('[data-testid="publish-draft"]')?.click();
    await new Promise(resolve => window.setTimeout(resolve, 0));

    expect(openSettings).toHaveBeenCalledOnce();
  });

  it('opens contextual unlink recovery when draft preparation finds another account association', async () => {
    const openUnlink = vi.spyOn(UnlinkAssociationModal.prototype, 'open');
    const view = new WeChatWorkbenchView({} as never);
    view.setController({
      start: () => undefined,
      stop: () => undefined,
      rebuild: () => undefined,
      selectTheme: () => undefined,
      copyForWeChat: async () => undefined,
      copyHtmlSource: async () => undefined,
      preparePublish: async () => Promise.reject(Object.assign(
        new Error('raw association mismatch'),
        {
          code: 'DRAFT_ACCOUNT_MISMATCH',
          association: {
            file: { path: 'article.md', basename: 'article', modifiedAt: 1 },
            draftId: 'OLD_MEDIA_ID',
            accountId: 'OLD_ACCOUNT_HASH',
          },
        },
      )),
      executePublish: async () => { throw new Error('not used'); },
      reconcilePublish: async () => { throw new Error('not used'); },
      repairLocalPublish: async () => { throw new Error('not used'); },
      unlinkPublishAssociation: async () => undefined,
      coverPickerModel: () => ({ localOptions: [], aiEnabled: false, aiDisabledReason: 'not used' }),
      aiCoverDisclosure: () => { throw new Error('not used'); },
      prepareCover: async () => { throw new Error('not used'); },
      generateAiCover: async () => { throw new Error('not used'); },
      confirmCover: async () => undefined,
      saveArticleSettings: async () => undefined,
    });
    await view.onOpen();
    view.showArtifact(renderState);

    view.contentEl.querySelector<HTMLButtonElement>('[data-testid="publish-draft"]')?.click();
    await new Promise(resolve => window.setTimeout(resolve, 0));

    expect(openUnlink).toHaveBeenCalledOnce();
  });
});
