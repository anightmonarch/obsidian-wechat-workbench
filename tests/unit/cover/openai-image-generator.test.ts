import { describe, expect, it, vi } from 'vitest';

import {
  CoverGenerationError,
  OpenAiImageGenerator,
  type AiCoverGenerationRequest,
} from '../../../src/cover/openai-image-generator';
import { COVER_PROMPT_PRESETS } from '../../../src/cover/cover-prompt-presets';
import type { HttpRequest, HttpTransport } from '../../../src/wechat/http-transport';

const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const credential = ['SYNTHETIC', 'IMAGE', 'KEY'].join('_');
const request: Readonly<AiCoverGenerationRequest> = Object.freeze({
  protocol: 'openai-compatible',
  endpoint: 'https://images.example.test/openai/v1/images/generations',
  model: 'synthetic-image-model',
  apiKey: credential,
  title: 'Article title',
  digest: 'Article digest',
  supplementalPrompt: 'Warm blue editorial lighting.',
});

function transport(response: unknown, status = 200) {
  const requests: HttpRequest[] = [];
  const http: HttpTransport = {
    request: vi.fn(async (input: Readonly<HttpRequest>) => {
      requests.push(input);
      return { status, headers: Object.freeze({}), body: response };
    }),
  };
  return { http, requests };
}

describe('OpenAiImageGenerator', () => {
  it('sends only disclosed article fields and treats article text as untrusted source material', async () => {
    const imageUrl = 'https://cdn.example.test/generated.png';
    const fetch = vi.fn(async () => Object.freeze({
      sourceUrl: imageUrl,
      finalUrl: imageUrl,
      mimeType: 'image/png' as const,
      bytes: png,
      contentHash: 'IMAGE_HASH',
    }));
    const current = transport({ data: [{ url: imageUrl }] });
    const generator = new OpenAiImageGenerator(current.http, { fetch });

    await expect(generator.generate(request)).resolves.toMatchObject({
      mimeType: 'image/png', source: 'remote-url',
    });

    expect(current.requests).toHaveLength(1);
    expect(current.requests[0]?.url).toBe(request.endpoint);
    expect(current.requests[0]?.headers).toEqual({
      Authorization: `Bearer ${credential}`,
      'Content-Type': 'application/json',
    });
    expect(current.requests[0]?.json).toMatchObject({
      model: 'synthetic-image-model',
      size: '2K',
      ratio: '21:9',
      extra_body: { response_format: 'url' },
    });
    expect(Object.keys(current.requests[0]?.json as object).sort())
      .toEqual(['extra_body', 'model', 'prompt', 'ratio', 'size']);
    expect(typeof (current.requests[0]?.json as { prompt?: unknown } | undefined)?.prompt).toBe('string');
    expect(current.requests[0]?.json).not.toHaveProperty('n');
    expect(current.requests[0]?.json).not.toHaveProperty('return_base64');
    expect(current.requests[0]?.json).not.toHaveProperty('response_format');
    expect(fetch).toHaveBeenCalledWith(imageUrl);
    const body = JSON.stringify(current.requests[0]?.json);
    expect(body).toContain('高级横版视觉封面');
    expect(body).toContain('【封面文字规则】仅可出现下方明确指定的标题或摘要');
    expect(body).toContain('Warm blue editorial lighting.');
    expect(body).not.toContain('BEGIN QUOTED SOURCE MATERIAL');
    expect(body).toContain('【最高优先级：用户补充的视觉要求】');
    expect(body).toContain('封面标题：Article title');
    expect(body).toContain('封面摘要：Article digest');
    expect(body).toContain('以下内容必须直接绘制在封面中');
    expect(body).toContain('请在留白区域为其预留高对比度、完整可读的中文排版空间');
    expect(body.lastIndexOf('【最高优先级：用户补充的视觉要求】'))
      .toBeGreaterThan(body.lastIndexOf('视觉与主体：'));
    expect(body).not.toMatch(/vaultPath|appId|appSecret|wechat-account/iu);
  });

  it('rejects insecure remote providers and malformed image output', async () => {
    const current = transport({ data: [{ b64_json: Buffer.from('not an image').toString('base64') }] });
    const generator = new OpenAiImageGenerator(current.http, { fetch: vi.fn() });

    await expect(generator.generate({ ...request, endpoint: 'http://images.example.test/v1/images/generations' }))
      .rejects.toMatchObject({ code: 'IMAGE_PROVIDER_URL_INVALID' });
    await expect(generator.generate(request))
      .rejects.toMatchObject({ code: 'IMAGE_PROVIDER_OUTPUT_INVALID' });
  });

  it('uses the selected built-in cover subject template', async () => {
    const imageUrl = 'https://cdn.example.test/cinematic.png';
    const current = transport({ data: [{ url: imageUrl }] });
    const generator = new OpenAiImageGenerator(current.http, {
      fetch: vi.fn(async () => Object.freeze({
        sourceUrl: imageUrl,
        finalUrl: imageUrl,
        mimeType: 'image/png' as const,
        bytes: png,
        contentHash: 'CINEMATIC_HASH',
      })),
    });

    await generator.generate({ ...request, presetId: 'cinematic-poster' });

    const prompt = String((current.requests[0]?.json as { prompt?: unknown }).prompt);
    expect(prompt).toContain('限色丝网印刷编辑艺术');
    expect(prompt).not.toContain('中文科技编辑插画风格');
  });

  it('allows an explicitly selected title for every built-in cover subject template', async () => {
    for (const preset of COVER_PROMPT_PRESETS) {
      const imageUrl = `https://cdn.example.test/${preset.id}.png`;
      const current = transport({ data: [{ url: imageUrl }] });
      const generator = new OpenAiImageGenerator(current.http, {
        fetch: vi.fn(async () => Object.freeze({
          sourceUrl: imageUrl,
          finalUrl: imageUrl,
          mimeType: 'image/png' as const,
          bytes: png,
          contentHash: `${preset.id}_HASH`,
        })),
      });

      await generator.generate({
        ...request,
        title: '必须显示的文章标题',
        digest: '',
        presetId: preset.id,
      });

      const generatedPrompt = String((current.requests[0]?.json as { prompt?: unknown }).prompt);
      expect(generatedPrompt).toContain('封面标题：必须显示的文章标题');
      expect(generatedPrompt).toContain('以下内容必须直接绘制在封面中');
      expect(generatedPrompt).not.toMatch(/高级横版无文字视觉封面|绝不出现海报标题|带文字的实物/u);
    }
  });

  it('redacts the API key from provider and transport failures', async () => {
    const http: HttpTransport = {
      request: vi.fn(async () => { throw new Error(`request failed for ${request.apiKey}`); }),
    };
    const generator = new OpenAiImageGenerator(http, { fetch: vi.fn() });

    const error = await generator.generate(request).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(CoverGenerationError);
    expect(String(error)).not.toContain(request.apiKey);
    expect(error).toMatchObject({ code: 'IMAGE_PROVIDER_REQUEST_FAILED' });
  });

  it('classifies a reset image-provider connection without exposing credentials', async () => {
    const http: HttpTransport = {
      request: vi.fn(async () => {
        throw Object.assign(new Error(`net::ERR_CONNECTION_RESET for ${request.apiKey}`), {
          code: 'ERR_CONNECTION_RESET',
        });
      }),
    };
    const generator = new OpenAiImageGenerator(http, { fetch: vi.fn() });

    const error = await generator.generate(request).catch((caught: unknown) => caught);

    expect(error).toMatchObject({ code: 'IMAGE_PROVIDER_CONNECTION_RESET' });
    expect(String(error)).not.toContain(request.apiKey);
  });

  it('honors cancellation before sending credentials', async () => {
    const current = transport({ data: [] });
    const generator = new OpenAiImageGenerator(current.http, { fetch: vi.fn() });
    const controller = new AbortController();
    controller.abort();

    await expect(generator.generate({ ...request, signal: controller.signal }))
      .rejects.toMatchObject({ code: 'IMAGE_GENERATION_CANCELLED' });
    expect(current.requests).toHaveLength(0);
  });

  it('rejects Anthropic requests before building image headers or sending a request', async () => {
    const current = transport({ data: [] });
    const generator = new OpenAiImageGenerator(current.http, { fetch: vi.fn() });

    await expect(generator.generate({ ...request, protocol: 'anthropic' }))
      .rejects.toMatchObject({ code: 'AI_PROVIDER_IMAGE_UNSUPPORTED' });
    expect(current.requests).toHaveLength(0);
  });
});
