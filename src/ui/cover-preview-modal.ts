import { type App, Modal } from 'obsidian';

/**
 * 封面大图预览 Modal。
 * 接收已经可显示的 URL（dataURL 或 https），居中放大显示。
 * 用于点击工作台右栏封面缩略图时的弹窗。
 */
export class CoverPreviewModal extends Modal {
  private readonly alt: string;

  constructor(app: App, readonly url: string, alt: string) {
    super(app);
    this.alt = alt;
  }

  onOpen(): void {
    const { contentEl } = this;
    this.modalEl.addClass('wechat-workbench__cover-preview-modal-shell');
    contentEl.empty();
    contentEl.addClass('wechat-workbench__cover-preview-modal');
    const figure = contentEl.createEl('figure');
    figure.addClass('wechat-workbench__cover-preview-figure');
    const image = figure.createEl('img');
    image.src = this.url;
    image.alt = this.alt;
    image.addClass('wechat-workbench__cover-preview-image');
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
