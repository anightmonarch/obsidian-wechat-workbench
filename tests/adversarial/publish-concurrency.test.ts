import { describe, expect, it, vi } from 'vitest';

import type { RenderArtifact } from '../../src/domain/artifact';
import type { PublishCoordinatorPorts } from '../../src/publish/publish-coordinator';
import { PublishCoordinator } from '../../src/publish/publish-coordinator';
import type { PublishCommand } from '../../src/publish/publish-types';

const artifact: Readonly<RenderArtifact> = Object.freeze({
  artifactVersion: '1', rendererVersion: '0.1.0',
  source: Object.freeze({ vaultPath: 'article.md', modifiedAt: 1, sourceHash: 'SOURCE_HASH' }),
  theme: Object.freeze({ id: 'native', version: '1.0.0', contentHash: 'THEME_HASH' }),
  metadata: Object.freeze({ title: 'Article', author: '', digest: '', cover: 'cover.png', contentSourceUrl: '' }),
  canonicalHtml: '<section class="wechat-article"><p>Body</p></section>', plainText: 'Body',
  assets: Object.freeze([]), diagnostics: Object.freeze([]), contentHash: 'CONTENT_HASH',
});

function command(accountHash: string): PublishCommand {
  return {
    file: { path: 'article.md', basename: 'article', modifiedAt: 1 },
    artifact,
    accountHash,
    cover: {
      bytes: Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      mimeType: 'image/png', filename: 'cover.png',
    },
    coverPath: 'cover.png',
    coverHash: 'COVER_HASH',
    payloadHash: 'PAYLOAD_HASH',
  };
}

function ports(
  uploadCover: PublishCoordinatorPorts['assets']['uploadCover'] = vi.fn(async () => ({ mediaId: 'COVER_MEDIA_ID' })),
) {
  const addDraft = vi.fn(async () => ({ mediaId: 'DRAFT_MEDIA_ID', operation: 'CREATE' as const }));
  const value: PublishCoordinatorPorts = {
    preflight: { run: () => ({ ok: true, blocking: [], warnings: [], info: [] }) },
    tokens: { getValidToken: vi.fn(async () => 'SYNTHETIC_TOKEN') },
    assets: {
      resolveBodyAssets: vi.fn(async () => ({ html: artifact.canonicalHtml, uploadedAssetIds: [] })),
      uploadCover,
    },
    drafts: {
      addDraft,
      updateDraft: vi.fn(async (mediaId: string) => ({ mediaId, operation: 'UPDATE' as const })),
      getDraft: vi.fn(async () => null),
    },
    state: { read: vi.fn(async () => null), commit: vi.fn(async () => undefined) },
    receipts: { record: vi.fn(async () => undefined), resolve: vi.fn(async () => undefined) },
    currentSourceHash: vi.fn(async () => 'SOURCE_HASH'),
    currentCover: vi.fn(async () => ({ path: 'cover.png', hash: 'COVER_HASH' })),
    currentPayloadHash: vi.fn(async () => 'PAYLOAD_HASH'),
  };
  return { value, addDraft };
}

describe('adversarial publish concurrency', () => {
  it('does not collapse the same note across different accounts', async () => {
    const current = ports();
    const coordinator = new PublishCoordinator(current.value, () => 1, () => crypto.randomUUID());

    await Promise.all([coordinator.publish(command('ACCOUNT_A')), coordinator.publish(command('ACCOUNT_B'))]);

    expect(current.addDraft).toHaveBeenCalledTimes(2);
  });

  it('freezes cover bytes before the first asynchronous boundary', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const uploadCover = vi.fn(async (image: PublishCommand['cover']) => {
      await gate;
      return { mediaId: `BYTE_${String(image.bytes[0])}` };
    });
    const current = ports(uploadCover);
    const coordinator = new PublishCoordinator(current.value, () => 1, () => 'TASK');
    const input = command('ACCOUNT_A');

    const pending = coordinator.publish(input);
    input.cover.bytes[0] = 0;
    release();
    await pending;

    expect(uploadCover.mock.calls[0]?.[0].bytes[0]).toBe(0x89);
  });

  it('rejects a different frozen version while the same note is in flight', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const uploadCover = vi.fn(async () => {
      await gate;
      return { mediaId: 'COVER_MEDIA_ID' };
    });
    const current = ports(uploadCover);
    const coordinator = new PublishCoordinator(current.value, () => 1, () => crypto.randomUUID());
    const first = command('ACCOUNT_A');
    const second = { ...command('ACCOUNT_A'), payloadHash: 'DIFFERENT_PAYLOAD_HASH' };

    const pending = coordinator.publish(first);
    const conflict = await coordinator.publish(second);
    release();
    await pending;

    expect(conflict).toMatchObject({
      state: 'FAILED', error: { code: 'PUBLISH_CONFLICT_IN_PROGRESS', remoteEffect: 'NONE' },
    });
    expect(uploadCover).toHaveBeenCalledOnce();
  });
});
