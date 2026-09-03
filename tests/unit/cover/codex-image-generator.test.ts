import { describe, expect, it, vi } from 'vitest';

import type { CodexExecPort } from '../../../src/codex/codex-exec-client';
import {
  CodexImageGenerator,
} from '../../../src/cover/codex-image-generator';
import type { CodexGeneratedImageStorePort } from '../../../src/cover/codex-generated-image-store';

const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('CodexImageGenerator', () => {
  it('invokes imagegen without Shell and reads the exact thread output', async () => {
    const exec = vi.fn(async (_request: Parameters<CodexExecPort['exec']>[0]) => ({
      threadId: 'thread-12345678', finalMessage: 'done', completed: true,
    }));
    const read = vi.fn(async (_threadId: string) => ({ bytes: png, mimeType: 'image/png' as const }));
    const generator = new CodexImageGenerator(
      { exec },
      { read } satisfies CodexGeneratedImageStorePort,
      () => '/opt/homebrew/bin/codex',
    );

    const result = await generator.generate({
      title: '文章标题',
      digest: '文章摘要',
      supplementalPrompt: '暖白背景',
      presetId: 'editorial-tech',
      includeTitle: true,
      includeDigest: false,
    });

    expect(exec.mock.calls[0]?.[0]).toMatchObject({
      configuredExecutablePath: '/opt/homebrew/bin/codex',
      sandbox: 'workspace-write',
      imageGeneration: true,
      timeoutMs: 300_000,
    });
    expect(exec.mock.calls[0]?.[0].prompt).toMatch(/^\$imagegen/u);
    expect(exec.mock.calls[0]?.[0].prompt).toContain('文章标题');
    expect(exec.mock.calls[0]?.[0].prompt).not.toContain('文章摘要');
    expect(read).toHaveBeenCalledWith('thread-12345678');
    expect(result).toMatchObject({ bytes: png, mimeType: 'image/png', source: 'local-codex' });
    expect(result.contentHash).toMatch(/^[a-f0-9]{64}$/u);
  });
});
