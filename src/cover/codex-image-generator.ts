import { createHash } from 'node:crypto';

import type { CodexExecPort } from '../codex/codex-exec-client';
import type { GeneratedCover } from './cover-generator';
import type { CodexGeneratedImageStorePort } from './codex-generated-image-store';
import { coverPromptPreset } from './cover-prompt-presets';

export interface LocalCoverGenerationRequest {
  title: string;
  digest: string;
  supplementalPrompt: string;
  presetId?: string;
  includeTitle: boolean;
  includeDigest: boolean;
  signal?: AbortSignal;
}

export interface LocalCoverGenerator {
  generate(request: Readonly<LocalCoverGenerationRequest>): Promise<Readonly<GeneratedCover>>;
}

type ExecutablePathSource = () => string;

function prompt(request: Readonly<LocalCoverGenerationRequest>): string {
  const preset = coverPromptPreset(request.presetId ?? '');
  const textInstruction = request.includeTitle || request.includeDigest
    ? '只绘制下方明确提供的中文文字，保持清晰可读；不要添加其他文字。'
    : '画面中不要出现任何文字、字母、数字、品牌标识或水印。';
  return [
    '$imagegen',
    preset.prompt,
    '最终画面必须为约 2.35:1 的微信公众号横版封面，主体略偏右，安全留白，禁止水印。',
    textInstruction,
    ...(request.includeTitle && request.title.trim().length > 0
      ? [`需要绘制的标题：${request.title.trim()}`]
      : []),
    ...(request.includeDigest && request.digest.trim().length > 0
      ? [`需要绘制的摘要：${request.digest.trim()}`]
      : []),
    ...(request.supplementalPrompt.trim().length > 0
      ? [`补充要求：${request.supplementalPrompt.trim()}`]
      : []),
    '生成完成后只回复 done。',
  ].join('\n');
}

export class CodexImageGenerator implements LocalCoverGenerator {
  constructor(
    private readonly codex: CodexExecPort,
    private readonly images: CodexGeneratedImageStorePort,
    private readonly executablePath: ExecutablePathSource,
  ) {}

  async generate(request: Readonly<LocalCoverGenerationRequest>): Promise<Readonly<GeneratedCover>> {
    const result = await this.codex.exec({
      configuredExecutablePath: this.executablePath().trim(),
      sandbox: 'workspace-write',
      prompt: prompt(request),
      timeoutMs: 300_000,
      imageGeneration: true,
      ...(request.signal === undefined ? {} : { signal: request.signal }),
    });
    const image = await this.images.read(result.threadId);
    return Object.freeze({
      bytes: Uint8Array.from(image.bytes),
      mimeType: image.mimeType,
      contentHash: createHash('sha256').update(image.bytes).digest('hex'),
      source: 'local-codex' as const,
    });
  }
}
