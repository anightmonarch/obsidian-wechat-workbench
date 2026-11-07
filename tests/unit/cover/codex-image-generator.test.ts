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
    expect(exec.mock.calls[0]?.[0].prompt).toContain('需要绘制的标题：文章标题');
    expect(exec.mock.calls[0]?.[0].prompt).toContain('文章摘要参考（不要把这段文字画进封面）：文章摘要');
    expect(exec.mock.calls[0]?.[0].prompt).not.toContain('需要绘制的摘要：文章摘要');
    expect(read).toHaveBeenCalledWith('thread-12345678');
    expect(result).toMatchObject({ bytes: png, mimeType: 'image/png', source: 'local-codex' });
    expect(result.contentHash).toMatch(/^[a-f0-9]{64}$/u);
  });

  it('allows official logos when supplemental asks and keeps unchecked title as context', async () => {
    const exec = vi.fn(async (_request: Parameters<CodexExecPort['exec']>[0]) => ({
      threadId: 'thread-logo-123456', finalMessage: 'done', completed: true,
    }));
    const read = vi.fn(async (_threadId: string) => ({ bytes: png, mimeType: 'image/png' as const }));
    const generator = new CodexImageGenerator(
      { exec },
      { read } satisfies CodexGeneratedImageStorePort,
      () => '/Users/wangboshi/.n/bin/codex',
    );

    await generator.generate({
      title: 'Cursor 与 Codex 联调',
      digest: '记录本机图像生成链路',
      supplementalPrompt: '把文中设计到的内容各自的官方logo都加入到封面图中',
      presetId: 'editorial-tech',
      includeTitle: false,
      includeDigest: false,
    });

    const prompt = exec.mock.calls[0]?.[0].prompt ?? '';
    expect(prompt).toContain('文章主题参考（不要把这段文字画进封面）：Cursor 与 Codex 联调');
    expect(prompt).toContain('文章摘要参考（不要把这段文字画进封面）：记录本机图像生成链路');
    expect(prompt).toContain('【最高优先级：用户补充的视觉要求】');
    expect(prompt).toContain('官方 logo 或品牌标识');
    expect(prompt).not.toContain('品牌标识或水印');
    expect(prompt).toContain('必须调用图像生成产出一张封面图');
  });

  it('keeps a strict no-text rule when supplemental does not ask for logos', async () => {
    const exec = vi.fn(async (_request: Parameters<CodexExecPort['exec']>[0]) => ({
      threadId: 'thread-plain-123456', finalMessage: 'done', completed: true,
    }));
    const generator = new CodexImageGenerator(
      { exec },
      { read: async () => ({ bytes: png, mimeType: 'image/png' as const }) },
      () => '/opt/homebrew/bin/codex',
    );

    await generator.generate({
      title: '纯视觉封面',
      digest: '',
      supplementalPrompt: '暖白背景，低信息密度',
      includeTitle: false,
      includeDigest: false,
    });

    const prompt = exec.mock.calls[0]?.[0].prompt ?? '';
    expect(prompt).toContain('画面中不要出现任何文字、字母、数字或水印。');
    expect(prompt).not.toContain('官方 logo 或品牌标识');
  });

});
