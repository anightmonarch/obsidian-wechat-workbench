import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import '../../mocks/obsidian';
import { renderState } from '../../fixtures/workbench-render-state';
import { renderPublishSettings } from '../../../src/ui/workbench-publish-settings';
import { publishPayloadHash } from '../../../src/publish/publish-content';

describe('publish settings', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('shows article, cover, and sync sections without internal identifiers and autosaves edits', async () => {
    const host = document.createElement('section');
    const chooseCover = vi.fn();
    const saveArticle = vi.fn(async () => undefined);

    renderPublishSettings(host, renderState, { chooseCover, saveArticle });

    expect(host.textContent).toContain('文章信息');
    expect(host.textContent).toContain('文章封面');
    expect(host.textContent).toContain('发布状态');
    const publishStatus = host.querySelector<HTMLElement>('[data-testid="settings-publish-status-section"]');
    expect(publishStatus).not.toBeNull();
    expect(publishStatus?.querySelector('.wechat-workbench__settings-section')).toBeNull();
    expect(host.textContent).not.toMatch(/contentHash|taskId|mediaId|content/u);
    expect(host.querySelector<HTMLInputElement>('[data-testid="settings-title"]')?.value)
      .toBe('');
    expect(host.querySelector<HTMLInputElement>('[data-testid="settings-title"]')?.placeholder)
      .toBe('当前：Article');
    expect(host.querySelector<HTMLInputElement>('[data-testid="settings-author"]')?.value)
      .toBe('');
    expect(host.querySelector<HTMLInputElement>('[data-testid="settings-author"]')?.placeholder)
      .toBe('当前：Author');
    expect(host.querySelector<HTMLTextAreaElement>('[data-testid="settings-digest"]')?.value)
      .toBe('');
    expect(host.querySelector('[data-testid="settings-save"]')).toBeNull();
    expect(host.querySelector('[data-testid="settings-source-url"]')).toBeNull();
    expect(host.textContent).not.toContain('原文链接');

    expect(host.textContent).not.toContain('正文图片变化时自动跟随；推荐尺寸 2.35:1');
    expect(host.textContent).not.toContain('当前使用显式封面；可随时恢复文章首图。');
    const coverActions = [...host.querySelectorAll<HTMLButtonElement>('button[data-testid^="settings-cover-"]')];
    expect(coverActions.map(button => button.textContent)).toEqual(['文章首图', '本地上传', '智能生成']);
    coverActions[2]?.click();
    expect(chooseCover).toHaveBeenCalledWith('ai');

    const title = host.querySelector<HTMLInputElement>('[data-testid="settings-title"]');
    const author = host.querySelector<HTMLInputElement>('[data-testid="settings-author"]');
    const digest = host.querySelector<HTMLTextAreaElement>('[data-testid="settings-digest"]');
    if (title === null || author === null || digest === null) {
      throw new Error('Editable article settings are missing.');
    }
    expect(author.getAttribute('type')).toBe('text');
    expect(digest.maxLength).toBe(120);
    title.value = 'Updated title';
    author.value = 'Demo Author';
    digest.value = 'Updated digest';
    title.dispatchEvent(new Event('input', { bubbles: true }));
    author.dispatchEvent(new Event('input', { bubbles: true }));
    digest.dispatchEvent(new Event('input', { bubbles: true }));

    expect(saveArticle).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(499);
    expect(saveArticle).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(saveArticle).toHaveBeenCalledWith({
      title: 'Updated title',
      author: 'Demo Author',
      digest: 'Updated digest',
      contentSourceUrl: '',
    });
    await vi.runAllTimersAsync();
    expect(host.querySelector('[data-testid="settings-save-status"]')?.textContent).toBe('已保存');
  });

  it('keeps the same fields and AI candidates when the render state refreshes', async () => {
    const host = document.createElement('section');
    const generateTitles = vi.fn(async () => ['标题一', '标题二', '标题三'] as const);
    const generateDigest = vi.fn(async () => '摘要候选');
    const saveArticle = vi.fn(async () => undefined);
    const actions = { chooseCover: vi.fn(), saveArticle, generateTitles, generateDigest };
    renderPublishSettings(host, renderState, actions);

    const title = host.querySelector<HTMLInputElement>('[data-testid="settings-title"]');
    const titleButton = host.querySelector<HTMLButtonElement>('[data-testid="settings-title-ai"]');
    if (title === null || titleButton === null) throw new Error('Title controls are missing.');
    title.value = '本地编辑中的标题';
    title.dispatchEvent(new Event('input', { bubbles: true }));
    titleButton.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(host.querySelector('[data-title-candidate="标题二"]')).not.toBeNull();
    const refreshed = Object.freeze({
      ...renderState,
      snapshot: Object.freeze({
        ...renderState.snapshot,
        frontmatter: Object.freeze({ title: 'Article title from disk' }),
      }),
    });
    renderPublishSettings(host, refreshed, actions);

    expect(host.querySelector<HTMLInputElement>('[data-testid="settings-title"]')).toBe(title);
    expect(title.value).toBe('本地编辑中的标题');
    expect(host.querySelectorAll('[data-title-candidate]')).toHaveLength(3);
    expect(generateTitles).toHaveBeenCalledOnce();
    expect(generateDigest).not.toHaveBeenCalled();
  });

  it('does not nest AI controls inside a field label', () => {
    const host = document.createElement('section');
    renderPublishSettings(host, renderState, {
      chooseCover: vi.fn(), saveArticle: vi.fn(async () => undefined),
      generateTitles: vi.fn(async () => ['标题一', '标题二', '标题三'] as const),
      generateDigest: vi.fn(async () => '摘要候选'),
    });

    expect(host.querySelector('[data-testid="settings-title-ai"]')?.closest('label')).toBeNull();
    expect(host.querySelector('[data-testid="settings-digest-ai"]')?.closest('label')).toBeNull();
    expect(host.querySelector('[data-testid="settings-title"]')?.closest('label')).toBeNull();
    expect(host.querySelector('[data-testid="settings-digest"]')?.closest('label')).toBeNull();
  });

  it('allows adopting and regenerating title and digest candidates in the current session', async () => {
    const host = document.createElement('section');
    const generateTitles = vi.fn()
      .mockResolvedValueOnce(['标题一', '标题二', '标题三'] as const)
      .mockResolvedValueOnce(['新标题一', '新标题二', '新标题三'] as const);
    const generateDigest = vi.fn(async () => '摘要候选');
    const saveArticle = vi.fn(async () => undefined);
    renderPublishSettings(host, renderState, {
      chooseCover: vi.fn(), saveArticle, generateTitles, generateDigest,
    });

    host.querySelector<HTMLButtonElement>('[data-testid="settings-title-ai"]')?.click();
    await Promise.resolve();
    await Promise.resolve();
    host.querySelector<HTMLButtonElement>('[data-title-candidate="标题二"]')?.click();
    expect(host.querySelector<HTMLInputElement>('[data-testid="settings-title"]')?.value).toBe('标题二');
    expect(host.querySelector('[data-testid="settings-title-candidates"]')?.textContent).toBe('');

    host.querySelector<HTMLButtonElement>('[data-testid="settings-title-ai"]')?.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(host.querySelector('[data-title-candidate="标题一"]')).toBeNull();
    expect(host.querySelector('[data-title-candidate="新标题一"]')).not.toBeNull();

    host.querySelector<HTMLButtonElement>('[data-testid="settings-digest-ai"]')?.click();
    await Promise.resolve();
    await Promise.resolve();
    host.querySelector<HTMLButtonElement>('[data-digest-candidate]')?.click();
    expect(host.querySelector<HTMLTextAreaElement>('[data-testid="settings-digest"]')?.value).toBe('摘要候选');
    expect(host.querySelector('[data-testid="settings-digest-candidates"]')?.textContent).toBe('');

    await vi.advanceTimersByTimeAsync(500);
    expect(saveArticle).toHaveBeenCalled();
  });

  it('caps an AI digest candidate to the WeChat 120-character limit before adoption', async () => {
    const host = document.createElement('section');
    const longDigest = '摘'.repeat(121);
    renderPublishSettings(host, renderState, {
      chooseCover: vi.fn(),
      saveArticle: vi.fn(async () => undefined),
      generateDigest: vi.fn(async () => longDigest),
    });

    host.querySelector<HTMLButtonElement>('[data-testid="settings-digest-ai"]')?.click();
    await Promise.resolve();
    await Promise.resolve();
    host.querySelector<HTMLButtonElement>('[data-digest-candidate]')?.click();

    expect(host.querySelector<HTMLTextAreaElement>('[data-testid="settings-digest"]')?.value).toHaveLength(120);
  });

  it('shows actionable text-generation failures instead of blaming every failure on configuration', async () => {
    const host = document.createElement('section');
    renderPublishSettings(host, renderState, {
      chooseCover: vi.fn(),
      saveArticle: vi.fn(async () => undefined),
      generateTitles: vi.fn(async () => {
        throw Object.assign(new Error('Text provider request timed out.'), { code: 'AI_TEXT_PROVIDER_TIMEOUT' });
      }),
      generateDigest: vi.fn(async () => {
        throw Object.assign(new Error('Text provider returned malformed output.'), { code: 'AI_TEXT_PROVIDER_OUTPUT_INVALID' });
      }),
    });

    host.querySelector<HTMLButtonElement>('[data-testid="settings-title-ai"]')?.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(host.querySelector('[data-testid="settings-title-candidates"]')?.textContent)
      .toContain('服务响应超时，请稍后重试');

    host.querySelector<HTMLButtonElement>('[data-testid="settings-digest-ai"]')?.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(host.querySelector('[data-testid="settings-digest-candidates"]')?.textContent)
      .toContain('服务返回格式异常，请重新生成');
  });

  it('keeps adopted candidates hidden when an earlier regeneration resolves late', async () => {
    const host = document.createElement('section');
    let resolveTitle: ((value: readonly string[]) => void) | undefined;
    let resolveDigest: ((value: string) => void) | undefined;
    const generateTitles = vi.fn()
      .mockResolvedValueOnce(['标题一', '标题二', '标题三'] as const)
      .mockImplementationOnce(() => new Promise<readonly string[]>(resolve => { resolveTitle = resolve; }));
    const generateDigest = vi.fn()
      .mockResolvedValueOnce('摘要一')
      .mockImplementationOnce(() => new Promise<string>(resolve => { resolveDigest = resolve; }));
    renderPublishSettings(host, renderState, {
      chooseCover: vi.fn(), saveArticle: vi.fn(async () => undefined), generateTitles, generateDigest,
    });

    host.querySelector<HTMLButtonElement>('[data-testid="settings-title-ai"]')?.click();
    await Promise.resolve();
    await Promise.resolve();
    host.querySelector<HTMLButtonElement>('[data-testid="settings-title-regenerate"]')?.click();
    host.querySelector<HTMLButtonElement>('[data-title-candidate="标题一"]')?.click();
    resolveTitle?.(['迟到标题一', '迟到标题二', '迟到标题三']);
    await Promise.resolve();
    await Promise.resolve();
    expect(host.querySelector('[data-testid="settings-title-candidates"]')?.textContent).toBe('');

    host.querySelector<HTMLButtonElement>('[data-testid="settings-digest-ai"]')?.click();
    await Promise.resolve();
    await Promise.resolve();
    host.querySelector<HTMLButtonElement>('[data-testid="settings-digest-regenerate"]')?.click();
    host.querySelector<HTMLButtonElement>('[data-digest-candidate]')?.click();
    resolveDigest?.('迟到摘要');
    await Promise.resolve();
    await Promise.resolve();
    expect(host.querySelector('[data-testid="settings-digest-candidates"]')?.textContent).toBe('');
  });

  it('closes a title candidate session and ignores its late response', async () => {
    const host = document.createElement('section');
    let resolveTitles: ((value: readonly string[]) => void) | undefined;
    const generateTitles = vi.fn(() => new Promise<readonly string[]>(resolve => { resolveTitles = resolve; }));
    renderPublishSettings(host, renderState, {
      chooseCover: vi.fn(), saveArticle: vi.fn(async () => undefined), generateTitles,
    });

    host.querySelector<HTMLButtonElement>('[data-testid="settings-title-ai"]')?.click();
    const close = host.querySelector<HTMLButtonElement>('[data-testid="settings-title-candidates-close"]');
    expect(close).not.toBeNull();
    close?.click();
    resolveTitles?.(['迟到标题一', '迟到标题二', '迟到标题三']);
    await Promise.resolve();
    await Promise.resolve();

    expect(host.querySelector('[data-testid="settings-title-candidates"]')?.textContent).toBe('');
  });

  it('renders the first article image as the default cover thumbnail', async () => {
    const host = document.createElement('section');
    const firstImage = Object.freeze({
      id: 'asset:first', kind: 'local-image' as const, source: 'assets/first.png',
      status: 'resolved' as const, contentHash: 'first-image', resolvedUrl: null,
    });
    const state = Object.freeze({
      ...renderState,
      artifact: Object.freeze({ ...renderState.artifact, assets: Object.freeze([firstImage]) }),
    });
    const resolveCoverPreview = vi.fn(async () => 'data:image/png;base64,FIRST');

    renderPublishSettings(host, state, {
      chooseCover: vi.fn(), saveArticle: vi.fn(async () => undefined), resolveCoverPreview,
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(resolveCoverPreview).toHaveBeenCalledWith(firstImage);
    expect(host.querySelector<HTMLImageElement>('[data-testid="settings-cover-preview"]')?.src)
      .toContain('data:image/png;base64,FIRST');
  });

  it('exposes a click-to-preview affordance on the cover thumbnail', async () => {
    const host = document.createElement('section');
    const firstImage = Object.freeze({
      id: 'asset:first', kind: 'local-image' as const, source: 'assets/first.png',
      status: 'resolved' as const, contentHash: 'first-image', resolvedUrl: null,
    });
    const state = Object.freeze({
      ...renderState,
      artifact: Object.freeze({ ...renderState.artifact, assets: Object.freeze([firstImage]) }),
    });
    const resolveCoverPreview = vi.fn(async () => 'data:image/png;base64,FIRST');
    const openCoverPreview = vi.fn();

    renderPublishSettings(host, state, {
      chooseCover: vi.fn(), saveArticle: vi.fn(async () => undefined),
      resolveCoverPreview, openCoverPreview,
    });
    await Promise.resolve();
    await Promise.resolve();

    const thumb = host.querySelector<HTMLElement>('[data-testid="settings-cover-thumbnail"]');
    expect(thumb).not.toBeNull();
    expect(thumb?.getAttribute('data-preview-url')).toBe('data:image/png;base64,FIRST');
    expect(thumb?.getAttribute('aria-label')).toBe('点击预览文章封面');
    expect(thumb?.getAttribute('role')).toBe('button');
    expect(thumb?.tabIndex).toBe(0);
    thumb?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(openCoverPreview).toHaveBeenCalledWith('data:image/png;base64,FIRST', '文章首图预览');
  });

  it('does not register a click handler when no openCoverPreview action is provided', async () => {
    const host = document.createElement('section');
    const firstImage = Object.freeze({
      id: 'asset:first', kind: 'local-image' as const, source: 'assets/first.png',
      status: 'resolved' as const, contentHash: 'first-image', resolvedUrl: null,
    });
    const state = Object.freeze({
      ...renderState,
      artifact: Object.freeze({ ...renderState.artifact, assets: Object.freeze([firstImage]) }),
    });
    const resolveCoverPreview = vi.fn(async () => 'data:image/png;base64,NO_HANDLER');

    renderPublishSettings(host, state, {
      chooseCover: vi.fn(), saveArticle: vi.fn(async () => undefined), resolveCoverPreview,
    });
    await Promise.resolve();
    await Promise.resolve();

    const thumb = host.querySelector<HTMLElement>('[data-testid="settings-cover-thumbnail"]');
    expect(thumb).not.toBeNull();
    expect(thumb?.getAttribute('data-preview-url')).toBe('data:image/png;base64,NO_HANDLER');
    expect(thumb?.getAttribute('aria-label')).toBeNull();
  });

  it('renders an explicit cover path instead of falling back to the first article image', async () => {
    const host = document.createElement('section');
    const firstImage = Object.freeze({
      id: 'asset:first', kind: 'local-image' as const, source: 'assets/first.png',
      status: 'resolved' as const, contentHash: 'first-image', resolvedUrl: null,
    });
    const explicitPath = '.wechat-workbench/covers/article/cover.png';
    const state = Object.freeze({
      ...renderState,
      artifact: Object.freeze({
        ...renderState.artifact,
        metadata: Object.freeze({ ...renderState.artifact.metadata, cover: explicitPath }),
        assets: Object.freeze([firstImage]),
      }),
    });
    const resolveCoverPreview = vi.fn(async () => 'data:image/png;base64,EXPLICIT');

    renderPublishSettings(host, state, {
      chooseCover: vi.fn(), saveArticle: vi.fn(async () => undefined), resolveCoverPreview,
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(resolveCoverPreview).toHaveBeenCalledWith(explicitPath);
    expect(host.querySelector<HTMLImageElement>('[data-testid="settings-cover-preview"]')?.src)
      .toContain('data:image/png;base64,EXPLICIT');
  });

  it('edits explicit frontmatter values without materializing inherited defaults', () => {
    const host = document.createElement('section');
    const state = Object.freeze({
      ...renderState,
      snapshot: Object.freeze({
        ...renderState.snapshot,
        frontmatter: Object.freeze({ title: 'Explicit title', digest: 'Explicit digest' }),
      }),
    });

    renderPublishSettings(host, state, {
      chooseCover: vi.fn(),
      saveArticle: vi.fn(async () => undefined),
    });

    expect(host.querySelector<HTMLInputElement>('[data-testid="settings-title"]')?.value)
      .toBe('Explicit title');
    expect(host.querySelector<HTMLInputElement>('[data-testid="settings-author"]')?.value)
      .toBe('');
    expect(host.querySelector<HTMLTextAreaElement>('[data-testid="settings-digest"]')?.value)
      .toBe('Explicit digest');
  });

  it('summarizes an associated note without exposing the cover path and flags stale content', () => {
    const host = document.createElement('section');
    const state = Object.freeze({
      ...renderState,
      snapshot: Object.freeze({
        ...renderState.snapshot,
        frontmatter: Object.freeze({
          'wechat-draft-id': 'MEDIA_ID',
          'wechat-content-hash': 'stale',
          'wechat-theme-id': renderState.artifact.theme.id,
          'wechat-theme-version': renderState.artifact.theme.version,
          'wechat-synced-at': '2026-08-20T00:00:00.000Z',
        }),
      }),
      artifact: Object.freeze({
        ...renderState.artifact,
        metadata: Object.freeze({ ...renderState.artifact.metadata, cover: 'assets/secret-cover.png' }),
      }),
    });

    renderPublishSettings(host, state, {
      chooseCover: vi.fn(),
      saveArticle: vi.fn(async () => undefined),
    });

    expect(host.textContent).toContain('有未同步修改');
    expect(host.textContent).not.toContain('assets/secret-cover.png');
    expect(host.textContent).not.toContain('MEDIA_ID');
    expect(host.textContent).not.toContain('stale');
    expect(host.textContent).toContain('2026-08-20T00:00:00.000Z');
    expect(publishPayloadHash(state.artifact)).not.toBe('stale');
  });
});
