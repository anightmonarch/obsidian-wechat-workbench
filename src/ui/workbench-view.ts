import { ItemView, Notice, type WorkspaceLeaf } from 'obsidian';

import type { WorkbenchRenderState, WorkbenchViewPort } from './workbench-controller';
import { WORKBENCH_VIEW_TYPE } from './open-workbench';
import { renderPreflight } from './render-preflight';
import { ArticlePreviewRenderer, type PreviewAssetResolver } from './render-preview';

interface WorkbenchControllerBinding {
  start(): void;
  stop(): void;
  rebuild(reason: string): void;
  selectTheme(themeId: string): void;
  copyForWeChat(): Promise<void>;
  copyHtmlSource(): Promise<void>;
}

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

export class WeChatWorkbenchView extends ItemView implements WorkbenchViewPort {
  private controller: WorkbenchControllerBinding | null = null;
  private readonly previewRenderer: ArticlePreviewRenderer;
  private activeArticle: HTMLElement | null = null;
  private preflightEl: HTMLElement | null = null;
  private previewEl: HTMLElement | null = null;
  private settingsEl: HTMLElement | null = null;
  private themeSelect: HTMLSelectElement | null = null;
  private copyButton: HTMLButtonElement | null = null;
  private sourceButton: HTMLButtonElement | null = null;
  private previewTabActive = true;

  constructor(leaf: WorkspaceLeaf, previewAssets?: PreviewAssetResolver) {
    super(leaf);
    this.previewRenderer = new ArticlePreviewRenderer(previewAssets);
  }

  setController(controller: WorkbenchControllerBinding): void {
    this.controller = controller;
  }

  requestRebuild(reason: string): void {
    this.controller?.rebuild(reason);
  }

  getViewType(): string { return WORKBENCH_VIEW_TYPE; }
  getDisplayText(): string { return 'WeChat Workbench'; }
  getIcon(): string { return 'newspaper'; }

  async onOpen(): Promise<void> {
    this.previewTabActive = true;
    this.contentEl.replaceChildren();
    this.contentEl.classList.add('wechat-workbench');

    const header = element('header', 'wechat-workbench__header');
    const title = element('h2', 'wechat-workbench__title', 'WeChat Workbench');
    title.dataset.testid = 'workbench-title';
    header.append(title, element('span', 'wechat-workbench__account-status', '本地账号未配置'));

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
    const copyButton = disabledAction('复制到公众号');
    copyButton.dataset.testid = 'copy-rich';
    copyButton.addEventListener('click', () => void this.runCopy('rich'));
    this.copyButton = copyButton;
    const themeSelect = element('select', 'wechat-workbench__theme-select');
    themeSelect.dataset.testid = 'theme-select';
    themeSelect.disabled = true;
    themeSelect.setAttribute('aria-label', '文章主题');
    themeSelect.addEventListener('change', () => this.controller?.selectTheme(themeSelect.value));
    const more = element('details', 'wechat-workbench__more');
    more.append(element('summary', undefined, '···'));
    const sourceButton = disabledAction('复制 HTML 源码');
    sourceButton.dataset.testid = 'copy-source';
    sourceButton.addEventListener('click', () => void this.runCopy('source'));
    this.sourceButton = sourceButton;
    more.append(sourceButton);
    toolbar.append(disabledAction('发布到草稿箱', true), copyButton, themeSelect, more);
    this.themeSelect = themeSelect;

    this.activeArticle = element('div', 'wechat-workbench__active-article', '未连接活动笔记');
    this.activeArticle.dataset.testid = 'active-article';
    this.preflightEl = element('section', 'wechat-workbench__preflight');
    this.preflightEl.hidden = true;

    const previewPanel = element('main', 'wechat-workbench__panel');
    this.previewEl = element('div', 'wechat-workbench__preview');
    const empty = element('div', 'wechat-workbench__empty', '打开一篇 Markdown 笔记开始预览');
    empty.dataset.testid = 'workbench-empty';
    this.previewEl.append(empty);
    previewPanel.append(this.previewEl);

    this.settingsEl = element('section', 'wechat-workbench__settings');
    this.settingsEl.hidden = true;
    this.settingsEl.append(element('p', undefined, '文章元数据将从 Frontmatter 与插件默认值合并。'));

    previewTab.addEventListener('click', () => this.switchTab(true, previewTab, settingsTab, previewPanel));
    settingsTab.addEventListener('click', () => this.switchTab(false, previewTab, settingsTab, previewPanel));

    this.contentEl.append(
      header, tabs, toolbar, this.activeArticle, this.preflightEl,
      previewPanel, this.settingsEl,
    );
    this.controller?.start();
  }

  async onClose(): Promise<void> {
    this.controller?.stop();
    this.previewRenderer.clear();
  }

  showEmpty(): void {
    this.previewRenderer.clear();
    if (this.activeArticle !== null) this.activeArticle.textContent = '未连接活动笔记';
    if (this.preflightEl !== null) this.preflightEl.hidden = true;
    if (this.themeSelect !== null) this.themeSelect.disabled = true;
    if (this.copyButton !== null) this.copyButton.disabled = true;
    if (this.sourceButton !== null) this.sourceButton.disabled = true;
    if (this.previewEl !== null) {
      const empty = element('div', 'wechat-workbench__empty', '打开一篇 Markdown 笔记开始预览');
      empty.dataset.testid = 'workbench-empty';
      this.previewEl.replaceChildren(empty);
    }
  }

  showLoading(path: string): void {
    if (this.activeArticle !== null) this.activeArticle.textContent = `正在渲染 · ${path}`;
    if (this.copyButton !== null) this.copyButton.disabled = true;
    if (this.sourceButton !== null) this.sourceButton.disabled = true;
  }

  showError(message: string): void {
    this.previewRenderer.clear();
    if (this.preflightEl !== null) this.preflightEl.hidden = true;
    if (this.copyButton !== null) this.copyButton.disabled = true;
    if (this.sourceButton !== null) this.sourceButton.disabled = true;
    if (this.previewEl !== null) this.previewEl.replaceChildren(element(
      'div', 'wechat-workbench__error', `渲染失败：${message}`,
    ));
  }

  showArtifact(state: Readonly<WorkbenchRenderState>): void {
    if (this.activeArticle !== null) {
      this.activeArticle.textContent = `已连接 · ${state.snapshot.vaultPath}`;
    }
    if (this.preflightEl !== null) {
      this.preflightEl.hidden = !this.previewTabActive;
      renderPreflight(this.preflightEl, state.preflight);
    }
    if (this.themeSelect !== null) {
      this.themeSelect.replaceChildren();
      for (const theme of state.themes) {
        const option = element('option');
        option.value = theme.manifest.id;
        option.textContent = theme.manifest.name;
        option.selected = theme.manifest.id === state.selectedThemeId;
        this.themeSelect.append(option);
      }
      this.themeSelect.disabled = state.themes.length === 0;
    }
    if (this.previewEl !== null) this.previewRenderer.render(this.previewEl, state.artifact);
    if (this.copyButton !== null) this.copyButton.disabled = state.preflight.blocking.length > 0;
    if (this.sourceButton !== null) this.sourceButton.disabled = false;
    if (this.settingsEl !== null) this.renderSettings(state);
  }

  private renderSettings(state: Readonly<WorkbenchRenderState>): void {
    if (this.settingsEl === null) return;
    this.settingsEl.replaceChildren();
    const values: Array<[string, string]> = [
      ['标题', state.artifact.metadata.title],
      ['作者', state.artifact.metadata.author || '未设置'],
      ['摘要', state.artifact.metadata.digest || '未设置'],
      ['主题', state.selectedThemeId],
      ['来源链接', state.artifact.metadata.contentSourceUrl || '未设置'],
    ];
    for (const [label, value] of values) {
      const row = element('div', 'wechat-workbench__setting-row');
      row.append(element('strong', undefined, label), element('span', undefined, value));
      this.settingsEl.append(row);
    }
    this.settingsEl.append(element('p', 'wechat-workbench__settings-hint', '修改笔记 Frontmatter 后，预览会自动更新。'));
  }

  private async runCopy(mode: 'rich' | 'source'): Promise<void> {
    const button = mode === 'rich' ? this.copyButton : this.sourceButton;
    if (button === null || this.controller === null) return;
    button.disabled = true;
    try {
      if (mode === 'rich') await this.controller.copyForWeChat();
      else await this.controller.copyHtmlSource();
      new Notice(mode === 'rich' ? '已复制公众号富文本' : '已复制 HTML 源码');
    } catch (error) {
      new Notice(error instanceof Error ? error.message : '复制失败');
    } finally {
      button.disabled = false;
    }
  }

  private switchTab(
    preview: boolean,
    previewTab: HTMLButtonElement,
    settingsTab: HTMLButtonElement,
    previewPanel: HTMLElement,
  ): void {
    this.previewTabActive = preview;
    previewTab.classList.toggle('is-active', preview);
    settingsTab.classList.toggle('is-active', !preview);
    previewTab.setAttribute('aria-selected', String(preview));
    settingsTab.setAttribute('aria-selected', String(!preview));
    previewPanel.hidden = !preview;
    if (this.preflightEl !== null) this.preflightEl.hidden = !preview;
    if (this.settingsEl !== null) this.settingsEl.hidden = preview;
  }
}
