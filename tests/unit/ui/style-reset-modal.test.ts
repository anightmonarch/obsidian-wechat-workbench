import { describe, expect, it, vi } from 'vitest';

import { StyleResetModal } from '../../../src/ui/style-reset-modal';

describe('StyleResetModal', () => {
  it('requires explicit confirmation before resetting article style', () => {
    const confirm = vi.fn();
    const modal = new StyleResetModal({} as never, confirm);

    modal.open();

    expect(modal.titleEl.textContent).toBe('重置样式');
    expect(modal.contentEl.textContent).toContain('把当前主题的样式参数恢复为默认值');
    modal.contentEl.querySelector<HTMLButtonElement>('[data-testid="style-reset-cancel"]')?.click();
    expect(confirm).not.toHaveBeenCalled();

    modal.open();
    modal.contentEl.querySelector<HTMLButtonElement>('[data-testid="style-reset-confirm"]')?.click();
    expect(confirm).toHaveBeenCalledOnce();
  });
});
