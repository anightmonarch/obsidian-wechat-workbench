import { describe, expect, it, vi } from 'vitest';

import { renderState } from '../../fixtures/workbench-render-state';
import { StyleWorkbench } from '../../../src/ui/style-workbench';

describe('StyleWorkbench', () => {
  it('renders the user-facing style controls without internal diagnostics', () => {
    const container = document.createElement('div');
    const panel = new StyleWorkbench(container, {
      patch: vi.fn(),
      selectTheme: vi.fn(),
      reset: vi.fn(),
      setGlobalDefault: vi.fn(async () => undefined),
      close: vi.fn(),
    });

    panel.render(renderState);

    expect(container.textContent).toContain('主题');
    expect(container.textContent).toContain('字体');
    expect(container.textContent).toContain('字号');
    expect(container.textContent).toContain('主题色');
    expect(container.textContent).toContain('标题');
    expect(container.textContent).toContain('代码');
    expect(container.textContent).toContain('图注');
    expect(container.textContent).toContain('段落');
    expect(container.textContent).not.toMatch(/hash|generation|CSS|校验|诊断/iu);
    expect(container.querySelectorAll('[role="switch"]')).not.toHaveLength(0);
    expect(container.querySelector('[data-style-theme="native"]')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('emits immediate style actions and closes on Escape', () => {
    const container = document.createElement('div');
    const actions = {
      patch: vi.fn(),
      selectTheme: vi.fn(),
      reset: vi.fn(),
      setGlobalDefault: vi.fn(async () => undefined),
      close: vi.fn(),
    };
    const panel = new StyleWorkbench(container, actions);
    panel.render(renderState);

    container.querySelector<HTMLButtonElement>('[data-style-color="#009874"]')?.click();
    container.querySelector<HTMLButtonElement>('[data-style-theme="native"]')?.click();
    const switchElement = container.querySelector<HTMLElement>('[role="switch"]');
    switchElement?.click();
    container.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(actions.patch).toHaveBeenCalled();
    expect(actions.selectTheme).toHaveBeenCalledWith('native');
    expect(actions.close).toHaveBeenCalledOnce();
  });
});
