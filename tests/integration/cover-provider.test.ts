import { describe, expect, it, vi } from 'vitest';

import { OpenAiImageGenerator } from '../../src/cover/openai-image-generator';
import type { HttpTransport } from '../../src/wechat/http-transport';

const request = Object.freeze({
  protocol: 'openai-compatible' as const,
  endpoint: 'https://images.example.test/v1/images/generations', model: 'synthetic-image-model', apiKey: 'SYNTHETIC_KEY',
  title: 'Title', digest: '', bodyExcerpt: 'Body',
});

describe('OpenAI-compatible cover provider boundary', () => {
  it('accepts a validated HTTPS image URL response through the secure image fetcher', async () => {
    const http: HttpTransport = {
      request: vi.fn(async () => ({
        status: 200, headers: Object.freeze({}),
        body: { data: [{ url: 'https://cdn.example.test/generated.png' }] },
      })),
    };
    const fetch = vi.fn(async () => Object.freeze({
      sourceUrl: 'https://cdn.example.test/generated.png',
      finalUrl: 'https://cdn.example.test/generated.png',
      mimeType: 'image/png' as const,
      bytes: Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      contentHash: 'IMAGE_HASH',
    }));

    const result = await new OpenAiImageGenerator(http, { fetch }).generate(request);

    expect(result.source).toBe('remote-url');
    expect(fetch).toHaveBeenCalledWith('https://cdn.example.test/generated.png');
  });

  it('returns a stable timeout without retrying the provider', async () => {
    const requestProvider = vi.fn(() => new Promise<never>(() => undefined));
    const generator = new OpenAiImageGenerator({ request: requestProvider }, { fetch: vi.fn() }, 5);

    await expect(generator.generate(request)).rejects.toMatchObject({ code: 'IMAGE_PROVIDER_TIMEOUT' });
    expect(requestProvider).toHaveBeenCalledOnce();
  });
});
