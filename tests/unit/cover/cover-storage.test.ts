import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

import { CoverStorage } from '../../../src/cover/cover-storage';

const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47]);

describe('CoverStorage', () => {
  it('stores generated covers under a plugin-owned deterministic directory', async () => {
    const ensureDirectory = vi.fn(async () => undefined);
    const writeBinary = vi.fn(async () => undefined);
    const storage = new CoverStorage({ ensureDirectory, writeBinary });

    const path = await storage.save('01-公众号/My Article.md', png);

    const hash = createHash('sha256').update('01-公众号/My Article.md').digest('hex').slice(0, 8);
    expect(path).toBe(`.wechat-workbench/covers/my-article-${hash}/cover.png`);
    expect(path).not.toContain('..');
    expect(ensureDirectory).toHaveBeenCalledWith(`.wechat-workbench/covers/my-article-${hash}`);
    expect(writeBinary).toHaveBeenCalledWith(path, png);
  });

  it('falls back to a safe slug for non-ASCII names and rejects empty output', async () => {
    const storage = new CoverStorage({
      ensureDirectory: vi.fn(async () => undefined),
      writeBinary: vi.fn(async () => undefined),
    });

    await expect(storage.save('../公众号/文章.md', new Uint8Array())).rejects.toThrow(/empty/i);
    expect(storage.pathFor('../公众号/文章.md')).toMatch(/^\.wechat-workbench\/covers\/article-[a-f0-9]{8}\/cover\.png$/u);
  });
});
