import { lstat, readFile, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';

import { CodexRuntimeError } from '../codex/codex-errors';
import { detectImageMime, type SupportedImageMime } from '../media/image-format';

const MAX_GENERATED_IMAGE_BYTES = 20 * 1024 * 1024;
const THREAD_ID = /^[a-zA-Z0-9-]{8,80}$/u;

export interface CodexImageFileStat {
  isFile: boolean;
  isSymbolicLink: boolean;
  size: number;
  mtimeMs: number;
}

export interface CodexImageFileSystemPort {
  readdir(path: string): Promise<readonly string[]>;
  lstat(path: string): Promise<Readonly<CodexImageFileStat>>;
  readFile(path: string): Promise<Uint8Array>;
}

export interface CodexGeneratedImageStorePort {
  read(threadId: string): Promise<Readonly<{
    bytes: Uint8Array;
    mimeType: SupportedImageMime;
  }>>;
}

const nodeFileSystem: CodexImageFileSystemPort = Object.freeze({
  readdir: (path: string) => readdir(path),
  lstat: async (path: string) => {
    const value = await lstat(path);
    return Object.freeze({
      isFile: value.isFile(),
      isSymbolicLink: value.isSymbolicLink(),
      size: value.size,
      mtimeMs: value.mtimeMs,
    });
  },
  readFile: async (path: string) => new Uint8Array(await readFile(path)),
});

type CodexHomeSource = () => string;

function defaultCodexHome(): string {
  const configured = process.env.CODEX_HOME?.trim();
  return configured !== undefined && configured.length > 0
    ? configured
    : join(homedir(), '.codex');
}

function missingImage(): CodexRuntimeError {
  return new CodexRuntimeError('CODEX_IMAGE_NOT_FOUND');
}

export class CodexGeneratedImageStore implements CodexGeneratedImageStorePort {
  constructor(
    private readonly codexHome: CodexHomeSource = defaultCodexHome,
    private readonly files: CodexImageFileSystemPort = nodeFileSystem,
  ) {}

  async read(threadId: string): Promise<Readonly<{
    bytes: Uint8Array;
    mimeType: SupportedImageMime;
  }>> {
    if (!THREAD_ID.test(threadId)) throw missingImage();
    const directory = join(this.codexHome(), 'generated_images', threadId);
    let names: readonly string[];
    try {
      names = await this.files.readdir(directory);
    } catch {
      throw missingImage();
    }
    const candidates: Array<Readonly<{ path: string; mtimeMs: number }>> = [];
    for (const name of names) {
      if (name.length === 0 || basename(name) !== name || name === '.' || name === '..') continue;
      const path = join(directory, name);
      try {
        const stat = await this.files.lstat(path);
        if (!stat.isFile || stat.isSymbolicLink || stat.size <= 0
          || stat.size > MAX_GENERATED_IMAGE_BYTES) continue;
        candidates.push(Object.freeze({ path, mtimeMs: stat.mtimeMs }));
      } catch {
        // Skip files that disappear while the finished thread directory is inspected.
      }
    }
    candidates.sort((left, right) => right.mtimeMs - left.mtimeMs || left.path.localeCompare(right.path));
    for (const candidate of candidates) {
      try {
        const bytes = Uint8Array.from(await this.files.readFile(candidate.path));
        if (bytes.byteLength === 0 || bytes.byteLength > MAX_GENERATED_IMAGE_BYTES) continue;
        const mimeType = detectImageMime(bytes);
        if (mimeType === null || mimeType === 'image/gif') continue;
        return Object.freeze({ bytes, mimeType });
      } catch {
        // Try the next regular file from this exact thread only.
      }
    }
    throw missingImage();
  }
}
