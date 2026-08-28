import { describe, expect, it, vi } from 'vitest';

import { CoverWorkflow } from '../../src/cover/cover-workflow';
import type { VaultFileRef } from '../../src/domain/ports';
import { NetworkPolicy } from '../../src/security/network-policy';
import { DEFAULT_SETTINGS } from '../../src/settings/model';

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
      { get: () => ({ globalDefaultCoverPath: '', aiProviders: DEFAULT_SETTINGS.aiProviders }) },
      { get: () => null, has: () => false },
      { fetch: vi.fn() },
    );
    const file: VaultFileRef = { path: 'articles/post.md', basename: 'post', modifiedAt: 1 };

    const artifact = Object.freeze({
      artifactVersion: '1', rendererVersion: '0.1.0',
      source: Object.freeze({ vaultPath: 'articles/post.md', modifiedAt: 1, sourceHash: 'SOURCE' }),
      metadata: Object.freeze({ title: 'Post', author: '', digest: '', cover: null, contentSourceUrl: '' }),
      theme: Object.freeze({ id: 'native', version: '1.0.0', contentHash: 'THEME' }),
      canonicalHtml: '<section></section>', plainText: '',
      diagnostics: Object.freeze([]),
      contentHash: 'CONTENT',
      assets: Object.freeze([Object.freeze({
        id: 'asset:local', kind: 'local-image' as const, source: '../../outside-vault.png',
        status: 'resolved' as const, contentHash: null, resolvedUrl: null,
      })]),
    });

    await expect(workflow.prepareFirstImage(file, artifact))
      .rejects.toMatchObject({ code: 'COVER_PATH_UNSAFE' });
    expect(readBinary).not.toHaveBeenCalled();
  });
});
