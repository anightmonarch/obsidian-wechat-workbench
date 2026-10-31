import type { ArticleDraftValues, EditableArticleSettings, NoteSnapshot } from '../domain/article';
import type { RenderArtifact } from '../domain/artifact';
import type { VaultFileRef } from '../domain/ports';
import type { ArticleStyleConfig } from '../domain/style';
import type { ThemeDefinition } from '../domain/theme';
import type {
  CoverPickerModel,
  CoverPickerOption,
  PreparedCover,
} from '../cover/cover-workflow';
import type { PreflightContext, PreflightReport } from '../preflight/preflight-engine';
import type { PreparedPublish } from '../publish/publish-workflow';
import type { DraftAssociationRef, PublishCommand, PublishOutcome } from '../publish/publish-types';
import { publishPayloadHash } from '../publish/publish-content';
import { DEFAULT_ARTICLE_STYLE, patchArticleStyle } from '../styles/style-config';
import type { ResolvedArticleStyle } from '../styles/style-resolver';
import type { AiCoverDisclosure } from './ai-cover-confirmation';
import type { AiCoverGenerationSelection } from './ai-cover-confirmation';
import type { GenerationBackend } from '../settings/model';

export interface WorkbenchEventHandle {
  hostEvent?: unknown;
  dispose(): void;
}

export interface WorkbenchSourcePort {
  currentMarkdown(): VaultFileRef | null;
  onActiveMarkdownChanged(listener: () => void): WorkbenchEventHandle;
  onVaultFileModified(listener: (path: string) => void): WorkbenchEventHandle;
}

export interface SnapshotServicePort {
  snapshot(file: VaultFileRef): Promise<Readonly<NoteSnapshot>>;
}

export interface ThemeRegistryPort {
  get(id: string): Readonly<ThemeDefinition> | undefined;
  list(): readonly Readonly<ThemeDefinition>[];
}

export interface ArtifactBuilderPort {
  build(
    snapshot: Readonly<NoteSnapshot>,
    theme: Readonly<ThemeDefinition>,
    style?: Readonly<ArticleStyleConfig> | null
  ): Promise<Readonly<RenderArtifact>>;
}

export interface WorkbenchStylePort {
  resolve(): Readonly<ResolvedArticleStyle>;
  materialize(resolved: Readonly<ResolvedArticleStyle>): Readonly<ThemeDefinition>;
  setGlobalDefault(config: Readonly<ArticleStyleConfig>): Promise<void>;
  configForTheme(themeId: string): Readonly<ArticleStyleConfig>;
  reset(themeId: string): Readonly<ArticleStyleConfig>;
  recordPublishSnapshot(file: VaultFileRef, config: Readonly<ArticleStyleConfig>): Promise<void>;
}

export interface PreflightEnginePort {
  run(
    artifact: Readonly<RenderArtifact> | null,
    context: Readonly<PreflightContext>
  ): Readonly<PreflightReport>;
}

export interface WorkbenchRenderState {
  snapshot: Readonly<NoteSnapshot>;
  artifact: Readonly<RenderArtifact>;
  preflight: Readonly<PreflightReport>;
  themes: readonly Readonly<ThemeDefinition>[];
  selectedThemeId: string;
  style: Readonly<ResolvedArticleStyle>;
}

export interface WorkbenchViewPort {
  showEmpty(): void;
  showLoading(path: string): void;
  showError(message: string): void;
  showArtifact(state: Readonly<WorkbenchRenderState>): void;
  showStyleMessage?(message: string): void;
}

export interface WorkbenchClipboardPort {
  copyForWeChat(artifact: Readonly<RenderArtifact>): Promise<unknown>;
  copyHtmlSource(artifact: Readonly<RenderArtifact>): Promise<unknown>;
}

export interface WorkbenchPublishPort {
  prepare(file: VaultFileRef, artifact: Readonly<RenderArtifact>): Promise<Readonly<PreparedPublish>>;
  execute(command: Readonly<PublishCommand>): Promise<Readonly<PublishOutcome>>;
  reconcile(command: Readonly<PublishCommand>, taskId: string): Promise<Readonly<PublishOutcome>>;
  repairLocal(
    command: Readonly<PublishCommand>,
    taskId: string,
    fallback?: Readonly<{ mediaId: string; operation: 'CREATE' | 'UPDATE' }>
  ): Promise<Readonly<PublishOutcome>>;
  unlink(association: Readonly<DraftAssociationRef>): Promise<void>;
}

export interface WorkbenchCoverPort {
  model(snapshot: Readonly<NoteSnapshot>, artifact: Readonly<RenderArtifact>): Readonly<CoverPickerModel>;
  disclosure(
    artifact: Readonly<RenderArtifact>,
    supplementalPrompt?: string,
    backend?: GenerationBackend
  ): Readonly<AiCoverDisclosure>;
  prepareSelection(
    file: VaultFileRef,
    snapshot: Readonly<NoteSnapshot>,
    artifact: Readonly<RenderArtifact>,
    kind: CoverPickerOption['kind']
  ): Promise<Readonly<PreparedCover>>;
  prepareUpload(file: VaultFileRef, bytes: Uint8Array, contextHash: string): Promise<Readonly<PreparedCover>>;
  prepareAi(
    file: VaultFileRef,
    artifact: Readonly<RenderArtifact>,
    supplementalPrompt?: string,
    selection?: Readonly<AiCoverGenerationSelection>
  ): Promise<Readonly<PreparedCover>>;
  confirm(file: VaultFileRef, prepared: Readonly<PreparedCover>): Promise<void>;
}

export interface WorkbenchArticleSettingsPort {
  update(
    file: VaultFileRef,
    settings: Readonly<EditableArticleSettings>
  ): Promise<void>;
}

export interface WorkbenchAiTextPort {
  defaultBackend?(): GenerationBackend;
  generateTitles(input: Readonly<{
    snapshot: Readonly<NoteSnapshot>;
    artifact: Readonly<RenderArtifact>;
    draft: Readonly<ArticleDraftValues>;
    backend?: GenerationBackend;
    signal?: AbortSignal;
  }>): Promise<readonly string[]>;
  generateDigest(input: Readonly<{
    snapshot: Readonly<NoteSnapshot>;
    artifact: Readonly<RenderArtifact>;
    draft: Readonly<ArticleDraftValues>;
    backend?: GenerationBackend;
    signal?: AbortSignal;
  }>): Promise<string>;
}


export class WorkbenchActionError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'WorkbenchActionError';
  }
}

type HostEventRegistrar = (event: unknown) => void;
type FallbackThemeSource = string | (() => string);

const WORKBENCH_RENDER_TIMEOUT_MS = 15_000;

class WorkbenchRenderTimeoutError extends Error {
  constructor() {
    super('Article rendering timed out.');
    this.name = 'WorkbenchRenderTimeoutError';
  }
}

function withinRenderDeadline<T>(operation: Promise<T>, timeoutMs = WORKBENCH_RENDER_TIMEOUT_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new WorkbenchRenderTimeoutError());
    }, timeoutMs);
    void operation.then(value => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(value);
    }, error => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      reject(error instanceof Error ? error : new Error(String(error)));
    });
  });
}

export class WorkbenchController {
  private readonly subscriptions: WorkbenchEventHandle[] = [];
  private timer: number | null = null;
  private generation = 0;
  private started = false;
  private styleBuildPending = false;
  private artifact: Readonly<RenderArtifact> | null = null;
  private report: Readonly<PreflightReport> | null = null;
  private snapshot: Readonly<NoteSnapshot> | null = null;
  private style: Readonly<ResolvedArticleStyle> | null = null;
  private previewStyleOverride: Readonly<{ path: string; config: Readonly<ArticleStyleConfig> }> | null = null;

  constructor(
    private readonly source: WorkbenchSourcePort,
    private readonly snapshots: SnapshotServicePort,
    private readonly themes: ThemeRegistryPort,
    private readonly builder: ArtifactBuilderPort,
    private readonly preflight: PreflightEnginePort,
    private readonly view: WorkbenchViewPort,
    private readonly registerHostEvent: HostEventRegistrar,
    private readonly fallbackThemeId: FallbackThemeSource,
    private readonly debounceMs = 400,
    private readonly clipboard?: WorkbenchClipboardPort,
    private readonly publisher?: WorkbenchPublishPort,
    private readonly covers?: WorkbenchCoverPort,
    private readonly articleSettings?: WorkbenchArticleSettingsPort,
    private readonly styles?: WorkbenchStylePort,
    private readonly aiText?: WorkbenchAiTextPort
  ) {}

  start(): void {
    if (this.started) {
      this.rebuild('view-reopened');
      return;
    }
    this.started = true;
    this.addSubscription(this.source.onActiveMarkdownChanged(() => {
      this.rebuild('active-file');
    }));
    this.addSubscription(this.source.onVaultFileModified(path => {
      const activePath = this.source.currentMarkdown()?.path;
      const activeAssetChanged = this.artifact?.assets.some(asset => (
        asset.kind === 'local-image' && asset.source === path
      )) ?? false;
      if (activePath === path || activeAssetChanged) this.rebuild('modified');
    }));
    this.rebuild('start');
  }

  async stop(): Promise<void> {
    if (!this.started) return;
    this.started = false;
    this.generation += 1;
    this.artifact = null;
    this.report = null;
    this.snapshot = null;
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
    for (const subscription of this.subscriptions.splice(0)) subscription.dispose();
  }

  rebuild(_reason: string): void {
    if (!this.started) return;
    this.generation += 1;
    const requestedGeneration = this.generation;
    this.styleBuildPending = _reason === 'style';
    const pendingFile = this.source.currentMarkdown();
    const preserveExistingView = this.artifact !== null
      && this.snapshot?.vaultPath === pendingFile?.path
      && (_reason === 'article-settings' || _reason === 'modified' || _reason === 'cover-confirmed');
    if (!this.styleBuildPending) {
      if (!preserveExistingView) {
        this.artifact = null;
        this.report = null;
        this.snapshot = null;
        this.style = null;
      }
    }
    if (pendingFile === null) this.view.showEmpty();
    else if (!this.styleBuildPending && !preserveExistingView) this.view.showLoading(pendingFile.path);
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      this.timer = null;
      void this.buildCurrent(requestedGeneration, this.styleBuildPending, preserveExistingView);
    }, this.debounceMs);
  }

  selectTheme(themeId: string): void {
    if (this.styles !== undefined) this.selectStyleTheme(themeId);
  }

  updateStyle(
    patch: Readonly<Partial<Omit<ArticleStyleConfig, 'version' | 'headingStyles'>> & {
      headingStyles?: ArticleStyleConfig['headingStyles'];
    }>
  ): void {
    if (this.styles === undefined) return;
    const current = this.style?.config;
    if (current === undefined) return;
    this.applyStyleConfig(patchArticleStyle(current, patch));
  }

  selectStyleTheme(themeId: string): void {
    if (this.styles === undefined || this.themes.get(themeId) === undefined) return;
    this.applyStyleConfig(this.styles.configForTheme(themeId));
  }

  resetStyle(): void {
    const themeId = this.style?.config.themeId;
    if (themeId !== undefined && this.styles !== undefined) {
      this.applyStyleConfig(this.styles.reset(themeId));
    }
  }

  private applyStyleConfig(config: Readonly<ArticleStyleConfig>): void {
    if (this.styles === undefined) return;
    const file = this.snapshot === null ? null : this.currentFile(this.snapshot);
    if (file !== null) {
      this.previewStyleOverride = Object.freeze({ path: file.path, config });
    }
    void this.styles.setGlobalDefault(config).catch(() => {
      this.view.showStyleMessage?.('全局样式保存失败，请重试。');
    });
    this.rebuild('style');
  }

  currentStyle(): Readonly<ResolvedArticleStyle> | null {
    return this.style;
  }

  currentArtifact(): Readonly<RenderArtifact> | null {
    return this.artifact;
  }

  async copyForWeChat(): Promise<void> {
    if (this.artifact === null || this.report === null) {
      throw new WorkbenchActionError('ARTICLE_NOT_READY', '当前文章尚未完成渲染。');
    }
    if (this.report.blocking.length > 0) {
      const blocking = this.report.blocking[0];
      throw new WorkbenchActionError(
        blocking?.code ?? 'COPY_PREFLIGHT_BLOCKED',
        blocking?.message ?? '请先修复复制预检中的阻断项。'
      );
    }
    if (this.clipboard === undefined) {
      throw new WorkbenchActionError('CLIPBOARD_UNAVAILABLE', '剪贴板服务不可用。');
    }
    await this.clipboard.copyForWeChat(this.artifact);
  }

  async copyHtmlSource(): Promise<void> {
    if (this.artifact === null) {
      throw new WorkbenchActionError('ARTICLE_NOT_READY', '当前文章尚未完成渲染。');
    }
    if (this.clipboard === undefined) {
      throw new WorkbenchActionError('CLIPBOARD_UNAVAILABLE', '剪贴板服务不可用。');
    }
    await this.clipboard.copyHtmlSource(this.artifact);
  }

  async preparePublish(): Promise<Readonly<PreparedPublish>> {
    if (this.artifact === null || this.snapshot === null) {
      throw new WorkbenchActionError('ARTICLE_NOT_READY', '当前文章尚未完成渲染。');
    }
    if (this.publisher === undefined) {
      throw new WorkbenchActionError('PUBLISH_UNAVAILABLE', '草稿发布服务不可用。');
    }
    return this.publisher.prepare({
      path: this.snapshot.vaultPath,
      basename: this.snapshot.basename,
      modifiedAt: this.snapshot.modifiedAt,
    }, this.artifact);
  }

  async executePublish(command: Readonly<PublishCommand>): Promise<Readonly<PublishOutcome>> {
    if (this.publisher === undefined) {
      throw new WorkbenchActionError('PUBLISH_UNAVAILABLE', '草稿发布服务不可用。');
    }
    const result = await this.publisher.execute(command);
    this.recordStyleSnapshot(result);
    this.rebuild('publish-result');
    return result;
  }

  private recordStyleSnapshot(result: Readonly<PublishOutcome>): void {
    if (this.styles === undefined || this.snapshot === null || this.style === null) return;
    if (result.state !== 'REMOTE_COMMITTED' && result.state !== 'LOCAL_COMMITTED') return;
    void this.styles
      .recordPublishSnapshot(this.currentFile(this.snapshot), this.style.config)
      .catch(() => undefined);
  }

  async reconcilePublish(
    command: Readonly<PublishCommand>,
    taskId: string
  ): Promise<Readonly<PublishOutcome>> {
    if (this.publisher === undefined) throw new WorkbenchActionError('PUBLISH_UNAVAILABLE', '草稿发布服务不可用。');
    return this.publisher.reconcile(command, taskId);
  }

  async repairLocalPublish(
    command: Readonly<PublishCommand>,
    taskId: string,
    fallback?: Readonly<{ mediaId: string; operation: 'CREATE' | 'UPDATE' }>
  ): Promise<Readonly<PublishOutcome>> {
    if (this.publisher === undefined) throw new WorkbenchActionError('PUBLISH_UNAVAILABLE', '草稿发布服务不可用。');
    const result = await this.publisher.repairLocal(command, taskId, fallback);
    this.rebuild('publish-repair');
    return result;
  }

  async unlinkPublishAssociation(association: Readonly<DraftAssociationRef>): Promise<void> {
    if (this.publisher === undefined || this.snapshot?.vaultPath !== association.file.path) {
      throw new WorkbenchActionError('ARTICLE_CONTEXT_CHANGED', '当前笔记已变化，请重新打开解除关联确认框。');
    }
    await this.publisher.unlink(association);
    this.rebuild('publish-unlink');
  }

  coverPickerModel(): Readonly<CoverPickerModel> {
    const current = this.coverContext();
    return this.covers?.model(current.snapshot, current.artifact)
      ?? {
        options: Object.freeze([]),
        generationBackend: 'api',
        aiEnabled: false,
        aiDisabledReason: '封面服务不可用',
      };
  }

  imageGenerationBackend(): GenerationBackend {
    return this.coverPickerModel().generationBackend;
  }

  aiCoverDisclosure(
    supplementalPrompt = '',
    backend?: GenerationBackend
  ): Readonly<AiCoverDisclosure> {
    const current = this.coverContext();
    if (this.covers === undefined) throw new WorkbenchActionError('COVER_UNAVAILABLE', '封面服务不可用。');
    return this.covers.disclosure(current.artifact, supplementalPrompt, backend);
  }

  async prepareCover(input: Readonly<CoverPickerOption>): Promise<Readonly<PreparedCover>> {
    const current = this.coverContext();
    if (this.covers === undefined) throw new WorkbenchActionError('COVER_UNAVAILABLE', '封面服务不可用。');
    const file = this.currentFile(current.snapshot);
    return this.covers.prepareSelection(file, current.snapshot, current.artifact, input.kind);
  }

  async prepareUploadCover(bytes: Uint8Array): Promise<Readonly<PreparedCover>> {
    const current = this.coverContext();
    if (this.covers === undefined) throw new WorkbenchActionError('COVER_UNAVAILABLE', '封面服务不可用。');
    return this.covers.prepareUpload(
      this.currentFile(current.snapshot),
      bytes,
      publishPayloadHash(current.artifact)
    );
  }

  async generateAiCover(
    supplementalPrompt = '',
    selection?: Readonly<AiCoverGenerationSelection>
  ): Promise<Readonly<PreparedCover>> {
    const current = this.coverContext();
    if (this.covers === undefined) throw new WorkbenchActionError('COVER_UNAVAILABLE', '封面服务不可用。');
    return this.covers.prepareAi(this.currentFile(current.snapshot), current.artifact, supplementalPrompt, selection);
  }

  async confirmCover(prepared: Readonly<PreparedCover>): Promise<void> {
    const current = this.coverContext();
    if (this.covers === undefined) throw new WorkbenchActionError('COVER_UNAVAILABLE', '封面服务不可用。');
    if (prepared.notePath !== current.snapshot.vaultPath
      || prepared.contextHash !== publishPayloadHash(current.artifact)) {
      throw new WorkbenchActionError('ARTICLE_CONTEXT_CHANGED', '当前笔记已变化，请重新选择并确认封面。');
    }
    await this.covers.confirm(this.currentFile(current.snapshot), prepared);
    this.rebuild('cover-confirmed');
  }

  async saveArticleSettings(
    file: VaultFileRef,
    settings: Readonly<EditableArticleSettings>
  ): Promise<void> {
    if (this.snapshot === null || this.articleSettings === undefined) {
      throw new WorkbenchActionError('ARTICLE_SETTINGS_UNAVAILABLE', '当前文章尚未准备好。');
    }
    if (this.snapshot.vaultPath !== file.path || this.snapshot.modifiedAt !== file.modifiedAt) {
      throw new WorkbenchActionError('ARTICLE_CONTEXT_CHANGED', '当前文章已经变化，请重新编辑文章信息。');
    }
    await this.articleSettings.update(file, settings);
    this.rebuild('article-settings');
  }

  async generateTitles(
    draft: Readonly<ArticleDraftValues>,
    backend?: GenerationBackend,
    signal?: AbortSignal
  ): Promise<readonly string[]> {
    if (this.aiText === undefined) throw new WorkbenchActionError('AI_TEXT_UNAVAILABLE', '文本生成服务不可用。');
    const current = this.articleContext();
    return this.aiText.generateTitles({
      ...current,
      draft,
      ...(backend === undefined ? {} : { backend }),
      ...(signal === undefined ? {} : { signal }),
    });
  }

  textGenerationBackend(): GenerationBackend {
    return this.aiText?.defaultBackend?.() ?? 'api';
  }

  async generateDigest(
    draft: Readonly<ArticleDraftValues>,
    backend?: GenerationBackend,
    signal?: AbortSignal
  ): Promise<string> {
    if (this.aiText === undefined) throw new WorkbenchActionError('AI_TEXT_UNAVAILABLE', '文本生成服务不可用。');
    const current = this.articleContext();
    return this.aiText.generateDigest({
      ...current,
      draft,
      ...(backend === undefined ? {} : { backend }),
      ...(signal === undefined ? {} : { signal }),
    });
  }


  private coverContext(): Readonly<{ snapshot: Readonly<NoteSnapshot>; artifact: Readonly<RenderArtifact> }> {
    if (this.snapshot === null || this.artifact === null) {
      throw new WorkbenchActionError('ARTICLE_NOT_READY', '当前文章尚未完成渲染。');
    }
    return Object.freeze({ snapshot: this.snapshot, artifact: this.artifact });
  }

  private articleContext(): Readonly<{ snapshot: Readonly<NoteSnapshot>; artifact: Readonly<RenderArtifact> }> {
    if (this.snapshot === null || this.artifact === null) {
      throw new WorkbenchActionError('ARTICLE_NOT_READY', '当前文章尚未完成渲染。');
    }
    return Object.freeze({ snapshot: this.snapshot, artifact: this.artifact });
  }

  private currentFile(snapshot: Readonly<NoteSnapshot>): VaultFileRef {
    return { path: snapshot.vaultPath, basename: snapshot.basename, modifiedAt: snapshot.modifiedAt };
  }

  private addSubscription(subscription: WorkbenchEventHandle): void {
    this.subscriptions.push(subscription);
    if (subscription.hostEvent !== undefined) this.registerHostEvent(subscription.hostEvent);
  }

  private async buildCurrent(
    requestedGeneration: number,
    styleOnly = false,
    preserveExistingView = false
  ): Promise<void> {
    const file = this.source.currentMarkdown();
    if (file === null) {
      if (this.isCurrent(requestedGeneration)) this.view.showEmpty();
      return;
    }
    if (!styleOnly && !preserveExistingView) this.view.showLoading(file.path);

    try {
      const { snapshot, resolved, theme, themeIsValid, artifact } = await withinRenderDeadline((async () => {
        const snapshot = await this.snapshots.snapshot(file);
        let resolved: Readonly<ResolvedArticleStyle> | null = null;
        let theme: Readonly<ThemeDefinition> | undefined;
        let themeIsValid = true;
        if (this.styles !== undefined) {
          resolved = this.styles.resolve();
          if (this.previewStyleOverride?.path === file.path) {
            resolved = Object.freeze({
              ...resolved,
              themeId: this.previewStyleOverride.config.themeId,
              config: this.previewStyleOverride.config,
            });
          }
          theme = this.styles.materialize(resolved);
        } else {
          const requestedTheme = this.themes.get(snapshot.selectedThemeId);
          theme = requestedTheme
            ?? this.themes.get(this.currentFallbackThemeId())
            ?? this.themes.list()[0];
          themeIsValid = requestedTheme !== undefined;
        }
        if (theme === undefined) throw new Error('No valid article theme is available.');
        const artifact = await this.builder.build(
          snapshot,
          theme,
          resolved?.renderMode === 'compiled' ? resolved.config : null
        );
        return { snapshot, resolved, theme, themeIsValid, artifact };
      })());
      if (!this.isCurrent(requestedGeneration)) return;

      const report = this.preflight.run(artifact, {
        purpose: 'copy',
        themeValid: themeIsValid,
      });
      this.artifact = artifact;
      this.report = report;
      this.snapshot = snapshot;
      if (resolved !== null) this.style = resolved;
      this.view.showArtifact(Object.freeze({
        snapshot,
        artifact,
        preflight: report,
        themes: this.themes.list(),
        selectedThemeId: theme.manifest.id,
        style: resolved ?? Object.freeze({
          source: 'global', renderMode: 'legacy', themeId: theme.manifest.id,
          config: DEFAULT_ARTICLE_STYLE,
        }),
      }));
    } catch (error) {
      if (!this.isCurrent(requestedGeneration)) return;
      if (styleOnly && this.artifact !== null) {
        this.view.showStyleMessage?.('当前样式无法应用，已恢复上一次效果');
        return;
      }
      this.artifact = null;
      this.report = null;
      this.snapshot = null;
      this.style = null;
      this.view.showError(error instanceof Error ? error.message : 'Article rendering failed.');
    }
  }

  private isCurrent(requestedGeneration: number): boolean {
    return this.started && requestedGeneration === this.generation;
  }

  private currentFallbackThemeId(): string {
    return typeof this.fallbackThemeId === 'function'
      ? this.fallbackThemeId()
      : this.fallbackThemeId;
  }
}
