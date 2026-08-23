import { describe, expect, it, vi } from 'vitest';

import { renderState } from '../../fixtures/workbench-render-state';
import { StyleWorkbench } from '../../../src/ui/style-workbench';

describe('StyleWorkbench', () => {
  it('renders the user-facing style controls without internal diagnostics', () => {
    const container = document.createElement('div');
    const panel = new StyleWorkbench({} as never, container, {
      patch: vi.fn(),
      selectTheme: vi.fn(),
      reset: vi.fn(),
      close: vi.fn(),
    });

    panel.render(renderState);

    expect(container.textContent).toContain('主题');
    expect(container.textContent).toContain('字体');
    expect(container.textContent).toContain('字号');
    expect(container.textContent).toContain('主题色');
    expect(container.textContent).toContain('标题');
    expect(container.textContent).toContain('代码主题');
    expect(container.textContent).toContain('图注');
    expect(container.textContent).not.toContain('其他主题');
    expect(container.textContent).not.toContain('编辑精选');
    expect(container.textContent).not.toContain('原生简约');
    expect(container.textContent).not.toContain('技术文档');
    expect(container.textContent).not.toContain('苍绿');
    expect(container.querySelector('[data-style-theme="doocs-classic"]')).not.toBeNull();
    expect(container.querySelector('[data-style-theme="doocs-grace"]')).not.toBeNull();
    expect(container.querySelector('[data-style-theme="doocs-simple"]')).not.toBeNull();
    expect(container.textContent).not.toMatch(/hash|generation|CSS|校验|诊断/iu);
    expect(container.querySelectorAll('[role="switch"]')).toHaveLength(6);
    expect(container.querySelectorAll('[data-style-theme]')).toHaveLength(3);
    expect(container.querySelectorAll('[data-style-font]')).toHaveLength(3);
    expect(container.querySelectorAll('[data-style-size]')).toHaveLength(5);
    expect(container.querySelectorAll('[data-style-color]')).toHaveLength(11);
    expect(container.querySelector('[data-testid="style-custom-color"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-style-caption]')).toHaveLength(6);
    expect(container.querySelectorAll('[data-style-heading-level]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-style-heading-style]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-style-code-theme]')).toHaveLength(1);
    expect(container.textContent).not.toContain('设为全局默认');
    expect(container.textContent).not.toContain('自定义主题');
    expect(container.textContent).not.toContain('探索更多主题');
    expect(container.querySelector('[data-style-theme="native"]')).toBeNull();
  });

  it('keeps Vault custom themes available without restoring the default theme group', () => {
    const container = document.createElement('div');
    const panel = new StyleWorkbench({} as never, container, {
      patch: vi.fn(),
      selectTheme: vi.fn(),
      reset: vi.fn(),
      close: vi.fn(),
    });
    const customTheme = Object.freeze({
      manifest: Object.freeze({
        id: 'my-custom', name: '我的主题', version: '1.0.0', author: 'Test', description: '',
      }),
      css: '', contentHash: 'custom', source: 'vault' as const, previewPath: null,
    });

    panel.render(Object.freeze({ ...renderState, themes: Object.freeze([...renderState.themes, customTheme]) }));

    expect(container.textContent).not.toContain('自定义主题');
    expect(container.querySelector('[data-style-theme="my-custom"]')).toBeNull();
    expect(container.textContent).not.toContain('其他主题');
  });

  it('emits immediate style actions and closes on Escape', () => {
    const container = document.createElement('div');
    const actions = {
      patch: vi.fn(),
      selectTheme: vi.fn(),
      reset: vi.fn(),
      close: vi.fn(),
    };
    const panel = new StyleWorkbench({} as never, container, actions);
    panel.render(renderState);

    container.querySelector<HTMLButtonElement>('[data-style-color="#009874"]')?.click();
    container.querySelector<HTMLButtonElement>('[data-style-theme="doocs-classic"]')?.click();
    const switchElement = container.querySelector<HTMLElement>('[role="switch"]');
    switchElement?.click();
    container.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(actions.patch).toHaveBeenCalled();
    expect(actions.selectTheme).toHaveBeenCalledWith('doocs-classic');
    expect(actions.close).toHaveBeenCalledOnce();
  });

  it('updates controls in place without replacing the panel root', () => {
    const container = document.createElement('div');
    const panel = new StyleWorkbench({} as never, container, {
      patch: vi.fn(),
      selectTheme: vi.fn(),
      reset: vi.fn(),
      close: vi.fn(),
    });

    panel.render(renderState);
    const root = container.querySelector('[data-testid="style-workbench"]');
    expect(root).not.toBeNull();

    panel.update(Object.freeze({
      ...renderState,
      style: Object.freeze({
        ...renderState.style,
        themeId: 'doocs-grace',
        config: Object.freeze({
          ...renderState.style.config,
          fontFamily: 'monospace',
          fontSize: 18,
        }),
      }),
      styleSaveStatus: 'unsaved',
    }));

    expect(container.querySelector('[data-testid="style-workbench"]')).toBe(root);
    expect(container.querySelector('[data-style-theme="doocs-grace"]')?.getAttribute('aria-pressed'))
      .toBe('true');
    expect(container.querySelector('[data-style-font="monospace"]')?.getAttribute('aria-pressed'))
      .toBe('true');
    expect(container.querySelector('[data-style-size="18"]')?.getAttribute('aria-pressed'))
      .toBe('true');
    expect(container.querySelector('[data-style-heading-level] .wechat-workbench__style-select-trigger')?.textContent)
      .toContain('H2');
    expect(container.textContent).not.toContain('样式尚未保存');
  });

  it('maps every visible control to a style patch without remounting', () => {
    const container = document.createElement('div');
    const actions = {
      patch: vi.fn(),
      selectTheme: vi.fn(),
      reset: vi.fn(),
      close: vi.fn(),
    };
    const panel = new StyleWorkbench({} as never, container, actions);
    panel.render(renderState);

    container.querySelector<HTMLButtonElement>('[data-style-font="serif"]')?.click();
    container.querySelector<HTMLButtonElement>('[data-style-size="18"]')?.click();
    container.querySelector<HTMLButtonElement>('[data-style-caption="filename"]')?.click();
    container.querySelector<HTMLInputElement>('[data-testid="style-custom-color"]')!.value = '#abcdef';
    container.querySelector<HTMLInputElement>('[data-testid="style-custom-color"]')
      ?.dispatchEvent(new Event('input', { bubbles: true }));

    const headingLevel = container.querySelector<HTMLButtonElement>(
      '[data-style-heading-level] .wechat-workbench__style-select-trigger',
    );
    headingLevel?.click();
    container.querySelector<HTMLButtonElement>('[data-style-heading-level] [data-value="h3"]')?.click();
    container.querySelector<HTMLButtonElement>(
      '[data-style-heading-style] .wechat-workbench__style-select-trigger',
    )?.click();
    container.querySelector<HTMLButtonElement>('[data-style-heading-style] [data-value="border-bottom"]')?.click();
    container.querySelector<HTMLButtonElement>(
      '[data-style-code-theme] .wechat-workbench__style-select-trigger',
    )?.click();
    container.querySelector<HTMLButtonElement>('[data-style-code-theme] [data-value="github"]')?.click();
    container.querySelector<HTMLButtonElement>('[data-style-switch="字数统计"]')?.click();

    expect(actions.patch).toHaveBeenCalledWith({ fontFamily: 'serif' });
    expect(actions.patch).toHaveBeenCalledWith({ fontSize: 18 });
    expect(actions.patch).toHaveBeenCalledWith({ imageCaption: 'filename' });
    expect(actions.patch).toHaveBeenCalledWith({ primaryColor: '#ABCDEF' });
    expect(actions.patch).toHaveBeenCalledWith({ headingStyles: { h3: 'border-bottom' } });
    expect(actions.patch).toHaveBeenCalledWith({ codeThemeId: 'github' });
    expect(actions.patch).toHaveBeenCalledWith({ wordCount: true });
    expect(actions.patch).not.toHaveBeenCalledWith({ headingStyles: { h3: 'default' } });
  });

  it('preserves the panel root and body scroll position across repeated updates', () => {
    const container = document.createElement('div');
    const panel = new StyleWorkbench({} as never, container, {
      patch: vi.fn(), selectTheme: vi.fn(), reset: vi.fn(), close: vi.fn(),
    });
    panel.render(renderState);
    const root = container.querySelector('[data-testid="style-workbench"]');
    const body = container.querySelector<HTMLElement>('.wechat-workbench__style-body');
    const heading = container.querySelector('[data-style-heading-level]');
    if (body === null) throw new Error('Style body was not rendered.');
    body.scrollTop = 120;

    for (let index = 0; index < 20; index += 1) panel.update(renderState);

    expect(container.querySelector('[data-testid="style-workbench"]')).toBe(root);
    expect(container.querySelector('[data-style-heading-level]')).toBe(heading);
    expect(body.scrollTop).toBe(120);
  });
});
