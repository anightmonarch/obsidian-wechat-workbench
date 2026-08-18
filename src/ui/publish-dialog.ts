import { type App, Modal } from 'obsidian';

import type { PublishAction, PublishDialogInput } from '../publish/publish-types';

export type { PublishDialogInput } from '../publish/publish-types';

export interface PublishDialogModel {
  action: PublishAction;
  accountSuffix: string;
  title: string;
  digest: string;
  theme: string;
  hashes: Readonly<{ content: string; theme: string; cover: string }>;
  imageCount: number;
  coverLabel: string;
  destinations: readonly string[];
  sendsArticle: true;
  formalPublish: false;
}

export function buildPublishDialogModel(input: Readonly<PublishDialogInput>): Readonly<PublishDialogModel> {
  return Object.freeze({
    action: input.action,
    accountSuffix: input.appId.slice(-6),
    title: input.title,
    digest: input.digest,
    theme: `${input.themeId}@${input.themeVersion}`,
    hashes: Object.freeze({
      content: input.contentHash,
      theme: input.themeHash,
      cover: input.coverHash,
    }),
    imageCount: input.imageCount,
    coverLabel: input.coverLabel,
    destinations: Object.freeze(['api.weixin.qq.com', 'mmbiz.qpic.cn']),
    sendsArticle: true,
    formalPublish: false,
  });
}

export class PublishConfirmationModal extends Modal {
  constructor(
    app: App,
    private readonly model: Readonly<PublishDialogModel>,
    private readonly confirm: () => void,
  ) { super(app); }

  onOpen(): void {
    this.contentEl.replaceChildren();
    this.titleEl.textContent = '发布到公众号草稿箱';
    const summary = createDiv();
    summary.className = 'wechat-workbench__publish-summary';
    const rows: Array<[string, string]> = [
      ['操作', this.model.action],
      ['账号', `AppID …${this.model.accountSuffix}`],
      ['标题', this.model.title],
      ['摘要', this.model.digest || '使用正文安全截断'],
      ['主题', this.model.theme],
      ['内容指纹', this.model.hashes.content],
      ['主题指纹', this.model.hashes.theme],
      ['封面指纹', this.model.hashes.cover],
      ['图片', `${this.model.imageCount} 张`],
      ['封面', this.model.coverLabel],
      ['网络', this.model.destinations.join('、')],
    ];
    for (const [label, value] of rows) {
      const row = createEl('p');
      row.append(createEl('strong', { text: `${label}：` }), document.createTextNode(value));
      summary.append(row);
    }
    summary.append(createEl('p', { cls: 'wechat-workbench__publish-warning', text: '只同步到草稿箱，不会正式群发。' }));
    const actions = createDiv('modal-button-container');
    const cancel = createEl('button', { text: '取消' });
    cancel.addEventListener('click', () => this.close());
    const confirm = createEl('button', { cls: 'mod-cta', text: '确认同步到草稿箱' });
    confirm.addEventListener('click', () => { this.close(); this.confirm(); });
    actions.append(cancel, confirm);
    this.contentEl.append(summary, actions);
  }
}

export class UnlinkAssociationModal extends Modal {
  constructor(
    app: App,
    private readonly notePath: string,
    private readonly confirm: () => void,
  ) { super(app); }

  onOpen(): void {
    this.contentEl.replaceChildren();
    this.titleEl.textContent = '解除本地草稿关联';
    this.contentEl.append(createEl('p', {
      text: `只删除 ${this.notePath} 中由插件维护的草稿关联字段，不会删除公众号后台草稿。`,
    }));
    const actions = createDiv('modal-button-container');
    const cancel = createEl('button', { text: '取消' });
    cancel.addEventListener('click', () => this.close());
    const confirm = createEl('button', { cls: 'mod-warning', text: '解除本地关联' });
    confirm.addEventListener('click', () => { this.close(); this.confirm(); });
    actions.append(cancel, confirm);
    this.contentEl.append(actions);
  }
}
