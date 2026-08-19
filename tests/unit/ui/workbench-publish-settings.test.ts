import { describe, expect, it, vi } from 'vitest';

import '../../mocks/obsidian';
import { renderState } from '../../fixtures/workbench-render-state';
import { renderPublishSettings } from '../../../src/ui/workbench-publish-settings';
import { publishPayloadHash } from '../../../src/publish/publish-content';

describe('publish settings', () => {
  it('shows article, cover, and sync sections without internal identifiers', () => {
    const host = document.createElement('section');
    const chooseCover = vi.fn();

    renderPublishSettings(host, renderState, { chooseCover });

    expect(host.textContent).toContain('文章信息');
    expect(host.textContent).toContain('文章封面');
    expect(host.textContent).toContain('发布状态');
    expect(host.textContent).toContain('Article');
    expect(host.textContent).not.toMatch(/contentHash|taskId|mediaId|content/u);

    host.querySelector<HTMLButtonElement>('[data-testid="settings-cover"]')?.click();
    expect(chooseCover).toHaveBeenCalledOnce();
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

    renderPublishSettings(host, state, { chooseCover: vi.fn() });

    expect(host.textContent).toContain('有未同步修改');
    expect(host.textContent).not.toContain('assets/secret-cover.png');
    expect(host.textContent).toContain('已选择封面');
    expect(host.textContent).not.toContain('MEDIA_ID');
    expect(host.textContent).not.toContain('stale');
    expect(host.textContent).toContain('2026-08-20T00:00:00.000Z');
    expect(publishPayloadHash(state.artifact)).not.toBe('stale');
  });
});
