import type { NoteSnapshot } from '../domain/article';
import type { RenderArtifact } from '../domain/artifact';
import type { VaultFileRef } from '../domain/ports';
import type { ThemeDefinition } from '../domain/theme';
import type { PreflightContext, PreflightReport } from '../preflight/preflight-engine';

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
  ): Promise<Readonly<RenderArtifact>>;
}

export interface PreflightEnginePort {
  run(
    artifact: Readonly<RenderArtifact> | null,
    context: Readonly<PreflightContext>,
  ): Readonly<PreflightReport>;
}

export interface WorkbenchRenderState {
  snapshot: Readonly<NoteSnapshot>;
  artifact: Readonly<RenderArtifact>;
  preflight: Readonly<PreflightReport>;
  themes: readonly Readonly<ThemeDefinition>[];
  selectedThemeId: string;
}

export interface WorkbenchViewPort {
  showEmpty(): void;
  showLoading(path: string): void;
  showError(message: string): void;
  showArtifact(state: Readonly<WorkbenchRenderState>): void;
}

type HostEventRegistrar = (event: unknown) => void;
type FallbackThemeSource = string | (() => string);

export class WorkbenchController {
  private readonly subscriptions: WorkbenchEventHandle[] = [];
  private readonly themeOverrides = new Map<string, string>();
  private timer: number | null = null;
  private generation = 0;
  private started = false;
  private artifact: Readonly<RenderArtifact> | null = null;

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
  ) {}

  start(): void {
    if (this.started) return;
    this.started = true;
    this.addSubscription(this.source.onActiveMarkdownChanged(() => this.rebuild('active-file')));
    this.addSubscription(this.source.onVaultFileModified(path => {
      const activePath = this.source.currentMarkdown()?.path;
      const activeAssetChanged = this.artifact?.assets.some(asset => (
        asset.kind === 'local-image' && asset.source === path
      )) ?? false;
      if (activePath === path || activeAssetChanged) this.rebuild('modified');
    }));
    this.rebuild('start');
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    this.generation += 1;
    this.artifact = null;
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
    for (const subscription of this.subscriptions.splice(0)) subscription.dispose();
  }

  rebuild(_reason: string): void {
    if (!this.started) return;
    this.generation += 1;
    const requestedGeneration = this.generation;
    this.artifact = null;
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      this.timer = null;
      void this.buildCurrent(requestedGeneration);
    }, this.debounceMs);
  }

  selectTheme(themeId: string): void {
    const file = this.source.currentMarkdown();
    if (file === null || this.themes.get(themeId) === undefined) return;
    this.themeOverrides.set(file.path, themeId);
    this.rebuild('theme');
  }

  currentArtifact(): Readonly<RenderArtifact> | null {
    return this.artifact;
  }

  private addSubscription(subscription: WorkbenchEventHandle): void {
    this.subscriptions.push(subscription);
    if (subscription.hostEvent !== undefined) this.registerHostEvent(subscription.hostEvent);
  }

  private async buildCurrent(requestedGeneration: number): Promise<void> {
    const file = this.source.currentMarkdown();
    if (file === null) {
      if (this.isCurrent(requestedGeneration)) this.view.showEmpty();
      return;
    }
    this.view.showLoading(file.path);

    try {
      const snapshot = await this.snapshots.snapshot(file);
      const requestedThemeId = this.themeOverrides.get(file.path) ?? snapshot.selectedThemeId;
      const requestedTheme = this.themes.get(requestedThemeId);
      const theme = requestedTheme
        ?? this.themes.get(this.currentFallbackThemeId())
        ?? this.themes.list()[0];
      if (theme === undefined) throw new Error('No valid article theme is available.');
      const artifact = await this.builder.build(snapshot, theme);
      if (!this.isCurrent(requestedGeneration)) return;

      this.artifact = artifact;
      this.view.showArtifact(Object.freeze({
        snapshot,
        artifact,
        preflight: this.preflight.run(artifact, {
          purpose: 'copy',
          themeValid: requestedTheme !== undefined,
        }),
        themes: this.themes.list(),
        selectedThemeId: theme.manifest.id,
      }));
    } catch (error) {
      if (!this.isCurrent(requestedGeneration)) return;
      this.artifact = null;
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
