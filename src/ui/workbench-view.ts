import { ItemView, type WorkspaceLeaf } from 'obsidian';

import { WORKBENCH_VIEW_TYPE } from './open-workbench';

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = createEl(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function disabledAction(label: string, primary = false): HTMLButtonElement {
  const button = element('button', primary ? 'mod-cta' : undefined, label);
  button.type = 'button';
  button.disabled = true;
  return button;
}

export class WeChatWorkbenchView extends ItemView {
  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType(): string {
    return WORKBENCH_VIEW_TYPE;
  }

  getDisplayText(): string {
    return 'WeChat Workbench';
  }

  getIcon(): string {
    return 'newspaper';
  }

  async onOpen(): Promise<void> {
    this.contentEl.replaceChildren();
    this.contentEl.classList.add('wechat-workbench');

    const header = element('header', 'wechat-workbench__header');
    const title = element('h2', 'wechat-workbench__title', 'WeChat Workbench');
    title.dataset.testid = 'workbench-title';
    const status = element('span', 'wechat-workbench__account-status', '本地账号未配置');
    header.append(title, status);

    const tabs = element('div', 'wechat-workbench__tabs');
    tabs.setAttribute('role', 'tablist');
    const previewTab = element('button', 'is-active', '预览');
    previewTab.type = 'button';
    previewTab.setAttribute('role', 'tab');
    previewTab.setAttribute('aria-selected', 'true');
    const settingsTab = element('button', undefined, '文章设置');
    settingsTab.type = 'button';
    settingsTab.setAttribute('role', 'tab');
    settingsTab.setAttribute('aria-selected', 'false');
    tabs.append(previewTab, settingsTab);

    const toolbar = element('div', 'wechat-workbench__toolbar');
    toolbar.append(
      disabledAction('发布到草稿箱', true),
      disabledAction('复制到公众号'),
      disabledAction('主题'),
    );

    const empty = element(
      'div',
      'wechat-workbench__empty',
      '打开一篇 Markdown 笔记开始预览',
    );
    empty.dataset.testid = 'workbench-empty';

    this.contentEl.append(header, tabs, toolbar, empty);
  }
}
