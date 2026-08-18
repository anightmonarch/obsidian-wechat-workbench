import { createHash } from 'node:crypto';
import { posix } from 'node:path';

const ROOT = '.wechat-workbench/covers';

export interface CoverStoragePort {
  ensureDirectory(path: string): Promise<void>;
  writeBinary(path: string, bytes: Uint8Array): Promise<void>;
}

function safeSlug(notePath: string): string {
  const extension = posix.extname(notePath);
  const basename = posix.basename(notePath, extension)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 48);
  return basename.length > 0 ? basename : 'article';
}

function pathHash(notePath: string): string {
  return createHash('sha256').update(notePath).digest('hex').slice(0, 8);
}

export class CoverStorage {
  constructor(private readonly vault: CoverStoragePort) {}

  pathFor(notePath: string): string {
    const directory = `${ROOT}/${safeSlug(notePath)}-${pathHash(notePath)}`;
    return `${directory}/cover.png`;
  }

  async save(notePath: string, bytes: Uint8Array): Promise<string> {
    if (bytes.byteLength === 0) throw new Error('Generated cover output is empty.');
    const path = this.pathFor(notePath);
    const directory = posix.dirname(path);
    if (!path.startsWith(`${ROOT}/`) || directory === '.' || path.includes('..')) {
      throw new Error('Generated cover path is outside the plugin-owned directory.');
    }
    await this.vault.ensureDirectory(directory);
    await this.vault.writeBinary(path, Uint8Array.from(bytes));
    return path;
  }
}
