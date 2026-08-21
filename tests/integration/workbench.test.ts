import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { NoteSnapshot } from '../../src/domain/article';
import type { RenderArtifact } from '../../src/domain/artifact';
import type { VaultFileRef } from '../../src/domain/ports';
import type { ArticleStyleConfig } from '../../src/domain/style';
import type { ThemeDefinition } from '../../src/domain/theme';
import type { PreflightReport } from '../../src/preflight/preflight-engine';
import {
  WorkbenchController,
  type WorkbenchArticleSettingsPort,
  type WorkbenchClipboardPort,
  type WorkbenchEventHandle,
  type WorkbenchSourcePort,
  type WorkbenchViewPort,
} from '../../src/ui/workbench-controller';
import { DEFAULT_ARTICLE_STYLE, patchArticleStyle } from '../../src/styles/style-config';
import type { ResolvedArticleStyle } from '../../src/styles/style-resolver';

function file(path: string): VaultFileRef {
  return { path, basename: path.replace(/\.md$/u, ''), modifiedAt: 1 };
}

function snapshotFor(ref: VaultFileRef): Readonly<NoteSnapshot> {
  return Object.freeze({
    vaultPath: ref.path, basename: ref.basename, modifiedAt: ref.modifiedAt,
    markdown: `# ${ref.basename}`, frontmatter: Object.freeze({}),
    metadata: Object.freeze({ title: ref.basename, author: '', digest: '', cover: null, contentSourceUrl: '' }),
    selectedThemeId: 'native', sourceHash: `source:${ref.path}`,
  });
}

const theme: Readonly<ThemeDefinition> = Object.freeze({
  manifest: Object.freeze({
    id: 'native', name: '原生简洁', version: '1.0.0', author: 'Test', description: '',
  }),
  css: '.wechat-article { color: black; }',
  contentHash: 'theme', source: 'builtin', previewPath: null,
});

function artifactFor(snapshot: Readonly<NoteSnapshot>): Readonly<RenderArtifact> {
  return Object.freeze({
    artifactVersion: '1', rendererVersion: '0.1.0',
    source: Object.freeze({
      vaultPath: snapshot.vaultPath, modifiedAt: snapshot.modifiedAt, sourceHash: snapshot.sourceHash,
    }),
    theme: Object.freeze({ id: 'native', version: '1.0.0', contentHash: 'theme' }),
    metadata: snapshot.metadata,
    canonicalHtml: `<section class="wechat-article"><p>${snapshot.basename}</p></section>`,
    plainText: snapshot.basename,
    assets: Object.freeze([]), diagnostics: Object.freeze([]), contentHash: `content:${snapshot.vaultPath}`,
  });
}

class FakeSource implements WorkbenchSourcePort {
  active: VaultFileRef | null = null;
  private readonly activeListeners = new Set<() => void>();
  private readonly modifyListeners = new Set<(path: string) => void>();

  currentMarkdown(): VaultFileRef | null { return this.active; }

  onActiveMarkdownChanged(listener: () => void): WorkbenchEventHandle {
    this.activeListeners.add(listener);
    return { hostEvent: { type: 'active' }, dispose: () => this.activeListeners.delete(listener) };
  }

  onVaultFileModified(listener: (path: string) => void): WorkbenchEventHandle {
    this.modifyListeners.add(listener);
    return { hostEvent: { type: 'modify' }, dispose: () => this.modifyListeners.delete(listener) };
  }

  emitActive(path: string | null): void {
    this.active = path === null ? null : file(path);
    for (const listener of this.activeListeners) listener();
  }

  emitModified(path: string): void {
    for (const listener of this.modifyListeners) listener(path);
  }
}

class FakeView implements WorkbenchViewPort {
  rendered: string[] = [];
  styles: string[] = [];
  emptyCount = 0;
  errors: string[] = [];

  showEmpty(): void { this.emptyCount += 1; }
  showLoading(): void {}
  showError(message: string): void { this.errors.push(message); }
  showArtifact(state: { artifact: Readonly<RenderArtifact>; style?: Readonly<ResolvedArticleStyle> }): void {
    this.rendered.push(state.artifact.source.vaultPath);
    if (state.style !== undefined) this.styles.push(state.style.config.primaryColor);
  }
}

function resolvedStyle(config: Readonly<ArticleStyleConfig> = DEFAULT_ARTICLE_STYLE): Readonly<ResolvedArticleStyle> {
  return Object.freeze({
    source: 'global', renderMode: 'compiled', themeId: config.themeId, config, unsupportedVersion: null,
  });
}

function controller(
  source: FakeSource,
  view: FakeView,
  build: (snapshot: Readonly<NoteSnapshot>) => Promise<Readonly<RenderArtifact>>,
  clipboard?: WorkbenchClipboardPort,
  articleSettings?: WorkbenchArticleSettingsPort,
  preflightReport: Readonly<PreflightReport> = Object.freeze({
    ok: true,
    blocking: Object.freeze([]),
    warnings: Object.freeze([]),
    info: Object.freeze([]),
  }),
) {
  const registered: unknown[] = [];
  return {
    registered,
    instance: new WorkbenchController(
      source,
      { snapshot: async ref => snapshotFor(ref) },
      { get: id => id === 'native' ? theme : undefined, list: () => [theme] },
      { build },
      { run: () => preflightReport },
      view,
      event => registered.push(event),
      'native',
      400,
      clipboard,
      undefined,
      undefined,
      articleSettings,
    ),
  };
}

function styledController(
  source: FakeSource,
  view: FakeView,
  build: (snapshot: Readonly<NoteSnapshot>, style: Readonly<ArticleStyleConfig> | null) => Promise<Readonly<RenderArtifact>>,
  styles: {
    resolve(snapshot: Readonly<NoteSnapshot>): Readonly<ResolvedArticleStyle>;
    materialize(resolved: Readonly<ResolvedArticleStyle>): Readonly<ThemeDefinition>;
    saveArticle(file: VaultFileRef, config: Readonly<ArticleStyleConfig>): Promise<void>;
    setGlobalDefault(config: Readonly<ArticleStyleConfig>): Promise<void>;
    reset(themeId: string): Readonly<ArticleStyleConfig>;
  },
) {
  return new WorkbenchController(
    source,
    { snapshot: async ref => snapshotFor(ref) },
    { get: id => id === 'native' ? theme : undefined, list: () => [theme] },
    { build: (snapshot, _theme, style) => build(snapshot, style ?? null) },
    { run: () => Object.freeze({ ok: true, blocking: Object.freeze([]), warnings: Object.freeze([]), info: Object.freeze([]) }) },
    view,
    () => undefined,
    'native',
    400,
    undefined,
    undefined,
    undefined,
    undefined,
    styles,
  );
}

describe('WorkbenchController', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('renders only the newest active Markdown snapshot after the debounce', async () => {
    const source = new FakeSource();
    const view = new FakeView();
    const harness = controller(source, view, async input => artifactFor(input));
    harness.instance.start();

    source.emitActive('a.md');
    source.emitActive('b.md');
    await vi.advanceTimersByTimeAsync(399);
    expect(view.rendered).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);

    expect(view.rendered).toEqual(['b.md']);
    expect(harness.registered).toHaveLength(2);
  });

  it('discards a completed older build after the active file changes', async () => {
    const source = new FakeSource();
    const view = new FakeView();
    let resolveA: ((value: Readonly<RenderArtifact>) => void) | undefined;
    const harness = controller(source, view, input => {
      if (input.vaultPath !== 'a.md') return Promise.resolve(artifactFor(input));
      return new Promise(resolve => { resolveA = resolve; });
    });
    harness.instance.start();

    source.emitActive('a.md');
    await vi.advanceTimersByTimeAsync(400);
    source.emitActive('b.md');
    await vi.advanceTimersByTimeAsync(400);
    expect(view.rendered).toEqual(['b.md']);

    resolveA?.(artifactFor(snapshotFor(file('a.md'))));
    await Promise.resolve();
    expect(view.rendered).toEqual(['b.md']);
  });

  it('rebuilds only when the modified Markdown is active and stops cleanly', async () => {
    const source = new FakeSource();
    const view = new FakeView();
    const harness = controller(source, view, async input => artifactFor(input));
    harness.instance.start();
    source.emitActive('active.md');
    await vi.advanceTimersByTimeAsync(400);

    source.emitModified('other.md');
    await vi.advanceTimersByTimeAsync(400);
    expect(view.rendered).toEqual(['active.md']);

    source.emitModified('active.md');
    await vi.advanceTimersByTimeAsync(400);
    expect(view.rendered).toEqual(['active.md', 'active.md']);

    await harness.instance.stop();
    source.emitActive('ignored.md');
    await vi.advanceTimersByTimeAsync(400);
    expect(view.rendered).toEqual(['active.md', 'active.md']);
  });

  it('rebuilds when a local image used by the active artifact changes', async () => {
    const source = new FakeSource();
    const view = new FakeView();
    const harness = controller(source, view, async input => Object.freeze({
      ...artifactFor(input),
      assets: Object.freeze([Object.freeze({
        id: 'asset:image', kind: 'local-image' as const, source: 'assets/image.png',
        status: 'resolved' as const, contentHash: 'image', resolvedUrl: null,
      })]),
    }));
    harness.instance.start();
    source.emitActive('active.md');
    await vi.advanceTimersByTimeAsync(400);

    source.emitModified('assets/image.png');
    await vi.advanceTimersByTimeAsync(400);

    expect(view.rendered).toEqual(['active.md', 'active.md']);
  });

  it('surfaces current build failures without leaking stale failures', async () => {
    const source = new FakeSource();
    const view = new FakeView();
    const harness = controller(source, view, async input => {
      if (input.vaultPath === 'bad.md') throw new Error('synthetic render failure');
      return artifactFor(input);
    });
    harness.instance.start();
    source.emitActive('bad.md');
    await vi.advanceTimersByTimeAsync(400);

    expect(view.errors).toEqual(['synthetic render failure']);
    expect(harness.instance.currentArtifact()).toBeNull();
  });

  it('copies only the current completed artifact', async () => {
    const source = new FakeSource();
    const view = new FakeView();
    const copyForWeChat = vi.fn(async (_artifact: Readonly<RenderArtifact>) => undefined);
    const copyHtmlSource = vi.fn(async (_artifact: Readonly<RenderArtifact>) => undefined);
    const harness = controller(
      source,
      view,
      async input => artifactFor(input),
      { copyForWeChat, copyHtmlSource },
    );
    harness.instance.start();
    source.emitActive('active.md');
    await vi.advanceTimersByTimeAsync(400);

    await harness.instance.copyForWeChat();
    await harness.instance.copyHtmlSource();

    expect(copyForWeChat).toHaveBeenCalledOnce();
    expect(copyForWeChat.mock.calls[0]?.[0].source.vaultPath).toBe('active.md');
    expect(copyHtmlSource).toHaveBeenCalledOnce();
  });

  it('preserves the first blocking diagnostic code when copy is rejected', async () => {
    const source = new FakeSource();
    const view = new FakeView();
    const copyForWeChat = vi.fn(async () => undefined);
    const harness = controller(
      source,
      view,
      async input => artifactFor(input),
      { copyForWeChat, copyHtmlSource: vi.fn(async () => undefined) },
      undefined,
      Object.freeze({
        ok: false,
        blocking: Object.freeze([Object.freeze({
          code: 'REMOTE_ASSET_INSECURE', severity: 'BLOCKING' as const,
          message: 'Remote image URL must be HTTPS.', source: 'http://example.test/image.png',
        })]),
        warnings: Object.freeze([]),
        info: Object.freeze([]),
      }),
    );
    harness.instance.start();
    source.emitActive('active.md');
    await vi.advanceTimersByTimeAsync(400);

    await expect(harness.instance.copyForWeChat())
      .rejects.toMatchObject({ code: 'REMOTE_ASSET_INSECURE' });
    expect(copyForWeChat).not.toHaveBeenCalled();
  });

  it('writes editable article settings to the bound note and rebuilds it', async () => {
    const source = new FakeSource();
    const view = new FakeView();
    const update = vi.fn(async () => undefined);
    const harness = controller(
      source,
      view,
      async input => artifactFor(input),
      undefined,
      { update },
    );
    harness.instance.start();
    source.emitActive('active.md');
    await vi.advanceTimersByTimeAsync(400);

    await harness.instance.saveArticleSettings(file('active.md'), {
      title: 'Updated title',
      author: 'wbs',
      digest: 'Updated digest',
      contentSourceUrl: 'https://example.com/source',
    });

    expect(update).toHaveBeenCalledWith(file('active.md'), {
      title: 'Updated title',
      author: 'wbs',
      digest: 'Updated digest',
      contentSourceUrl: 'https://example.com/source',
    });
  });

  it('rejects a settings form that belongs to a note that is no longer active', async () => {
    const source = new FakeSource();
    const view = new FakeView();
    const update = vi.fn(async () => undefined);
    const harness = controller(
      source,
      view,
      async input => artifactFor(input),
      undefined,
      { update },
    );
    harness.instance.start();
    source.emitActive('article-a.md');
    await vi.advanceTimersByTimeAsync(400);
    const staleFile = file('article-a.md');
    source.emitActive('article-b.md');
    await vi.advanceTimersByTimeAsync(400);

    await expect(harness.instance.saveArticleSettings(staleFile, {
      title: 'Stale title', author: '', digest: '', contentSourceUrl: '',
    })).rejects.toMatchObject({ code: 'ARTICLE_CONTEXT_CHANGED' });
    expect(update).not.toHaveBeenCalled();
  });

  it('keeps the newest live style build when an older style build resolves later', async () => {
    const source = new FakeSource();
    const view = new FakeView();
    const pending = new Map<string, (artifact: Readonly<RenderArtifact>) => void>();
    let initial = true;
    const styles = {
      resolve: () => resolvedStyle(),
      materialize: (resolved: Readonly<ResolvedArticleStyle>) => theme,
      saveArticle: vi.fn(async () => undefined),
      setGlobalDefault: vi.fn(async () => undefined),
      reset: (themeId: string) => patchArticleStyle(DEFAULT_ARTICLE_STYLE, { themeId }),
    };
    const instance = styledController(source, view, async (input, style) => {
      if (initial) {
        initial = false;
        return artifactFor(input);
      }
      const color = style?.primaryColor ?? 'missing';
      return new Promise(resolve => pending.set(color, resolve));
    }, styles);
    instance.start();
    source.emitActive('article.md');
    await vi.advanceTimersByTimeAsync(400);

    instance.updateStyle({ primaryColor: '#009874' });
    await vi.advanceTimersByTimeAsync(400);
    instance.updateStyle({ primaryColor: '#FA5151' });
    await vi.advanceTimersByTimeAsync(400);

    pending.get('#FA5151')?.(artifactFor(snapshotFor(file('article.md'))));
    await Promise.resolve();
    pending.get('#009874')?.(artifactFor(snapshotFor(file('article.md'))));
    await Promise.resolve();

    expect(view.styles.at(-1)).toBe('#FA5151');
  });

  it('coalesces style saves and keeps the original file target', async () => {
    const source = new FakeSource();
    const view = new FakeView();
    const saveArticle = vi.fn(async (_file: VaultFileRef, _config: Readonly<ArticleStyleConfig>) => undefined);
    const styles = {
      resolve: () => resolvedStyle(),
      materialize: () => theme,
      saveArticle,
      setGlobalDefault: vi.fn(async () => undefined),
      reset: (themeId: string) => patchArticleStyle(DEFAULT_ARTICLE_STYLE, { themeId }),
    };
    const instance = styledController(source, view, async input => artifactFor(input), styles);
    instance.start();
    source.emitActive('article.md');
    await vi.advanceTimersByTimeAsync(400);

    instance.updateStyle({ primaryColor: '#009874' });
    instance.updateStyle({ primaryColor: '#FA5151' });
    await vi.advanceTimersByTimeAsync(400);

    expect(saveArticle).toHaveBeenCalledOnce();
    expect(saveArticle.mock.calls[0]?.[0]).toEqual(file('article.md'));
    expect(saveArticle.mock.calls[0]?.[1].primaryColor).toBe('#FA5151');
  });
});
