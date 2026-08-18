import { type App, type EventRef, normalizePath, TFile } from 'obsidian';
import { posix } from 'node:path';

import type { BinaryFilePort, VaultFileRef, VaultPort } from '../domain/ports';
import type { MetadataPort } from '../render/note-snapshot-service';
import type { FrontmatterMutationPort } from '../publish/publish-state-store';
import type { CoverStoragePort } from '../cover/cover-storage';
import type { ThemeSourcePort } from '../themes/theme-registry';
import type { WorkbenchEventHandle, WorkbenchSourcePort } from '../ui/workbench-controller';

function markdownRef(file: TFile | null): VaultFileRef | null {
  if (file === null || file.extension.toLowerCase() !== 'md') return null;
  return { path: file.path, basename: file.basename, modifiedAt: file.stat.mtime };
}

function eventHandle(ref: EventRef, dispose: () => void): WorkbenchEventHandle {
  return { hostEvent: ref, dispose };
}

export class ObsidianWorkbenchSource implements WorkbenchSourcePort {
  constructor(private readonly app: App) {}

  currentMarkdown(): VaultFileRef | null {
    return markdownRef(this.app.workspace.getActiveFile());
  }

  onActiveMarkdownChanged(listener: () => void): WorkbenchEventHandle {
    const ref = this.app.workspace.on('file-open', listener);
    return eventHandle(ref, () => this.app.workspace.offref(ref));
  }

  onVaultFileModified(listener: (path: string) => void): WorkbenchEventHandle {
    const ref = this.app.vault.on('modify', file => {
      if (file instanceof TFile) listener(file.path);
    });
    return eventHandle(ref, () => this.app.vault.offref(ref));
  }
}

export class ObsidianVaultPorts implements VaultPort, BinaryFilePort, MetadataPort, ThemeSourcePort, FrontmatterMutationPort, CoverStoragePort {
  constructor(private readonly app: App) {}

  async readText(path: string): Promise<string> {
    return this.app.vault.adapter.read(path);
  }

  async readBinary(path: string): Promise<Uint8Array> {
    return new Uint8Array(await this.app.vault.adapter.readBinary(path));
  }

  async ensureDirectory(path: string): Promise<void> {
    const segments = normalizePath(path).split('/').filter(Boolean);
    let current = '';
    for (const segment of segments) {
      current = current.length === 0 ? segment : `${current}/${segment}`;
      if (await this.app.vault.adapter.exists(current)) continue;
      try {
        await this.app.vault.adapter.mkdir(current);
      } catch (error) {
        if (!await this.app.vault.adapter.exists(current)) throw error;
      }
    }
  }

  async writeBinary(path: string, bytes: Uint8Array): Promise<void> {
    await this.app.vault.adapter.writeBinary(normalizePath(path), Uint8Array.from(bytes).buffer);
  }

  async resolveLink(source: string, fromPath: string): Promise<string | null> {
    return this.app.metadataCache.getFirstLinkpathDest(source, fromPath)?.path ?? null;
  }

  getFrontmatter(path: string): Readonly<Record<string, unknown>> {
    return this.app.metadataCache.getCache(path)?.frontmatter ?? {};
  }

  async listDirectories(root: string): Promise<string[]> {
    try {
      const listed = await this.app.vault.adapter.list(root);
      return listed.folders.map(path => posix.basename(path)).sort();
    } catch {
      return [];
    }
  }

  async exists(path: string): Promise<boolean> {
    return this.app.vault.adapter.exists(path);
  }

  async processFrontmatter(
    file: VaultFileRef,
    mutate: (frontmatter: Record<string, unknown>) => void,
  ): Promise<void> {
    const target = this.app.vault.getAbstractFileByPath(file.path);
    if (!(target instanceof TFile)) throw new Error(`Markdown file not found: ${file.path}`);
    await this.app.fileManager.processFrontMatter(target, mutate);
  }
}
