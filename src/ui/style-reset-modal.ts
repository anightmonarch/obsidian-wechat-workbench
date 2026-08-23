import { Modal, type App } from 'obsidian';

export class StyleResetModal extends Modal {
  constructor(
    app: App,
    private readonly confirmReset: () => void,
  ) {
    super(app);
  }

  onOpen(): void {
    this.contentEl.replaceChildren();
    this.titleEl.textContent = '重置文章样式';
    this.contentEl.append(createEl('p', {
      text: '恢复当前文章的默认样式，不会修改文章正文内容。',
    }));

    const actions = createDiv('modal-button-container');
    const cancel = createEl('button', { text: '取消' });
    cancel.type = 'button';
    cancel.dataset.testid = 'style-reset-cancel';
    cancel.addEventListener('click', () => this.close());

    const confirm = createEl('button', { cls: 'mod-warning', text: '确认重置' });
    confirm.type = 'button';
    confirm.dataset.testid = 'style-reset-confirm';
    confirm.addEventListener('click', () => {
      this.close();
      this.confirmReset();
    });

    actions.append(cancel, confirm);
    this.contentEl.append(actions);
  }
}
