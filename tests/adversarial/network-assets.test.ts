import { describe, expect, it, vi } from 'vitest';

import { CoverWorkflow } from '../../src/cover/cover-workflow';
import type { VaultFileRef } from '../../src/domain/ports';
import { NetworkPolicy } from '../../src/security/network-policy';

describe('adversarial network and asset paths', () => {
  it.each([
    'http://127.0.0.1/admin',
    'http://[::1]/admin',
    'http://[::ffff:127.0.0.1]/admin',
    'file:///etc/passwd',
    'https://user:password@example.test/image.png',
  ])('blocks non-public or credential-bearing target %s', async url => {
    await expect(new NetworkPolicy({
      lookupAll: vi.fn(async () => [{ address: '93.184.216.34', family: 4 as const }]),
    }).resolveAndValidate(url)).rejects.toMatchObject({ code: 'REMOTE_URL_BLOCKED' });
  });

  it('blocks a hostname when any DNS answer is private', async () => {
    const policy = new NetworkPolicy({
      lookupAll: vi.fn(async () => [
        { address: '93.184.216.34', family: 4 as const },
        { address: '10.0.0.8', family: 4 as const },
      ]),
    });

    await expect(policy.resolveAndValidate('https://mixed.example.test/image.png'))
      .rejects.toMatchObject({ code: 'REMOTE_URL_BLOCKED' });
  });

  it('rejects Vault traversal before trying to read a cover file', async () => {
    const readBinary = vi.fn(async () => Uint8Array.from([1]));
    const workflow = new CoverWorkflow(
      { resolveLink: vi.fn(async () => null), readBinary },
      { process: vi.fn((bytes: Uint8Array) => bytes) },
      { save: vi.fn(async () => '.wechat-workbench/covers/test/cover.png') },
      { generate: vi.fn() },
      { processFrontmatter: vi.fn() },
      { get: () => ({ globalDefaultCoverPath: '', imageApiBaseUrl: '', imageApiModel: '' }) },
      { get: () => null, has: () => false },
    );
    const file: VaultFileRef = { path: 'articles/post.md', basename: 'post', modifiedAt: 1 };

    await expect(workflow.prepareLocal(file, '../../outside-vault.png'))
      .rejects.toMatchObject({ code: 'COVER_PATH_UNSAFE' });
    expect(readBinary).not.toHaveBeenCalled();
  });
});
