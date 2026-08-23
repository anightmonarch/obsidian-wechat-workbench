import { describe, expect, it, vi } from 'vitest';

import { AiModelCatalogService } from '../../../src/cover/ai-model-catalog';

function response(body: unknown, status = 200) {
  return { status, headers: {}, body };
}

describe('AiModelCatalogService', () => {
  it('uses bearer authentication for an OpenAI-compatible model list', async () => {
    const request = vi.fn(async () => response({ data: [{ id: 'image-b' }, { id: 'image-a' }] }));
    const models = await new AiModelCatalogService({ request }).list({
      protocol: 'openai-compatible',
      baseUrl: 'https://models.example.test/v1',
      apiKey: 'synthetic-provider-key',
    });

    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      method: 'GET',
      url: 'https://models.example.test/v1/models',
      headers: { Authorization: 'Bearer synthetic-provider-key' },
    }));
    expect(models.map(model => model.id)).toEqual(['image-a', 'image-b']);
    expect(models.every(model => model.capability === 'IMAGE_UNVERIFIED')).toBe(true);
  });

  it('uses Anthropic headers and marks every returned model planning-only', async () => {
    const request = vi.fn(async () => response({ data: [{ id: 'claude-sonnet' }] }));
    const models = await new AiModelCatalogService({ request }).list({
      protocol: 'anthropic',
      baseUrl: 'https://api.anthropic.com',
      apiKey: 'synthetic-anthropic-key',
    });

    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://api.anthropic.com/v1/models',
      headers: { 'x-api-key': 'synthetic-anthropic-key', 'anthropic-version': '2023-06-01' },
    }));
    expect(models).toEqual([{ id: 'claude-sonnet', capability: 'PROMPT_PLANNING_ONLY' }]);
  });

  it('rejects unsafe URLs before requests and invalid payloads after them', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(response({ data: [] }))
      .mockResolvedValueOnce(response({ unexpected: true }));
    const catalog = new AiModelCatalogService({ request });

    await expect(catalog.list({
      protocol: 'openai-compatible',
      baseUrl: 'http://127.0.0.1/v1',
      apiKey: 'synthetic-provider-key',
    })).rejects.toMatchObject({ code: 'AI_PROVIDER_URL_INVALID' });
    await expect(catalog.list({
      protocol: 'openai-compatible',
      baseUrl: 'https://models.example.test/v1?api_key=value',
      apiKey: 'synthetic-provider-key',
    })).rejects.toMatchObject({ code: 'AI_PROVIDER_URL_INVALID' });
    await expect(catalog.list({
      protocol: 'openai-compatible',
      baseUrl: 'https://models.example.test',
      apiKey: '',
    })).rejects.toMatchObject({ code: 'AI_PROVIDER_KEY_MISSING' });
    await expect(catalog.list({
      protocol: 'openai-compatible',
      baseUrl: 'https://models.example.test',
      apiKey: 'synthetic-provider-key',
    })).resolves.toEqual([]);
    await expect(catalog.list({
      protocol: 'openai-compatible',
      baseUrl: 'https://models.example.test',
      apiKey: 'synthetic-provider-key',
    })).rejects.toMatchObject({ code: 'AI_MODEL_LIST_INVALID' });
    expect(request).toHaveBeenCalledTimes(2);
  });
});
