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

function mentionsBrandOrLogo(value: string): boolean {
  return /logo|徽标|商标|品牌|徽章|标志|标誌/iu.test(value);
}

function prompt(request: Readonly<LocalCoverGenerationRequest>): string {
  const preset = coverPromptPreset(request.presetId ?? '');
  const title = request.title.trim();
  const digest = request.digest.trim();
  const supplemental = request.supplementalPrompt.trim();
  const allowBrandMarks = mentionsBrandOrLogo(supplemental);
  const textInstruction = request.includeTitle || request.includeDigest
    ? '只绘制下方明确提供的中文文字，保持清晰可读；不要添加其他文字。'
    : allowBrandMarks
      ? '不要绘制标题、摘要或水印文字；允许按补充要求加入官方 logo 或品牌标识，除此之外不要出现其他文字、字母或数字。'
      : '画面中不要出现任何文字、字母、数字或水印。';
  const lines = [
    '$imagegen',
    preset.prompt,
    '最终画面必须为约 2.35:1 的微信公众号横版封面，主体略偏右，安全留白，禁止水印。',
    textInstruction,
  ];
  if (request.includeTitle && title.length > 0) {
    lines.push(`需要绘制的标题：${title}`);
  } else if (title.length > 0) {
    lines.push(`文章主题参考（不要把这段文字画进封面）：${title}`);
  }
  if (request.includeDigest && digest.length > 0) {
    lines.push(`需要绘制的摘要：${digest}`);
  } else if (digest.length > 0) {
    lines.push(`文章摘要参考（不要把这段文字画进封面）：${digest}`);
  }
  if (supplemental.length > 0) {
    lines.push([
      '【最高优先级：用户补充的视觉要求】',
      '以下要求优先于封面主题与文字规则；必须遵守。',
      supplemental,
    ].join('\n'));
  }
  lines.push('必须调用图像生成产出一张封面图；生成完成后只回复 done，不要提问或索要更多信息。');
  return lines.join('\n');
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
