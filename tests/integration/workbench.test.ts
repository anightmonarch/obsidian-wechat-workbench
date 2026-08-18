import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { NoteSnapshot } from '../../src/domain/article';
import type { RenderArtifact } from '../../src/domain/artifact';
import type { VaultFileRef } from '../../src/domain/ports';
import type { ThemeDefinition } from '../../src/domain/theme';
import {
  WorkbenchController,
  type WorkbenchEventHandle,
  type WorkbenchSourcePort,
  type WorkbenchViewPort,
} from '../../src/ui/workbench-controller';

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
  emptyCount = 0;
  errors: string[] = [];

  showEmpty(): void { this.emptyCount += 1; }
  showLoading(): void {}
  showError(message: string): void { this.errors.push(message); }
  showArtifact(state: { artifact: Readonly<RenderArtifact> }): void {
    this.rendered.push(state.artifact.source.vaultPath);
  }
}

function controller(source: FakeSource, view: FakeView, build: (snapshot: Readonly<NoteSnapshot>) => Promise<Readonly<RenderArtifact>>) {
  const registered: unknown[] = [];
  return {
    registered,
    instance: new WorkbenchController(
      source,
      { snapshot: async ref => snapshotFor(ref) },
      { get: id => id === 'native' ? theme : undefined, list: () => [theme] },
      { build },
      { run: () => Object.freeze({ ok: true, blocking: [], warnings: [], info: [] }) },
      view,
      event => registered.push(event),
      'native',
      400,
    ),
  };
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

    harness.instance.stop();
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
});
