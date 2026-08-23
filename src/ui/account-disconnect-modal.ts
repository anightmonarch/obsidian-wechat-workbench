import { App, Modal } from 'obsidian';

export class AccountDisconnectModal extends Modal {
  constructor(
    app: App,
    private readonly confirm: () => Promise<void>,
  ) {
    super(app);
  }

  override onOpen(): void {
    this.titleEl.textContent = '断开本地连接';
    this.contentEl.replaceChildren();
    this.contentEl.append(createEl('p', {
      text: '将清除本机 AppSecret 和 Access Token；公众号名称、AppID、文章 Frontmatter 和草稿关联保持不变。',
    }));
    const cancel = createEl('button', { text: '取消' });
    cancel.addEventListener('click', () => this.close());
    const confirm = createEl('button', { cls: 'mod-cta', text: '确认断开' });
    confirm.dataset.testid = 'account-disconnect-confirm';
    confirm.addEventListener('click', () => {
      void (async () => {
        await this.confirm();
        this.close();
      })();
    });
    const actions = createDiv('modal-button-container');
    actions.append(cancel, confirm);
    this.contentEl.append(actions);
  }
}
