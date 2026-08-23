import type { App } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';

import { ObsidianVaultPorts } from '../../../src/obsidian/workbench-adapters';

vi.mock('obsidian', () => ({
  normalizePath: (value: string) => value,
}));

describe('ObsidianVaultPorts', () => {
  it('resolves an existing vault-relative path before asking MetadataCache', async () => {
    const directPath = '.wechat-workbench/covers/article/cover.png';
    const exists = vi.fn(async (path: string) => path === directPath);
    const metadata = { getFirstLinkpathDest: vi.fn(() => null) };
    const app = {
      metadataCache: metadata,
      vault: { adapter: { exists } },
    } as unknown as App;

    const resolved = await new ObsidianVaultPorts(app).resolveLink(directPath, 'article.md');

    expect(resolved).toBe(directPath);
    expect(exists).toHaveBeenCalledWith(directPath);
    expect(metadata.getFirstLinkpathDest).not.toHaveBeenCalled();
  });
});
