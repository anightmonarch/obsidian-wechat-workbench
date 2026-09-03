import { describe, expect, it, vi } from 'vitest';

import type { AiArticleContext } from '../../../src/ai/article-context';
import { CodexTextGenerator } from '../../../src/ai/codex-text-generator';
import type { CodexExecPort } from '../../../src/codex/codex-exec-client';

const context: Readonly<AiArticleContext> = Object.freeze({
  notePathHash: 'NOTE_HASH',
  sourceHash: 'SOURCE_HASH',
  title: '原始标题',
  digest: '原始摘要',
  headings: Object.freeze(['第一节', '第二节']),
  bodyExcerpt: '文章正文摘录',
});

function generatorWith(finalMessage: string) {
  const exec = vi.fn(async (_request: Parameters<CodexExecPort['exec']>[0]) => Object.freeze({
    threadId: 'thread-1', finalMessage, completed: true,
  }));
  const port: CodexExecPort = { exec };
  return { generator: new CodexTextGenerator(port, () => '/opt/homebrew/bin/codex'), exec };
}

describe('CodexTextGenerator', () => {
  it('generates exactly three validated titles from the final Codex message', async () => {
    const fixture = generatorWith('{"titles":["标题一","标题二","标题三"]}');

    await expect(fixture.generator.generateTitles({ context })).resolves
      .toEqual(['标题一', '标题二', '标题三']);
    expect(fixture.exec.mock.calls[0]?.[0]).toMatchObject({
      configuredExecutablePath: '/opt/homebrew/bin/codex',
      sandbox: 'read-only',
      imageGeneration: false,
      timeoutMs: 120_000,
    });
    expect(fixture.exec.mock.calls[0]?.[0].prompt).toContain('--- BEGIN UNTRUSTED ARTICLE ---');
  });

  it('generates one bounded digest', async () => {
    const fixture = generatorWith('{"digest":"  这是摘要候选。  "}');

    await expect(fixture.generator.generateDigest({ context })).resolves.toBe('这是摘要候选。');
  });

  it('maps duplicate titles to CODEX_OUTPUT_INVALID', async () => {
    const fixture = generatorWith('{"titles":["重复","重复","第三个"]}');

    await expect(fixture.generator.generateTitles({ context }))
      .rejects.toMatchObject({ code: 'CODEX_OUTPUT_INVALID' });
  });
});
