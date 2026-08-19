import { ItemView, Menu, Notice, setIcon, type WorkspaceLeaf } from 'obsidian';

import type { WorkbenchRenderState, WorkbenchViewPort } from './workbench-controller';
import type { VaultFileRef } from '../domain/ports';
import type { CoverPickerModel, CoverPickerOption, PreparedCover } from '../cover/cover-workflow';
import type { PreparedPublish } from '../publish/publish-workflow';
import type { PublishCommand, PublishOutcome } from '../publish/publish-types';
import { AiCoverConfirmationModal, type AiCoverDisclosure } from './ai-cover-confirmation';
import { CoverPickerError, CoverPickerModal, CoverPickerSession } from './cover-picker-modal';
import { WORKBENCH_VIEW_TYPE } from './open-workbench';
import {
  buildPublishDialogModel,
  PublishConfirmationModal,
  UnlinkAssociationModal,
} from './publish-dialog';
import { PublishReportModal } from './publish-report-modal';
import {
  buildPreflightPresentation,
  renderPreflightDetails,
} from './render-preflight';
import { ArticlePreviewRenderer, type PreviewAssetResolver } from './render-preview';
import { renderPublishSettings } from './workbench-publish-settings';

interface WorkbenchControllerBinding {
  start(): void;
  stop(): void;
  rebuild(reason: string): void;
  selectTheme(themeId: string): void;
  copyForWeChat(): Promise<void>;
  copyHtmlSource(): Promise<void>;
  preparePublish(): Promise<Readonly<PreparedPublish>>;
  executePublish(command: Readonly<PublishCommand>): Promise<Readonly<PublishOutcome>>;
  reconcilePublish(command: Readonly<PublishCommand>, taskId: string): Promise<Readonly<PublishOutcome>>;
  repairLocalPublish(
    command: Readonly<PublishCommand>,
    taskId: string,
    fallback?: Readonly<{ mediaId: string; operation: 'CREATE' | 'UPDATE' }>,
  ): Promise<Readonly<PublishOutcome>>;
  prepareUnlinkAssociation(): VaultFileRef;
  unlinkPublishAssociation(file: VaultFileRef): Promise<void>;
  coverPickerModel(): Readonly<CoverPickerModel>;
  aiCoverDisclosure(): Readonly<AiCoverDisclosure>;
  prepareCover(input: Readonly<CoverPickerOption> | string): Promise<Readonly<PreparedCover>>;
  generateAiCover(): Promise<Readonly<PreparedCover>>;
  confirmCover(prepared: Readonly<PreparedCover>): Promise<void>;
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
  private previewEl: HTMLElement | null = null;
  private previewPanel: HTMLElement | null = null;
  private settingsEl: HTMLElement | null = null;
  private previewTab: HTMLButtonElement | null = null;
  private settingsTab: HTMLButtonElement | null = null;
  private themeTrigger: HTMLButtonElement | null = null;
  private copyButton: HTMLButtonElement | null = null;
  private sourceButton: HTMLButtonElement | null = null;
  private publishButton: HTMLButtonElement | null = null;
  private unlinkButton: HTMLButtonElement | null = null;
  private checkButton: HTMLButtonElement | null = null;
  private checkDetailsEl: HTMLElement | null = null;
  private publishStateEl: HTMLElement | null = null;
  private latestState: Readonly<WorkbenchRenderState> | null = null;
  private previewTabActive = true;

  constructor(
    leaf: WorkspaceLeaf,
    previewAssets?: PreviewAssetResolver,
    private readonly openSettings: () => void = () => undefined,
  ) {
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
    this.latestState = null;
    this.contentEl.replaceChildren();
    this.contentEl.classList.add('wechat-workbench');

    const header = element('header', 'wechat-workbench__brand-header');
    const brand = element('div', 'wechat-workbench__brand');
    const brandIcon = element('span', 'wechat-workbench__brand-icon');
    setIcon(brandIcon, 'send');
    const title = element('h2', 'wechat-workbench__title', 'WeChat Workbench');
    title.dataset.testid = 'workbench-title';
    brand.append(brandIcon, title);
    const account = element('button', 'clickable-icon');
    account.type = 'button';
    account.dataset.testid = 'account-settings';
    account.setAttribute('aria-label', '管理本地公众号设置');
    setIcon(account, 'circle-user-round');
    account.addEventListener('click', this.openSettings);
    header.append(brand, account);

    const tabs = element('div', 'wechat-workbench__tabs');
    tabs.setAttribute('role', 'tablist');
    const previewTab = element('button', 'is-active', '公众号预览');
    previewTab.type = 'button';
    previewTab.setAttribute('role', 'tab');
    previewTab.setAttribute('aria-selected', 'true');
    const settingsTab = element('button', undefined, '发布设置');
    settingsTab.type = 'button';
    settingsTab.setAttribute('role', 'tab');
    settingsTab.setAttribute('aria-selected', 'false');
    tabs.append(previewTab, settingsTab);
    this.previewTab = previewTab;
    this.settingsTab = settingsTab;

    const toolbar = element('div', 'wechat-workbench__action-bar');
    const publishButton = disabledAction('发文章', true);
    publishButton.dataset.testid = 'publish-draft';
    publishButton.addEventListener('click', () => void this.preparePublish());
    this.publishButton = publishButton;
    const copyButton = disabledAction('复制');
    copyButton.dataset.testid = 'copy-rich';
    copyButton.addEventListener('click', () => void this.runCopy('rich'));
    this.copyButton = copyButton;
    const themeTrigger = disabledAction('主题');
    themeTrigger.dataset.testid = 'theme-trigger';
    themeTrigger.classList.add('wechat-workbench__theme-trigger');
    themeTrigger.setAttribute('aria-haspopup', 'menu');
    themeTrigger.addEventListener('click', event => this.showThemeMenu(event));
    this.themeTrigger = themeTrigger;
    const publishState = element('div', 'wechat-workbench__publish-state');
    const publishStateIcon = element('span');
    setIcon(publishStateIcon, 'cloud-upload');
    const publishStateLabel = element('span', 'wechat-workbench__publish-state-label', '准备发布');
    publishState.append(publishStateIcon, publishStateLabel);
    publishState.dataset.testid = 'publish-state';
    this.publishStateEl = publishState;
    const more = element('details', 'wechat-workbench__more');
    more.append(element('summary', undefined, '···'));
    const sourceButton = disabledAction('复制 HTML 源码');
    sourceButton.dataset.testid = 'copy-source';
    sourceButton.addEventListener('click', () => void this.runCopy('source'));
    this.sourceButton = sourceButton;
    const checkAgain = disabledAction('重新检查');
    checkAgain.addEventListener('click', () => this.requestRebuild('manual-check'));
    const unlinkButton = disabledAction('解除草稿关联');
    unlinkButton.dataset.testid = 'unlink-draft';
    unlinkButton.addEventListener('click', () => this.confirmUnlink());
    this.unlinkButton = unlinkButton;
    const moreMenu = element('div', 'wechat-workbench__more-menu');
    moreMenu.append(sourceButton, checkAgain, unlinkButton);
    more.append(moreMenu);
    toolbar.append(publishButton, copyButton, themeTrigger, publishState, more);

    const summary = element('div', 'wechat-workbench__summary-row');
    this.activeArticle = element('div', 'wechat-workbench__active-article', '未连接活动笔记');
    this.activeArticle.dataset.testid = 'active-article';
    const check = element('button', 'wechat-workbench__check-button', '发布检查');
    check.type = 'button';
    check.disabled = true;
    check.dataset.testid = 'preflight-status';
    check.setAttribute('aria-expanded', 'false');
    check.addEventListener('click', () => this.togglePreflightDetails());
    this.checkButton = check;
    const checkDetails = element('section', 'wechat-workbench__check-popover');
    checkDetails.hidden = true;
    this.checkDetailsEl = checkDetails;
    summary.append(this.activeArticle, check, checkDetails);

    const previewPanel = element('main', 'wechat-workbench__body');
    const canvas = element('div', 'wechat-workbench__preview-canvas');
    this.previewEl = element('div', 'wechat-workbench__preview wechat-workbench__preview-sheet');
    const empty = element('div', 'wechat-workbench__empty', '打开一篇 Markdown 笔记开始预览');
    empty.dataset.testid = 'workbench-empty';
    this.previewEl.append(empty);
    canvas.append(this.previewEl);
    previewPanel.append(canvas);
    this.previewPanel = previewPanel;

    this.settingsEl = element('section', 'wechat-workbench__settings wechat-workbench__publish-settings');
    this.settingsEl.hidden = true;

    previewTab.addEventListener('click', () => this.switchTab(true, previewTab, settingsTab, previewPanel));
    settingsTab.addEventListener('click', () => this.switchTab(false, previewTab, settingsTab, previewPanel));

    this.contentEl.append(
      header, tabs, toolbar, summary,
      previewPanel, this.settingsEl,
    );
    this.controller?.start();
  }

  async onClose(): Promise<void> {
    this.controller?.stop();
    this.previewRenderer.clear();
  }

  showEmpty(): void {
    this.latestState = null;
    this.previewRenderer.clear();
    if (this.activeArticle !== null) this.activeArticle.textContent = '未连接活动笔记';
    if (this.previewTab !== null) this.previewTab.textContent = '公众号预览';
    if (this.themeTrigger !== null) {
      this.themeTrigger.textContent = '主题';
      this.themeTrigger.disabled = true;
    }
    if (this.copyButton !== null) this.copyButton.disabled = true;
    if (this.sourceButton !== null) this.sourceButton.disabled = true;
    if (this.publishButton !== null) this.publishButton.disabled = true;
    if (this.unlinkButton !== null) this.unlinkButton.disabled = true;
    if (this.checkButton !== null) this.checkButton.disabled = true;
    if (this.checkDetailsEl !== null) {
      this.checkDetailsEl.hidden = true;
      this.checkDetailsEl.replaceChildren();
    }
    this.setPublishState('准备发布');
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
    if (this.publishButton !== null) this.publishButton.disabled = true;
    if (this.unlinkButton !== null) this.unlinkButton.disabled = true;
    if (this.themeTrigger !== null) this.themeTrigger.disabled = true;
    this.setPublishState('正在排版');
  }

  showError(message: string): void {
    this.previewRenderer.clear();
    if (this.copyButton !== null) this.copyButton.disabled = true;
    if (this.sourceButton !== null) this.sourceButton.disabled = true;
    if (this.publishButton !== null) this.publishButton.disabled = true;
    if (this.unlinkButton !== null) this.unlinkButton.disabled = true;
    if (this.themeTrigger !== null) this.themeTrigger.disabled = true;
    if (this.checkButton !== null) this.checkButton.disabled = true;
    if (this.checkDetailsEl !== null) {
      this.checkDetailsEl.hidden = true;
      this.checkDetailsEl.replaceChildren();
    }
    this.setPublishState('需要重试');
    if (this.previewEl !== null) this.previewEl.replaceChildren(element(
      'div', 'wechat-workbench__error', `渲染失败：${message}`,
    ));
  }

  showArtifact(state: Readonly<WorkbenchRenderState>): void {
    this.latestState = state;
    if (this.activeArticle !== null) {
      this.activeArticle.textContent = `已连接 · ${state.snapshot.vaultPath}`;
    }
    if (this.previewTab !== null) {
      this.previewTab.textContent = `公众号预览（${state.snapshot.basename}）`;
    }
    const presentation = buildPreflightPresentation(state.preflight);
    if (this.checkButton !== null) {
      this.checkButton.textContent = presentation.label;
      this.checkButton.disabled = false;
      this.checkButton.dataset.tone = presentation.tone;
      this.checkButton.setAttribute('aria-label', `${presentation.label}，查看详情`);
    }
    if (this.checkDetailsEl !== null) {
      this.checkDetailsEl.hidden = true;
      this.checkDetailsEl.replaceChildren();
    }
    if (this.themeTrigger !== null) {
      const current = state.themes.find(theme => theme.manifest.id === state.selectedThemeId);
      this.themeTrigger.textContent = `主题 · ${current?.manifest.name ?? state.selectedThemeId}`;
      this.themeTrigger.disabled = state.themes.length === 0;
    }
    if (this.previewEl !== null) this.previewRenderer.render(this.previewEl, state.artifact);
    if (this.copyButton !== null) this.copyButton.disabled = state.preflight.blocking.length > 0;
    if (this.sourceButton !== null) this.sourceButton.disabled = false;
    if (this.publishButton !== null) this.publishButton.disabled = state.preflight.blocking.length > 0;
    if (this.unlinkButton !== null) this.unlinkButton.disabled = false;
    this.setPublishState(state.preflight.blocking.length > 0 ? '需要处理' : '准备发布');
    if (this.settingsEl !== null) this.renderSettings(state);
  }

  private renderSettings(state: Readonly<WorkbenchRenderState>): void {
    if (this.settingsEl === null) return;
    renderPublishSettings(this.settingsEl, state, { chooseCover: () => this.openCoverPicker() });
  }

  private setPublishState(label: string): void {
    const stateLabel = this.publishStateEl?.querySelector<HTMLElement>(
      '.wechat-workbench__publish-state-label',
    );
    if (stateLabel !== null && stateLabel !== undefined) stateLabel.textContent = label;
  }

  private togglePreflightDetails(): void {
    const state = this.latestState;
    if (state === null || this.checkDetailsEl === null || this.checkButton === null) return;
    const visible = !this.checkDetailsEl.hidden;
    if (visible) {
      this.checkDetailsEl.hidden = true;
      this.checkDetailsEl.replaceChildren();
      this.checkButton.setAttribute('aria-expanded', 'false');
      return;
    }
    renderPreflightDetails(this.checkDetailsEl, state.preflight);
    this.checkDetailsEl.hidden = false;
    this.checkButton.setAttribute('aria-expanded', 'true');
  }

  private showThemeMenu(event: MouseEvent): void {
    const state = this.latestState;
    if (state === null) return;
    const menu = new Menu();
    for (const theme of state.themes) {
      menu.addItem(item => item
        .setTitle(theme.manifest.name)
        .setChecked(theme.manifest.id === state.selectedThemeId)
        .onClick(() => this.controller?.selectTheme(theme.manifest.id)));
    }
    menu.showAtMouseEvent(event);
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

  private async preparePublish(): Promise<void> {
    if (this.publishButton === null || this.controller === null) return;
    this.publishButton.disabled = true;
    try {
      const prepared = await this.controller.preparePublish();
      new PublishConfirmationModal(
        this.app,
        buildPublishDialogModel(prepared.dialogInput),
        () => void this.executePublish(prepared.command),
      ).open();
    } catch (error) {
      new Notice(error instanceof Error ? error.message : '无法准备草稿同步');
    } finally {
      this.publishButton.disabled = false;
    }
  }

  private async executePublish(command: Readonly<PublishCommand>): Promise<void> {
    if (this.publishButton !== null) this.publishButton.disabled = true;
    new Notice('正在同步到公众号草稿箱…');
    try {
      const result = await this.controller?.executePublish(command);
      if (result !== undefined) this.openPublishReport(command, result);
    } catch (error) {
      new Notice(error instanceof Error ? error.message : '草稿同步失败');
    } finally {
      if (this.publishButton !== null) this.publishButton.disabled = false;
    }
  }

  private openPublishReport(
    command: Readonly<PublishCommand>,
    outcome: Readonly<PublishOutcome>,
  ): void {
    new PublishReportModal(this.app, outcome, {
      RETRY: () => void this.executePublish(command),
      RECONCILE: () => void this.runRecovery('reconcile', command, outcome),
      REPAIR_LOCAL: () => void this.runRecovery('repair', command, outcome),
    }).open();
  }

  private async runRecovery(
    mode: 'reconcile' | 'repair',
    command: Readonly<PublishCommand>,
    outcome: Readonly<PublishOutcome>,
  ): Promise<void> {
    if (this.controller === null) return;
    try {
      const result = mode === 'reconcile'
        ? await this.controller.reconcilePublish(command, outcome.taskId)
        : await this.controller.repairLocalPublish(
          command,
          outcome.taskId,
          outcome.mediaId === null || outcome.action === null || outcome.action === 'SKIP'
            ? undefined
            : { mediaId: outcome.mediaId, operation: outcome.action },
        );
      this.openPublishReport(command, result);
    } catch (error) {
      new Notice(error instanceof Error ? error.message : '恢复草稿关联失败');
    }
  }

  private confirmUnlink(): void {
    if (this.controller === null) return;
    try {
      const file = this.controller.prepareUnlinkAssociation();
      new UnlinkAssociationModal(this.app, file.path, () => void this.unlinkAssociation(file)).open();
    } catch (error) {
      new Notice(error instanceof Error ? error.message : '无法准备解除草稿关联');
    }
  }

  private async unlinkAssociation(file: VaultFileRef): Promise<void> {
    try {
      await this.controller?.unlinkPublishAssociation(file);
      new Notice('已解除本地草稿关联，未删除公众号后台草稿');
    } catch (error) {
      new Notice(error instanceof Error ? error.message : '解除草稿关联失败');
    }
  }

  private openCoverPicker(): void {
    if (this.controller === null) return;
    try {
      const session = new CoverPickerSession(this.controller.coverPickerModel(), {
        prepareLocal: input => this.controller?.prepareCover(input)
          ?? Promise.reject(new CoverPickerError('COVER_UNAVAILABLE', '封面服务不可用。')),
        generateAi: () => this.generateAiCoverWithConsent(),
        confirm: async prepared => {
          await this.controller?.confirmCover(prepared);
          new Notice('文章封面已更新');
        },
      });
      new CoverPickerModal(this.app, session).open();
    } catch (error) {
      new Notice(error instanceof Error ? error.message : '无法打开封面选择器');
    }
  }

  private generateAiCoverWithConsent(): Promise<Readonly<PreparedCover>> {
    if (this.controller === null) {
      return Promise.reject(new CoverPickerError('COVER_UNAVAILABLE', '封面服务不可用。'));
    }
    const disclosure = this.controller.aiCoverDisclosure();
    return new Promise((resolve, reject) => {
      new AiCoverConfirmationModal(
        this.app,
        disclosure,
        () => {
          void this.controller?.generateAiCover().then(resolve, reject);
        },
        () => reject(new CoverPickerError('AI_COVER_CANCELLED', '已取消生成智能封面。')),
      ).open();
    });
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
    if (!preview && this.checkDetailsEl !== null) this.checkDetailsEl.hidden = true;
    if (this.settingsEl !== null) this.settingsEl.hidden = preview;
  }
}
