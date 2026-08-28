import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_SETTINGS, type PluginSettings } from '../../../src/settings/model';
import { AiServiceSettingsService } from '../../../src/settings/ai-service-settings';

function createService() {
  const settings = {
    current: {
      ...DEFAULT_SETTINGS,
      aiProviders: {
        text: {
          activeProvider: 'agnes',
          providers: {
            agnes: { baseUrl: 'https://apihub.agnes-ai.com/v1', model: 'saved-text-model', requestFormat: 'openai-chat-completions', models: [] },
            deepseek: { baseUrl: 'https://api.deepseek.com', model: '', requestFormat: 'openai-chat-completions', models: [] },
          },
        },
        image: {
          activeProvider: 'agnes',
          providers: {
            agnes: { baseUrl: 'https://apihub.agnes-ai.com/v1', model: 'saved-image-model', requestFormat: 'agnes-images', models: [] },
            deepseek: { baseUrl: 'https://api.deepseek.com', model: '', requestFormat: 'openai-images', models: [] },
          },
        },
      },
    } as PluginSettings,
    update: vi.fn(async (patch: Partial<PluginSettings>) => {
      settings.current = { ...settings.current, ...patch };
      return settings.current;
    }),
  };
  const values = new Map<string, string>([
    ['textAgnesApiKey', 'stored-text-key'],
    ['imageAgnesApiKey', 'stored-image-key'],
  ]);
  const secrets = {
    get: vi.fn((kind: string) => values.get(kind) ?? null),
    set: vi.fn((kind: string, value: string) => values.set(kind, value)),
    clear: vi.fn((kind: string) => values.delete(kind)),
  };
  const service = new AiServiceSettingsService(
    { get: () => settings.current, update: settings.update },
    secrets,
  );
  return { service, settings, secrets, values };
}

describe('AiServiceSettingsService', () => {
  it('saves text configuration from a Base URL without a network dependency', async () => {
    const current = createService();

    await current.service.saveProfile({
      kind: 'text', provider: 'agnes', baseUrl: 'https://apihub.agnes-ai.com/v1',
      model: 'text-model',
      apiKey: 'new-text-key',
    });

    expect(current.settings.current.aiProviders.text.activeProvider).toBe('agnes');
    expect(current.settings.current.aiProviders.text.providers.agnes.model).toBe('text-model');
    expect(current.secrets.set).toHaveBeenCalledWith('textAgnesApiKey', 'new-text-key');
  });

  it('saves image configuration independently from text configuration', async () => {
    const current = createService();

    await current.service.saveProfile({
      kind: 'image', provider: 'agnes', baseUrl: 'https://apihub.agnes-ai.com/v1',
      model: 'image-model',
      apiKey: 'new-image-key',
    });

    expect(current.settings.current.aiProviders.image.activeProvider).toBe('agnes');
    expect(current.settings.current.aiProviders.image.providers.agnes.model).toBe('image-model');
    expect(current.settings.current.aiProviders.text.providers.agnes.model).toBe('saved-text-model');
    expect(current.secrets.set).toHaveBeenCalledWith('imageAgnesApiKey', 'new-image-key');
  });

  it('retains a stored key when the Base URL origin is unchanged and the field is empty', async () => {
    const current = createService();

    await current.service.saveProfile({
      kind: 'image', provider: 'agnes', baseUrl: 'https://apihub.agnes-ai.com/v1',
      model: 'new-image-model',
      apiKey: '',
    });

    expect(current.values.get('imageAgnesApiKey')).toBe('stored-image-key');
    expect(current.secrets.set).not.toHaveBeenCalled();
  });

  it('replaces a stored key when a non-empty key is supplied on the same origin', async () => {
    const current = createService();
    const replacementImage = ['replacement', 'image', 'credential'].join('-');

    await current.service.saveProfile({
      kind: 'image', provider: 'agnes', baseUrl: 'https://apihub.agnes-ai.com/v1',
      model: 'new-image-model',
      apiKey: replacementImage,
    });

    expect(current.values.get('imageAgnesApiKey')).toBe(replacementImage);
  });

  it('requires a new key when the Base URL origin changes', async () => {
    const current = createService();

    await expect(current.service.saveProfile({
      kind: 'image', provider: 'agnes', baseUrl: 'https://new-images.example.test/v1',
      model: 'image-model',
      apiKey: '',
    })).rejects.toMatchObject({ code: 'AI_ENDPOINT_NEW_KEY_REQUIRED' });
    expect(current.settings.update).not.toHaveBeenCalled();
  });

  it('rejects an insecure Base URL before any secret mutation', async () => {
    const current = createService();

    await expect(current.service.saveProfile({
      kind: 'text', provider: 'agnes', baseUrl: 'http://text.example.test',
      model: 'text-model',
      apiKey: 'new-key',
    })).rejects.toMatchObject({ code: 'AI_BASE_URL_INVALID' });
    expect(current.secrets.set).not.toHaveBeenCalled();
  });

  it('rolls back a replaced key when settings persistence fails', async () => {
    const current = createService();
    const replacementText = ['replacement', 'text', 'credential'].join('-');
    current.settings.update.mockRejectedValueOnce(new Error('synthetic save failure'));

    await expect(current.service.saveProfile({
      kind: 'text', provider: 'agnes', baseUrl: 'https://apihub.agnes-ai.com/v1',
      model: 'text-model',
      apiKey: replacementText,
    })).rejects.toThrow('synthetic save failure');
    expect(current.values.get('textAgnesApiKey')).toBe('stored-text-key');
  });
});
