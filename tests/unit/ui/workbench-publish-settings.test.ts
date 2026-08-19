import { describe, expect, it, vi } from 'vitest';

import '../../mocks/obsidian';
import { renderState } from '../../fixtures/workbench-render-state';
import { renderPublishSettings } from '../../../src/ui/workbench-publish-settings';

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
});
