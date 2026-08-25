import { ItemView, Notice, setIcon, type WorkspaceLeaf } from 'obsidian';

import {
  openWeChatOfficialConsole,
  WECHAT_OFFICIAL_CONSOLE_URL,
} from './external-browser';

export { WECHAT_OFFICIAL_CONSOLE_URL } from './external-browser';

import type { WorkbenchRenderState, WorkbenchViewPort } from './workbench-controller';
import type { ArticleDraftValues, EditableArticleSettings } from '../domain/article';
import type { VaultFileRef } from '../domain/ports';
import type { CoverPickerModel, CoverPickerOption, PreparedCover } from '../cover/cover-workflow';
import type { PreparedPublish } from '../publish/publish-workflow';
import type { DraftAssociationRef, PublishCommand, PublishOutcome } from '../publish/publish-types';
import {
  AiCoverConfirmationModal,
  type AiCoverDisclosure,
  type AiCoverGenerationSelection,
} from './ai-cover-confirmation';
import { WORKBENCH_VIEW_TYPE } from './open-workbench';
import {
  buildPublishDialogModel,
  PublishConfirmationModal,
  UnlinkAssociationModal,
} from './publish-dialog';
import { PublishReportModal } from './publish-report-modal';
import { ArticlePreviewRenderer, type PreviewAssetResolver } from './render-preview';
import { renderPublishSettings } from './workbench-publish-settings';
import { CoverPreviewModal } from './cover-preview-modal';
import { StyleWorkbench } from './style-workbench';

interface WorkbenchControllerBinding {
  start(): void;
  stop(): void;
  rebuild(reason: string): void;
  selectTheme(themeId: string): void;
  updateStyle?(patch: Readonly<Record<string, unknown>>): void;
  selectStyleTheme?(themeId: string): void;
  resetStyle?(): void;
  setStyleAsDefault?(): Promise<void>;
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
  unlinkPublishAssociation(association: Readonly<DraftAssociationRef>): Promise<void>;
  coverPickerModel(): Readonly<CoverPickerModel>;
  aiCoverDisclosure(supplementalPrompt?: string): Readonly<AiCoverDisclosure>;
  prepareCover(input: Readonly<CoverPickerOption>): Promise<Readonly<PreparedCover>>;
  prepareUploadCover(bytes: Uint8Array): Promise<Readonly<PreparedCover>>;
  generateAiCover(
    supplementalPrompt?: string,
    selection?: Readonly<AiCoverGenerationSelection>,
  ): Promise<Readonly<PreparedCover>>;
  confirmCover(prepared: Readonly<PreparedCover>): Promise<void>;
  saveArticleSettings(
    file: VaultFileRef,
    settings: Readonly<EditableArticleSettings>,
  ): Promise<void>;
  generateTitles?(draft: Readonly<ArticleDraftValues>): Promise<readonly string[]>;
  generateDigest?(draft: Readonly<ArticleDraftValues>): Promise<string>;
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

function errorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const candidate = error as { code?: unknown };
  return typeof candidate.code === 'string' ? candidate.code : null;
}

export function isMissingAccountConfiguration(error: unknown): boolean {
  return errorCode(error) === 'WECHAT_ACCOUNT_NOT_CONFIGURED';
}

function draftAssociationFromError(error: unknown): Readonly<DraftAssociationRef> | null {
  if (errorCode(error) !== 'DRAFT_ACCOUNT_MISMATCH'
    || typeof error !== 'object' || error === null) return null;
  const association = (error as { association?: unknown }).association;
  if (typeof association !== 'object' || association === null) return null;
  const candidate = association as {
    file?: { path?: unknown; basename?: unknown; modifiedAt?: unknown };
    draftId?: unknown;
    accountId?: unknown;
  };
  if (typeof candidate.file?.path !== 'string'
    || typeof candidate.file.basename !== 'string'
    || typeof candidate.file.modifiedAt !== 'number'
    || typeof candidate.draftId !== 'string'
    || candidate.draftId.length === 0
    || typeof candidate.accountId !== 'string'
    || candidate.accountId.length === 0) return null;
  return Object.freeze({
    file: Object.freeze({
      path: candidate.file.path,
      basename: candidate.file.basename,
      modifiedAt: candidate.file.modifiedAt,
    }),
    draftId: candidate.draftId,
    accountId: candidate.accountId,
  });
}

export function copyFailureMessage(error: unknown): string {
  const code = errorCode(error);
  if (code === 'ARTICLE_NOT_READY') return '文章仍在排版，请稍候再试。';
  if (code === 'COPY_PREFLIGHT_BLOCKED') return '请检查文章标题、正文和主题设置后再复制。';
  if (code === 'TITLE_EMPTY') return '请先填写文章标题再复制。';
  if (code === 'SANITIZED_BODY_EMPTY') return '文章正文为空，请补充内容后再复制。';
  if (code === 'THEME_INVALID') return '当前主题不可用，请更换主题后再复制。';
  if (code === 'LOCAL_ASSET_UNREADABLE' || code === 'LOCAL_ASSET_CHANGED'
    || code === 'ASSET_SLOT_UNRESOLVED') {
    return '文章中的本地图片无法读取，请检查图片后再复制。';
  }
  if (code === 'IMAGE_TOO_LARGE' || code === 'TOTAL_IMAGE_BYTES_EXCEEDED') {
    return '文章图片过大，请压缩后再复制。';
  }
  if (code === 'IMAGE_TYPE_UNSUPPORTED') return '文章包含暂不支持的图片格式，请更换后再复制。';
  if (code === 'REMOTE_ASSET_INSECURE' || code === 'CONTENT_SOURCE_NOT_HTTPS') {
    return '远程图片和原文链接必须使用 HTTPS 地址。';
  }
  if (code === 'IMAGE_PROTOCOL_UNSUPPORTED') return '文章包含不支持的图片链接，请更换后再复制。';
  return '复制失败，请检查文章中的图片或 Mermaid 图表。';
}

export function publishPreparationMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (/cover|封面/iu.test(message)) return '请先在发布设置中选择文章封面。';
  if (/local.*image|image.*missing|本地图片/iu.test(message)) {
    return '请检查文章中的本地图片后再发文章。';
  }
  if (/title|author|digest|source URL|标题|作者|摘要|原文链接/iu.test(message)) {
    return '请检查发布设置中的标题、作者和摘要。';
  }
  if (/association|draft|草稿关联/iu.test(message)) {
    return '当前文章的草稿关联需要处理，请先到公众号草稿箱确认最近一次同步结果。';
  }
  return '暂时无法发文章，请检查公众号账号、文章信息和封面设置。';
}

export class WeChatWorkbenchView extends ItemView implements WorkbenchViewPort {
  private controller: WorkbenchControllerBinding | null = null;
  private readonly previewRenderer: ArticlePreviewRenderer;
  private actionBar: HTMLElement | null = null;
  private previewEl: HTMLElement | null = null;
  private styleHost: HTMLElement | null = null;
  private settingsEl: HTMLElement | null = null;
  private previewTab: HTMLButtonElement | null = null;
  private styleTrigger: HTMLButtonElement | null = null;
  private copyButton: HTMLButtonElement | null = null;
  private publishButton: HTMLButtonElement | null = null;
  private styleWorkbench: StyleWorkbench | null = null;
  private latestState: Readonly<WorkbenchRenderState> | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly previewAssets?: PreviewAssetResolver,
    private readonly openSettings: () => void = () => undefined,
    private readonly openConsole: () => Promise<void> = () => openWeChatOfficialConsole(),
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
    const account = element('a', 'clickable-icon');
    account.type = 'button';
    account.href = WECHAT_OFFICIAL_CONSOLE_URL;
    account.target = '_blank';
    account.rel = 'noopener noreferrer';
    account.dataset.testid = 'wechat-console-link';
    account.setAttribute('aria-label', '跳转到公众号后台');
    account.title = '跳转到公众号后台';
    setIcon(account, 'external-link');
    this.registerDomEvent(account, 'click', event => {
      event.preventDefault();
      void this.openConsole().catch(() => {
        new Notice('无法打开公众号后台，请在浏览器访问 mp.weixin.qq.com。');
      });
    });
    header.append(brand, account);

    const tabs = element('div', 'wechat-workbench__tabs');
    tabs.setAttribute('role', 'tablist');
    const viewId = ++workbenchViewCounter;
    const previewTabId = `wechat-workbench-preview-tab-${viewId}`;
    const settingsTabId = `wechat-workbench-settings-tab-${viewId}`;
    const previewPanelId = `wechat-workbench-preview-panel-${viewId}`;
    const settingsPanelId = `wechat-workbench-settings-panel-${viewId}`;
    const previewTab = element('button', 'is-active', '文章预览');
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
    toolbar.dataset.testid = 'preview-actions';
    this.actionBar = toolbar;
    const publishButton = disabledAction('发文章', true);
    publishButton.dataset.testid = 'publish-draft';
    this.registerDomEvent(publishButton, 'click', () => void this.preparePublish());
    this.publishButton = publishButton;
    const copyButton = disabledAction('复制');
    copyButton.dataset.testid = 'copy-rich';
    this.registerDomEvent(copyButton, 'click', () => void this.runCopy());
    this.copyButton = copyButton;
    const styleTrigger = disabledAction('样式');
    styleTrigger.dataset.testid = 'style-trigger';
    styleTrigger.classList.add('wechat-workbench__style-trigger');
    styleTrigger.setAttribute('aria-expanded', 'false');
    styleTrigger.setAttribute('aria-label', '打开文章样式');
    this.registerDomEvent(styleTrigger, 'click', () => this.toggleStylePanel());
    this.styleTrigger = styleTrigger;
    toolbar.append(publishButton, copyButton, styleTrigger);

    const previewPanel = element('main', 'wechat-workbench__body');
    previewPanel.id = previewPanelId;
    previewPanel.setAttribute('role', 'tabpanel');
    previewPanel.setAttribute('aria-labelledby', previewTabId);
    const stage = element('div', 'wechat-workbench__preview-stage');
    const canvas = element('div', 'wechat-workbench__preview-canvas');
    this.previewEl = element('div', 'wechat-workbench__preview wechat-workbench__preview-sheet');
    const empty = element('div', 'wechat-workbench__empty', '打开一篇 Markdown 笔记开始预览');
    empty.dataset.testid = 'workbench-empty';
    this.previewEl.append(empty);
    canvas.append(this.previewEl);
    const styleHost = element('div', 'wechat-workbench__style-host');
    styleHost.hidden = true;
    this.styleHost = styleHost;
    stage.append(canvas, styleHost);
    previewPanel.append(stage);

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
      header, tabs, toolbar,
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
    this.closeStylePanel(false);
    this.previewRenderer.clear();
    if (this.previewTab !== null) this.previewTab.textContent = '文章预览';
    if (this.styleTrigger !== null) {
      this.styleTrigger.textContent = '样式';
      this.styleTrigger.disabled = true;
    }
    if (this.copyButton !== null) this.copyButton.disabled = true;
    if (this.publishButton !== null) this.publishButton.disabled = true;
    if (this.settingsEl !== null) this.renderSettingsPlaceholder('打开一篇 Markdown 笔记开始预览');
    if (this.previewEl !== null) {
      const empty = element('div', 'wechat-workbench__empty', '打开一篇 Markdown 笔记开始预览');
      empty.dataset.testid = 'workbench-empty';
      this.previewEl.replaceChildren(empty);
    }
  }

  showLoading(path: string): void {
    this.latestState = null;
    if (this.copyButton !== null) this.copyButton.disabled = true;
    if (this.publishButton !== null) this.publishButton.disabled = true;
    if (this.styleTrigger !== null) this.styleTrigger.disabled = true;
    if (this.settingsEl !== null) this.renderSettingsPlaceholder('正在排版…');
  }

  showError(_message: string): void {
    this.latestState = null;
    this.closeStylePanel(false);
    this.previewRenderer.clear();
    if (this.copyButton !== null) this.copyButton.disabled = true;
    if (this.publishButton !== null) this.publishButton.disabled = true;
    if (this.styleTrigger !== null) this.styleTrigger.disabled = true;
    if (this.settingsEl !== null) this.renderSettingsPlaceholder('文章排版失败，请检查当前笔记。');
    if (this.previewEl !== null) this.previewEl.replaceChildren(element(
      'div',
      'wechat-workbench__error',
      '文章排版失败，请检查当前笔记或主题设置。修改后会自动刷新预览。',
    ));
  }

  showArtifact(state: Readonly<WorkbenchRenderState>): void {
    this.latestState = state;
    if (this.previewTab !== null) {
      this.previewTab.textContent = '文章预览';
    }
    if (this.styleTrigger !== null) {
      this.styleTrigger.textContent = '样式';
      this.styleTrigger.setAttribute('aria-label', '打开文章样式');
      this.styleTrigger.disabled = state.themes.length === 0;
      if (this.styleWorkbench !== null) this.renderStylePanel(state);
    }
    if (this.previewEl !== null) this.previewRenderer.render(this.previewEl, state.artifact);
    if (this.copyButton !== null) this.copyButton.disabled = false;
    if (this.publishButton !== null) this.publishButton.disabled = false;
    if (this.settingsEl !== null) this.renderSettings(state);
  }

  private renderSettings(state: Readonly<WorkbenchRenderState>): void {
    if (this.settingsEl === null) return;
    const file = Object.freeze({
      path: state.snapshot.vaultPath,
      basename: state.snapshot.basename,
      modifiedAt: state.snapshot.modifiedAt,
    });
    renderPublishSettings(this.settingsEl, state, {
      useFirstImageCover: () => void this.useFirstImageCover(),
      uploadCover: bytes => void this.uploadCover(bytes),
      generateAiCover: () => void this.generateAiCover(),
      saveArticle: settings => this.saveArticleSettings(file, settings),
      generateTitles: draft => this.controller?.generateTitles?.(draft)
        ?? Promise.reject(new Error('文本生成服务不可用。')),
      generateDigest: draft => this.controller?.generateDigest?.(draft)
        ?? Promise.reject(new Error('文本生成服务不可用。')),
      resolveCoverPreview: source => typeof source === 'string'
        ? this.previewAssets?.resolveLocalImage?.(source) ?? Promise.resolve(null)
        : this.previewAssets?.resolve(source) ?? Promise.resolve(null),
      openCoverPreview: (url, alt) => this.openCoverPreview(url, alt),
    });
  }

  private renderSettingsPlaceholder(message: string): void {
    if (this.settingsEl === null) return;
    this.settingsEl.replaceChildren(element('div', 'wechat-workbench__empty', message));
  }

  openCoverPreview(url: string, alt: string): void {
    if (typeof url !== 'string' || url.length === 0) return;
    new CoverPreviewModal(this.app, url, alt).open();
  }

  showStyleStatus(status: 'saved' | 'saving' | 'unsaved', message?: string): void {
    if (this.styleWorkbench === null || this.latestState === null) return;
    this.renderStylePanel(Object.freeze({
      ...this.latestState,
      styleSaveStatus: status,
    }));
    if (message !== undefined && status !== 'saving') this.showStyleMessage(message);
  }

  showStyleMessage(message: string): void {
    const messageEl = this.styleHost?.querySelector<HTMLElement>('.wechat-workbench__style-message');
    if (messageEl !== null && messageEl !== undefined) {
      messageEl.textContent = message;
      return;
    }
    new Notice(message);
  }

  private toggleStylePanel(): void {
    if (this.latestState === null || this.styleHost === null) return;
    if (this.styleWorkbench !== null) {
      this.closeStylePanel();
      return;
    }
    this.styleWorkbench = new StyleWorkbench(this.app, this.styleHost, {
      patch: patch => this.controller?.updateStyle?.(patch),
      selectTheme: themeId => this.controller?.selectStyleTheme?.(themeId),
      reset: () => this.controller?.resetStyle?.(),
      close: () => this.closeStylePanel(),
    });
    this.renderStylePanel(this.latestState);
    this.styleHost.hidden = false;
    this.styleTrigger?.setAttribute('aria-expanded', 'true');
    this.styleWorkbench.focusFirst();
  }

  private renderStylePanel(state: Readonly<WorkbenchRenderState>): void {
    if (this.styleWorkbench === null) return;
    this.styleWorkbench.update(state);
    if (this.styleHost !== null) this.styleHost.hidden = false;
  }

  private closeStylePanel(restoreFocus = true): void {
    this.styleWorkbench?.destroy();
    this.styleWorkbench = null;
    if (this.styleHost !== null) this.styleHost.hidden = true;
    this.styleTrigger?.setAttribute('aria-expanded', 'false');
    if (restoreFocus) this.styleTrigger?.focus();
  }

  private async runCopy(): Promise<void> {
    const button = this.copyButton;
    if (button === null || this.controller === null) return;
    button.disabled = true;
    try {
      await this.controller.copyForWeChat();
      new Notice('已复制公众号富文本');
    } catch (error) {
      new Notice(copyFailureMessage(error));
    } finally {
      button.disabled = this.latestState === null;
    }
  }

  private async saveArticleSettings(
    file: VaultFileRef,
    settings: Readonly<EditableArticleSettings>,
  ): Promise<void> {
    if (this.controller === null) return;
    try {
      await this.controller.saveArticleSettings(file, settings);
      new Notice('文章信息已保存');
    } catch {
      new Notice('文章信息保存失败，请确认当前笔记仍可编辑。');
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
      const association = draftAssociationFromError(error);
      if (association !== null) {
        this.confirmUnlink(association);
      } else if (isMissingAccountConfiguration(error)) {
        new Notice('公众号账号未配置，请先打开插件设置完善本地账号信息。');
        this.openSettings();
      } else {
        new Notice(publishPreparationMessage(error));
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
    } catch {
      new Notice('草稿同步失败，请稍后重试；如果问题持续，请到公众号后台确认草稿状态。');
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
      UNLINK_LOCAL: command.expectedAssociation === null
        ? undefined
        : () => this.confirmUnlink(command.expectedAssociation!),
      OPEN_SETTINGS: this.openSettings,
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
    } catch {
      new Notice('草稿状态恢复失败，请先到公众号草稿箱核对文章，再决定是否重试。');
    }
  }

  private confirmUnlink(association: Readonly<DraftAssociationRef>): void {
    new UnlinkAssociationModal(
      this.app,
      association.file.path,
      () => void this.unlinkAssociation(association),
    ).open();
  }

  private async unlinkAssociation(association: Readonly<DraftAssociationRef>): Promise<void> {
    try {
      await this.controller?.unlinkPublishAssociation(association);
      new Notice('已解除旧草稿关联，公众号后台草稿不会被删除。');
    } catch {
      new Notice('无法解除旧草稿关联，请确认当前打开的是同一篇文章。');
    }
  }

  private async useFirstImageCover(): Promise<void> {
    if (this.controller === null) return;
    try {
      const option = this.controller.coverPickerModel().options.find(item => item.kind === 'first-image');
      if (option === undefined) throw new Error('文章首图暂不可用。');
      await this.controller.confirmCover(await this.controller.prepareCover(option));
      new Notice('已切换为文章首图');
    } catch {
      new Notice('无法使用文章首图，请确认当前文章仍可编辑。');
    }
  }

  private async uploadCover(bytes: Uint8Array): Promise<void> {
    if (this.controller === null) return;
    try {
      await this.controller.confirmCover(await this.controller.prepareUploadCover(bytes));
      new Notice('文章封面已更新');
    } catch {
      new Notice('本地图片处理失败，请选择 PNG、JPEG 或 WebP 图片。');
    }
  }

  private async generateAiCover(): Promise<void> {
    if (this.controller === null) return;
    const controller = this.controller;
    new AiCoverConfirmationModal(
      this.app,
      controller.aiCoverDisclosure(),
      selection => controller.generateAiCover(selection.supplementalPrompt, selection),
      async prepared => {
        await controller.confirmCover(prepared);
        new Notice('智能封面已生成并采用');
      },
    ).open();
  }

  private switchTab(
    preview: boolean,
    previewTab: HTMLButtonElement,
    settingsTab: HTMLButtonElement,
    previewPanel: HTMLElement,
  ): void {
    if (!preview) this.closeStylePanel(false);
    previewTab.classList.toggle('is-active', preview);
    settingsTab.classList.toggle('is-active', !preview);
    previewTab.setAttribute('aria-selected', String(preview));
    settingsTab.setAttribute('aria-selected', String(!preview));
    previewPanel.hidden = !preview;
    if (this.actionBar !== null) {
      this.actionBar.hidden = !preview;
      this.actionBar.style.display = preview ? '' : 'none';
    }
    if (this.settingsEl !== null) this.settingsEl.hidden = preview;
  }
}
