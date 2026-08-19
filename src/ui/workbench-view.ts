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

let workbenchViewCounter = 0;

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

function isMissingAccountConfiguration(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as { code?: unknown; message?: unknown };
  if (candidate.code !== 'PUBLISH_PREPARE_BLOCKED') return false;
  return typeof candidate.message === 'string'
    && /AppID|AppSecret|Access Token|公众号账号/iu.test(candidate.message);
}

export class WeChatWorkbenchView extends ItemView implements WorkbenchViewPort {
  private controller: WorkbenchControllerBinding | null = null;
  private readonly previewRenderer: ArticlePreviewRenderer;
  private activeArticle: HTMLElement | null = null;
  private previewEl: HTMLElement | null = null;
  private settingsEl: HTMLElement | null = null;
  private previewTab: HTMLButtonElement | null = null;
  private themeTrigger: HTMLButtonElement | null = null;
  private copyButton: HTMLButtonElement | null = null;
  private sourceButton: HTMLButtonElement | null = null;
  private publishButton: HTMLButtonElement | null = null;
  private unlinkButton: HTMLButtonElement | null = null;
  private recheckButton: HTMLButtonElement | null = null;
  private checkButton: HTMLButtonElement | null = null;
  private checkDetailsEl: HTMLElement | null = null;
  private publishStateEl: HTMLElement | null = null;
  private latestState: Readonly<WorkbenchRenderState> | null = null;

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
    this.registerDomEvent(account, 'click', this.openSettings);
    header.append(brand, account);

    const tabs = element('div', 'wechat-workbench__tabs');
    tabs.setAttribute('role', 'tablist');
    const viewId = ++workbenchViewCounter;
    const previewTabId = `wechat-workbench-preview-tab-${viewId}`;
    const settingsTabId = `wechat-workbench-settings-tab-${viewId}`;
    const previewPanelId = `wechat-workbench-preview-panel-${viewId}`;
    const settingsPanelId = `wechat-workbench-settings-panel-${viewId}`;
    const previewTab = element('button', 'is-active', '公众号预览');
    previewTab.type = 'button';
    previewTab.id = previewTabId;
    previewTab.setAttribute('role', 'tab');
    previewTab.setAttribute('aria-selected', 'true');
    previewTab.setAttribute('aria-controls', previewPanelId);
    const settingsTab = element('button', undefined, '发布设置');
    settingsTab.type = 'button';
    settingsTab.id = settingsTabId;
    settingsTab.setAttribute('role', 'tab');
    settingsTab.setAttribute('aria-selected', 'false');
    settingsTab.setAttribute('aria-controls', settingsPanelId);
    tabs.append(previewTab, settingsTab);
    this.previewTab = previewTab;

    const toolbar = element('div', 'wechat-workbench__action-bar');
    const publishButton = disabledAction('发文章', true);
    publishButton.dataset.testid = 'publish-draft';
    this.registerDomEvent(publishButton, 'click', () => void this.preparePublish());
    this.publishButton = publishButton;
    const copyButton = disabledAction('复制');
    copyButton.dataset.testid = 'copy-rich';
    this.registerDomEvent(copyButton, 'click', () => void this.runCopy('rich'));
    this.copyButton = copyButton;
    const themeTrigger = disabledAction('主题');
    themeTrigger.dataset.testid = 'theme-trigger';
    themeTrigger.classList.add('wechat-workbench__theme-trigger');
    themeTrigger.setAttribute('aria-haspopup', 'menu');
    themeTrigger.setAttribute('aria-label', '选择文章主题');
    this.registerDomEvent(themeTrigger, 'click', event => this.showThemeMenu(event));
    this.themeTrigger = themeTrigger;
    const publishState = element('div', 'wechat-workbench__publish-state');
    const publishStateIcon = element('span');
    setIcon(publishStateIcon, 'cloud-upload');
    const publishStateLabel = element('span', 'wechat-workbench__publish-state-label', '准备发布');
    publishState.append(publishStateIcon, publishStateLabel);
    publishState.dataset.testid = 'publish-state';
    this.publishStateEl = publishState;
    const more = element('details', 'wechat-workbench__more');
    const moreSummary = element('summary', undefined, '···');
    moreSummary.setAttribute('aria-label', '更多操作');
    moreSummary.setAttribute('title', '更多操作');
    more.append(moreSummary);
    const sourceButton = disabledAction('复制 HTML 源码');
    sourceButton.dataset.testid = 'copy-source';
    this.registerDomEvent(sourceButton, 'click', () => void this.runCopy('source'));
    this.sourceButton = sourceButton;
    const checkAgain = disabledAction('重新检查');
    checkAgain.dataset.testid = 'recheck';
    this.registerDomEvent(checkAgain, 'click', () => this.requestRebuild('manual-check'));
    this.recheckButton = checkAgain;
    const unlinkButton = disabledAction('解除草稿关联');
    unlinkButton.dataset.testid = 'unlink-draft';
    this.registerDomEvent(unlinkButton, 'click', () => this.confirmUnlink());
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
    this.registerDomEvent(check, 'click', () => this.togglePreflightDetails());
    this.checkButton = check;
    const checkDetails = element('section', 'wechat-workbench__check-popover');
    checkDetails.hidden = true;
    this.checkDetailsEl = checkDetails;
    summary.append(this.activeArticle, check, checkDetails);

    const previewPanel = element('main', 'wechat-workbench__body');
    previewPanel.id = previewPanelId;
    previewPanel.setAttribute('role', 'tabpanel');
    previewPanel.setAttribute('aria-labelledby', previewTabId);
    const canvas = element('div', 'wechat-workbench__preview-canvas');
    this.previewEl = element('div', 'wechat-workbench__preview wechat-workbench__preview-sheet');
    const empty = element('div', 'wechat-workbench__empty', '打开一篇 Markdown 笔记开始预览');
    empty.dataset.testid = 'workbench-empty';
    this.previewEl.append(empty);
    canvas.append(this.previewEl);
    previewPanel.append(canvas);

    this.settingsEl = element('section', 'wechat-workbench__settings wechat-workbench__publish-settings');
    this.settingsEl.id = settingsPanelId;
    this.settingsEl.setAttribute('role', 'tabpanel');
    this.settingsEl.setAttribute('aria-labelledby', settingsTabId);
    this.settingsEl.hidden = true;

    this.registerDomEvent(
      previewTab,
      'click',
      () => this.switchTab(true, previewTab, settingsTab, previewPanel),
    );
    this.registerDomEvent(
      settingsTab,
      'click',
      () => this.switchTab(false, previewTab, settingsTab, previewPanel),
    );

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
    if (this.recheckButton !== null) this.recheckButton.disabled = true;
    if (this.checkButton !== null) this.checkButton.disabled = true;
    if (this.checkDetailsEl !== null) {
      this.checkDetailsEl.hidden = true;
      this.checkDetailsEl.replaceChildren();
      this.checkButton?.setAttribute('aria-expanded', 'false');
    }
    if (this.settingsEl !== null) this.renderSettingsPlaceholder('打开一篇 Markdown 笔记开始预览');
    this.setPublishState('准备发布');
    if (this.previewEl !== null) {
      const empty = element('div', 'wechat-workbench__empty', '打开一篇 Markdown 笔记开始预览');
      empty.dataset.testid = 'workbench-empty';
      this.previewEl.replaceChildren(empty);
    }
  }

  showLoading(path: string): void {
    this.latestState = null;
    if (this.activeArticle !== null) {
      this.activeArticle.textContent = `正在渲染 · ${path.split('/').pop() ?? path}`;
    }
    if (this.copyButton !== null) this.copyButton.disabled = true;
    if (this.sourceButton !== null) this.sourceButton.disabled = true;
    if (this.publishButton !== null) this.publishButton.disabled = true;
    if (this.unlinkButton !== null) this.unlinkButton.disabled = true;
    if (this.themeTrigger !== null) this.themeTrigger.disabled = true;
    if (this.recheckButton !== null) this.recheckButton.disabled = true;
    if (this.checkButton !== null) {
      this.checkButton.disabled = true;
      this.checkButton.setAttribute('aria-expanded', 'false');
      delete this.checkButton.dataset.tone;
    }
    if (this.checkDetailsEl !== null) {
      this.checkDetailsEl.hidden = true;
      this.checkDetailsEl.replaceChildren();
    }
    if (this.settingsEl !== null) this.renderSettingsPlaceholder('正在排版…');
    this.setPublishState('正在排版');
  }

  showError(_message: string): void {
    this.latestState = null;
    this.previewRenderer.clear();
    if (this.copyButton !== null) this.copyButton.disabled = true;
    if (this.sourceButton !== null) this.sourceButton.disabled = true;
    if (this.publishButton !== null) this.publishButton.disabled = true;
    if (this.unlinkButton !== null) this.unlinkButton.disabled = true;
    if (this.themeTrigger !== null) this.themeTrigger.disabled = true;
    if (this.recheckButton !== null) this.recheckButton.disabled = false;
    if (this.checkButton !== null) this.checkButton.disabled = true;
    if (this.checkDetailsEl !== null) {
      this.checkDetailsEl.hidden = true;
      this.checkDetailsEl.replaceChildren();
      this.checkButton?.setAttribute('aria-expanded', 'false');
    }
    if (this.settingsEl !== null) this.renderSettingsPlaceholder('文章排版失败，请先重新检查。');
    this.setPublishState('需要重试');
    if (this.previewEl !== null) this.previewEl.replaceChildren(element(
      'div',
      'wechat-workbench__error',
      '文章排版失败，请检查当前笔记或主题设置，然后点击“重新检查”。',
    ));
  }

  showArtifact(state: Readonly<WorkbenchRenderState>): void {
    this.latestState = state;
    if (this.activeArticle !== null) {
      this.activeArticle.textContent = `已连接 · ${state.snapshot.basename}`;
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
    if (this.recheckButton !== null) this.recheckButton.disabled = false;
    if (this.checkDetailsEl !== null) {
      this.checkDetailsEl.hidden = true;
      this.checkDetailsEl.replaceChildren();
    }
    if (this.themeTrigger !== null) {
      const current = state.themes.find(theme => theme.manifest.id === state.selectedThemeId);
      this.themeTrigger.textContent = `主题 · ${current?.manifest.name ?? state.selectedThemeId}`;
      this.themeTrigger.setAttribute('aria-label', `选择文章主题，当前为 ${current?.manifest.name ?? state.selectedThemeId}`);
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

  private renderSettingsPlaceholder(message: string): void {
    if (this.settingsEl === null) return;
    this.settingsEl.replaceChildren(element('div', 'wechat-workbench__empty', message));
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
      if (isMissingAccountConfiguration(error)) {
        new Notice('公众号账号未配置，请先打开插件设置完善本地账号信息。');
        this.openSettings();
      } else {
        new Notice(error instanceof Error ? error.message : '无法准备草稿同步');
      }
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
    previewTab.classList.toggle('is-active', preview);
    settingsTab.classList.toggle('is-active', !preview);
    previewTab.setAttribute('aria-selected', String(preview));
    settingsTab.setAttribute('aria-selected', String(!preview));
    previewPanel.hidden = !preview;
    if (!preview && this.checkDetailsEl !== null) this.checkDetailsEl.hidden = true;
    if (this.settingsEl !== null) this.settingsEl.hidden = preview;
  }
}
