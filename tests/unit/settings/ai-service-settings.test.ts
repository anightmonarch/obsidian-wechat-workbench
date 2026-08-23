import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_SETTINGS, type PluginSettings } from '../../../src/settings/model';
import { AiServiceSettingsService } from '../../../src/settings/ai-service-settings';

function createService() {
  const settings = {
    current: {
      ...DEFAULT_SETTINGS,
      imageApiBaseUrl: 'https://images.example.test/v1',
      imageApiModel: 'saved-image-model',
    },
    update: vi.fn(async (patch: Partial<PluginSettings>) => {
      settings.current = { ...settings.current, ...patch };
      return settings.current;
    }),
  };
  const secrets = {
    get: vi.fn((kind: string) => kind === 'imageApiKey' ? 'synthetic-stored-key' : null),
    set: vi.fn(),
    clear: vi.fn(),
  };
  const catalog = {
    list: vi.fn(async () => [Object.freeze({
      id: 'image-model',
      capability: 'IMAGE_UNVERIFIED' as const,
    })]),
  };
  const service = new AiServiceSettingsService(
    { get: () => settings.current, update: settings.update },
    secrets,
    catalog,
  );
  return { service, settings, secrets, catalog };
}

describe('AiServiceSettingsService', () => {
  it('reuses the stored key only for the unchanged protocol and normalized URL', async () => {
    const { service, catalog } = createService();

    await service.refreshModels({
      protocol: 'openai-compatible',
      baseUrl: 'https://images.example.test/v1/',
      apiKey: '',
    });

    expect(catalog.list).toHaveBeenCalledWith(expect.objectContaining({
      protocol: 'openai-compatible',
      baseUrl: 'https://images.example.test/v1',
      apiKey: 'synthetic-stored-key',
    }));
  });

  it('never sends an old key to a changed protocol or host', async () => {
    const { service, catalog } = createService();

    await expect(service.refreshModels({
      protocol: 'anthropic',
      baseUrl: 'https://api.anthropic.com',
      apiKey: '',
    })).rejects.toMatchObject({ code: 'AI_PROVIDER_NEW_KEY_REQUIRED' });
    expect(catalog.list).not.toHaveBeenCalled();
  });

  it('does not save a model list fetched from a different provider endpoint', async () => {
    const { service, settings } = createService();

    await service.refreshModels({
      protocol: 'openai-compatible',
      baseUrl: 'https://images.example.test/v1',
      apiKey: 'synthetic-new-key',
    });

    await expect(service.save({
      protocol: 'openai-compatible',
      baseUrl: 'https://other-images.example.test/v1',
      model: 'image-model',
      apiKey: 'synthetic-other-key',
    })).rejects.toMatchObject({ code: 'AI_MODEL_NOT_REFRESHED' });
    expect(settings.current.imageApiBaseUrl).toBe('https://images.example.test/v1');
  });

  it('keeps the saved model when refresh fails', async () => {
    const { service, settings, secrets, catalog } = createService();
    catalog.list.mockRejectedValueOnce(new Error('synthetic provider failure'));

    await expect(service.refreshModels({
      protocol: 'openai-compatible',
      baseUrl: 'https://images.example.test/v1',
      apiKey: 'synthetic-new-key',
    })).rejects.toBeDefined();
    expect(settings.current.imageApiModel).toBe('saved-image-model');
    expect(secrets.set).not.toHaveBeenCalled();
  });
});
