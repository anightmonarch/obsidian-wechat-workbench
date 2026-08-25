import { describe, expect, it } from 'vitest';

import '../../mocks/obsidian';
import { CoverPreviewModal } from '../../../src/ui/cover-preview-modal';

function decorateObsidianElement(element: HTMLElement): HTMLElement {
  Object.assign(element, {
    empty: () => element.replaceChildren(),
    addClass: (...classes: string[]) => element.classList.add(...classes),
    createEl: <K extends keyof HTMLElementTagNameMap>(tag: K, options?: { text?: string; cls?: string }) => {
      const child = document.createElement(tag);
      if (options?.text !== undefined) child.textContent = options.text;
      if (options?.cls !== undefined) child.className = options.cls;
      element.append(child);
      return decorateObsidianElement(child);
    },
  });
  return element;
}

describe('cover preview modal', () => {
  it('marks the outer modal shell for a wide cover preview', () => {
    const modal = new CoverPreviewModal({} as never, 'data:image/png;base64,COVER', '文章首图预览');
    decorateObsidianElement(modal.contentEl);
    decorateObsidianElement(modal.modalEl);

    modal.open();

    expect(modal.modalEl.classList.contains('wechat-workbench__cover-preview-modal-shell')).toBe(true);
    expect(modal.contentEl.classList.contains('wechat-workbench__cover-preview-modal')).toBe(true);
  });

  it('does not render a caption below the cover image', () => {
    const modal = new CoverPreviewModal({} as never, 'data:image/png;base64,COVER', '文章首图预览');
    decorateObsidianElement(modal.contentEl);
    decorateObsidianElement(modal.modalEl);

    modal.open();

    expect(modal.contentEl.querySelector('figcaption')).toBeNull();
    expect(modal.contentEl.textContent).not.toContain('文章首图预览');
  });
});
