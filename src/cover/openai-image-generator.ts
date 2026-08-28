import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';

import { IMAGE_PROVIDER_TIMEOUT_MS } from '../ai/provider-timeout-policy';
import { detectImageMime } from '../media/image-format';
import type { ValidatedImage } from '../security/remote-image-fetcher';
import { redactSensitiveText } from '../wechat/errors';
import type { HttpRequest, HttpResponse, HttpTransport } from '../wechat/http-transport';
import {
  CoverGenerationError,
  type AiCoverGenerationRequest,
  type CoverGenerator,
  type GeneratedCover,
} from './cover-generator';
export { CoverGenerationError } from './cover-generator';
import { coverPromptPreset } from './cover-prompt-presets';

export type { AiCoverGenerationRequest } from './cover-generator';

const MAX_BASE64_LENGTH = 28 * 1024 * 1024;

export interface RemoteGeneratedImagePort {
  fetch(url: string): Promise<Readonly<ValidatedImage>>;
}

function failure(code: string, message: string): CoverGenerationError {
  return new CoverGenerationError(code, message);
}

function providerUrl(rawEndpoint: string): string {
  let url: URL;
  try { url = new URL(rawEndpoint.trim()); } catch { throw failure('IMAGE_PROVIDER_URL_INVALID', 'Image provider URL is invalid.'); }
  if (url.protocol !== 'https:') {
    throw failure('IMAGE_PROVIDER_URL_INVALID', 'Image provider must use HTTPS.');
  }
  if (url.username.length > 0 || url.password.length > 0) {
    throw failure('IMAGE_PROVIDER_URL_INVALID', 'Image provider URL must not contain credentials.');
  }
  if (url.search.length > 0 || url.hash.length > 0) {
    throw failure('IMAGE_PROVIDER_URL_INVALID', 'Image provider URL must not contain query parameters or fragments.');
  }
  return rawEndpoint.trim();
}

function cleanText(value: string, limit: number): string {
  const sanitized = [...value].map(character => {
    const code = character.codePointAt(0) ?? 0;
    return code <= 8 || code === 11 || code === 12 || code >= 14 && code <= 31 || code === 127
      ? ' '
      : character;
  }).join('').trim();
  return [...sanitized]
    .slice(0, limit)
    .join('');
}

function prompt(request: Readonly<AiCoverGenerationRequest>): string {
  const title = cleanText(request.title, 200);
  const digest = cleanText(request.digest, 500);
  const supplementalPrompt = cleanText(request.supplementalPrompt, 500);
  const hasRequestedCopy = title.length > 0 || digest.length > 0;
  const sections = [coverPromptPreset(request.presetId ?? '').prompt];
  sections.push(hasRequestedCopy
    ? '【封面文字规则】仅可出现下方明确指定的标题或摘要。请在留白区域为其预留高对比度、完整可读的中文排版空间；不要生成任何额外文字、字母、数字、二维码、商标、水印、账号标识或信息标签。'
    : '【封面文字规则】严禁出现任何可见文字、字母、汉字、数字、二维码、商标标识、水印、账号标识或信息标签。');
  if (title.length > 0 || digest.length > 0) {
    sections.push([
      '以下内容必须直接绘制在封面中。必须使用清晰、完整、可读的中文排版准确呈现；不要改写、截断、遗漏或生成乱码。除下方指定内容外，不要生成任何文字或伪文字。',
      ...(title.length > 0 ? [`封面标题：${title}`] : []),
      ...(digest.length > 0 ? [`封面摘要：${digest}`] : []),
    ].join('\n'));
  }
  if (supplementalPrompt.length > 0) {
    sections.push(`【最高优先级：用户补充的视觉要求】\n以下要求优先于封面主题；但不得改变用户勾选的标题/摘要是否展示。\n${supplementalPrompt}`);
  }
  return sections.join('\n\n');
}

function object(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function redactedMessage(error: unknown, apiKey: string): string {
  const raw = error instanceof Error ? error.message : 'Unknown image provider failure.';
  const withoutKey = apiKey.length > 0 ? raw.split(apiKey).join('[REDACTED_SECRET]') : raw;
  return redactSensitiveText(withoutKey);
}

function transportFailure(error: unknown, apiKey: string): CoverGenerationError {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code)
    : '';
  const message = redactedMessage(error, apiKey);
  const fingerprint = `${code} ${message}`.toUpperCase();
  if (code === 'HTTP_REQUEST_TIMEOUT' || /TIMED OUT|TIMEOUT/u.test(fingerprint)) {
    return failure('IMAGE_PROVIDER_TIMEOUT', 'Image provider request timed out.');
  }
  if (code === 'HTTP_RESPONSE_TOO_LARGE') {
    return failure('IMAGE_PROVIDER_RESPONSE_TOO_LARGE', 'Image provider response is too large.');
  }
  if (code === 'ABORT_ERR') {
    return failure('IMAGE_GENERATION_CANCELLED', 'Image generation was cancelled.');
  }
  if (/CONNECTION_RESET|ECONNRESET|SOCKET HANG UP|CONNECTION ABORTED/u.test(fingerprint)) {
    return failure('IMAGE_PROVIDER_CONNECTION_RESET', message);
  }
  return failure('IMAGE_PROVIDER_REQUEST_FAILED', message);
}

export class OpenAiImageGenerator implements CoverGenerator {
  constructor(
    private readonly http: HttpTransport,
    private readonly images: RemoteGeneratedImagePort,
    private readonly timeoutMs = IMAGE_PROVIDER_TIMEOUT_MS,
  ) {}

  async generate(request: Readonly<AiCoverGenerationRequest>): Promise<Readonly<GeneratedCover>> {
    if (request.signal?.aborted === true) throw failure('IMAGE_GENERATION_CANCELLED', 'Image generation was cancelled.');
    if (request.model.trim().length === 0) throw failure('IMAGE_PROVIDER_MODEL_MISSING', 'Image provider model is not configured.');
    if (request.apiKey.length === 0) throw failure('IMAGE_PROVIDER_KEY_MISSING', 'Image provider API key is not configured.');
    const url = providerUrl(request.endpoint);
    let response: Readonly<HttpResponse<unknown>>;
    try {
      response = await this.requestWithBoundary({
        method: 'POST',
        url,
        headers: {
          Authorization: `Bearer ${request.apiKey}`,
          'Content-Type': 'application/json',
        },
        json: (request.requestFormat ?? 'agnes-images') === 'agnes-images'
          ? {
            model: request.model.trim(),
            prompt: prompt(request),
            size: '2K',
            ratio: '21:9',
            extra_body: { response_format: 'url' },
          }
          : {
            model: request.model.trim(),
            prompt: prompt(request),
          },
      }, request.signal);
    } catch (error) {
      if (error instanceof CoverGenerationError) throw error;
      throw transportFailure(error, request.apiKey);
    }
    if (response.status === 401 || response.status === 403) {
      throw failure('IMAGE_PROVIDER_AUTH_REJECTED', `Image provider returned HTTP ${response.status}.`);
    }
    if (response.status === 429) {
      throw failure('IMAGE_PROVIDER_RATE_LIMITED', 'Image provider rate limit reached.');
    }
    if (response.status < 200 || response.status >= 300) {
      throw failure('IMAGE_PROVIDER_REJECTED', `Image provider returned HTTP ${response.status}.`);
    }
    return this.parseResult(response.body, request.apiKey);
  }

  private requestWithBoundary(
    request: Readonly<HttpRequest>,
    signal: AbortSignal | undefined,
  ): Promise<Readonly<HttpResponse<unknown>>> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (callback: () => void): void => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        callback();
      };
      const onAbort = (): void => finish(() => reject(failure(
        'IMAGE_GENERATION_CANCELLED', 'Image generation was cancelled.',
      )));
      const timer = window.setTimeout(() => finish(() => reject(failure(
        'IMAGE_PROVIDER_TIMEOUT', 'Image provider request timed out.',
      ))), this.timeoutMs);
      signal?.addEventListener('abort', onAbort, { once: true });
      void this.http.request(request).then(
        response => finish(() => resolve(response)),
        error => finish(() => reject(error instanceof Error ? error : new Error(String(error)))),
      );
    });
  }

  private async parseResult(body: unknown, apiKey: string): Promise<Readonly<GeneratedCover>> {
    try {
      const data = object(body).data;
      const first = Array.isArray(data) ? object(data[0]) : {};
      if (typeof first.b64_json === 'string') return this.fromBase64(first.b64_json);
      if (typeof first.url === 'string') {
        const image = await this.images.fetch(first.url);
        return Object.freeze({
          bytes: Uint8Array.from(image.bytes),
          mimeType: image.mimeType,
          contentHash: image.contentHash,
          source: 'remote-url' as const,
        });
      }
      throw failure('IMAGE_PROVIDER_OUTPUT_INVALID', 'Image provider response contains no image.');
    } catch (error) {
      if (error instanceof CoverGenerationError) throw error;
      if (typeof error === 'object' && error !== null && 'code' in error
        && String((error as { code?: unknown }).code).startsWith('REMOTE_')) {
        throw error;
      }
      throw failure('REMOTE_IMAGE_REQUEST_FAILED', 'Generated image download failed.');
    }
  }

  private fromBase64(value: string): Readonly<GeneratedCover> {
    if (value.length === 0 || value.length > MAX_BASE64_LENGTH) {
      throw failure('IMAGE_PROVIDER_OUTPUT_INVALID', 'Image provider base64 output is empty or too large.');
    }
    const bytes = new Uint8Array(Buffer.from(value, 'base64'));
    const mimeType = detectImageMime(bytes);
    if (mimeType === null) throw failure('IMAGE_PROVIDER_OUTPUT_INVALID', 'Image provider output is not a supported image.');
    return Object.freeze({
      bytes,
      mimeType,
      contentHash: createHash('sha256').update(bytes).digest('hex'),
      source: 'base64' as const,
    });
  }
}
