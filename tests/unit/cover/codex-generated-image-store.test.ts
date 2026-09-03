import { describe, expect, it, vi } from 'vitest';

import {
  CodexGeneratedImageStore,
  type CodexImageFileSystemPort,
} from '../../../src/cover/codex-generated-image-store';

const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function fsFixture(overrides: Partial<CodexImageFileSystemPort> = {}): CodexImageFileSystemPort {
  return {
    readdir: vi.fn(async () => ['older.png', 'latest.png']),
    lstat: vi.fn(async (path: string) => ({
      isFile: true,
      isSymbolicLink: false,
      size: png.byteLength,
      mtimeMs: path.endsWith('latest.png') ? 2 : 1,
    })),
    readFile: vi.fn(async () => png),
    ...overrides,
  };
}

describe('CodexGeneratedImageStore', () => {
  it('reads the newest valid image only from the exact thread directory', async () => {
    const readdir = vi.fn(async () => ['older.png', 'latest.png']);
    const readFile = vi.fn(async (_path: string) => png);
    const fs = fsFixture({ readdir, readFile });
    const store = new CodexGeneratedImageStore(() => '/home/user/.codex', fs);

    await expect(store.read('01a0682b-f329-72d0-baae-5be15d7c31e1')).resolves.toEqual({
      bytes: png,
      mimeType: 'image/png',
    });
    expect(readdir).toHaveBeenCalledWith(
      '/home/user/.codex/generated_images/01a0682b-f329-72d0-baae-5be15d7c31e1',
    );
    expect(readFile).toHaveBeenCalledWith(
      '/home/user/.codex/generated_images/01a0682b-f329-72d0-baae-5be15d7c31e1/latest.png',
    );
  });

  it.each(['../escape', '/absolute', 'thread/child', '', '短'])('rejects unsafe thread id %s', async threadId => {
    const readdir = vi.fn(async () => ['older.png']);
    const fs = fsFixture({ readdir });
    await expect(new CodexGeneratedImageStore(() => '/home/user/.codex', fs).read(threadId))
      .rejects.toMatchObject({ code: 'CODEX_IMAGE_NOT_FOUND' });
    expect(readdir).not.toHaveBeenCalled();
  });

  it('rejects symlinks, oversized files and forged image bytes', async () => {
    const fs = fsFixture({
      readdir: vi.fn(async () => ['link.png', 'large.png', 'forged.png']),
      lstat: vi.fn(async (path: string) => ({
        isFile: true,
        isSymbolicLink: path.endsWith('link.png'),
        size: path.endsWith('large.png') ? 21 * 1024 * 1024 : 16,
        mtimeMs: 1,
      })),
      readFile: vi.fn(async () => Uint8Array.from([1, 2, 3])),
    });

    await expect(new CodexGeneratedImageStore(() => '/home/user/.codex', fs).read('thread-12345678'))
      .rejects.toMatchObject({ code: 'CODEX_IMAGE_NOT_FOUND' });
  });
});
