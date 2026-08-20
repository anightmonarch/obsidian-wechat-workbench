import { describe, expect, it, vi } from 'vitest';

import '../../mocks/obsidian';
import { renderState } from '../../fixtures/workbench-render-state';
import { renderPublishSettings } from '../../../src/ui/workbench-publish-settings';
import { publishPayloadHash } from '../../../src/publish/publish-content';

describe('publish settings', () => {
  it('shows article, cover, and sync sections without internal identifiers', () => {
    const host = document.createElement('section');
    const chooseCover = vi.fn();
    const saveArticle = vi.fn(async () => undefined);

    renderPublishSettings(host, renderState, { chooseCover, saveArticle });

    expect(host.textContent).toContain('文章信息');
    expect(host.textContent).toContain('文章封面');
    expect(host.textContent).toContain('发布状态');
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

    host.querySelector<HTMLButtonElement>('[data-testid="settings-cover"]')?.click();
    expect(chooseCover).toHaveBeenCalledOnce();

    const title = host.querySelector<HTMLInputElement>('[data-testid="settings-title"]');
    const author = host.querySelector<HTMLInputElement>('[data-testid="settings-author"]');
    const digest = host.querySelector<HTMLTextAreaElement>('[data-testid="settings-digest"]');
    const source = host.querySelector<HTMLInputElement>('[data-testid="settings-source-url"]');
    if (title === null || author === null || digest === null || source === null) {
      throw new Error('Editable article settings are missing.');
    }
    title.value = 'Updated title';
    author.value = 'wbs';
    digest.value = 'Updated digest';
    source.value = 'https://example.com/source';
    host.querySelector<HTMLButtonElement>('[data-testid="settings-save"]')?.click();

    expect(saveArticle).toHaveBeenCalledWith({
      title: 'Updated title',
      author: 'wbs',
      digest: 'Updated digest',
      contentSourceUrl: 'https://example.com/source',
    });
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
    expect(host.textContent).toContain('已选择封面');
    expect(host.textContent).not.toContain('MEDIA_ID');
    expect(host.textContent).not.toContain('stale');
    expect(host.textContent).toContain('2026-08-20T00:00:00.000Z');
    expect(publishPayloadHash(state.artifact)).not.toBe('stale');
  });
});
