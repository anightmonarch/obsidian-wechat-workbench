import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_SETTINGS, type PluginSettings } from '../../../src/settings/model';
import { AiServiceSettingsService } from '../../../src/settings/ai-service-settings';

function createService() {
  const settings = {
    current: {
      ...DEFAULT_SETTINGS,
      textApiEndpoint: 'https://text.example.test/v1/chat',
      textApiModel: 'saved-text-model',
      imageApiEndpoint: 'https://images.example.test/v1/images',
      imageApiModel: 'saved-image-model',
    } as PluginSettings,
    update: vi.fn(async (patch: Partial<PluginSettings>) => {
      settings.current = { ...settings.current, ...patch };
      return settings.current;
    }),
  };
  const values = new Map<string, string>([
    ['textApiKey', 'stored-text-key'],
    ['imageApiKey', 'stored-image-key'],
  ]);
  const secrets = {
    get: vi.fn((kind: 'textApiKey' | 'imageApiKey') => values.get(kind) ?? null),
    set: vi.fn((kind: 'textApiKey' | 'imageApiKey', value: string) => values.set(kind, value)),
    clear: vi.fn((kind: 'textApiKey' | 'imageApiKey') => values.delete(kind)),
  };
  const service = new AiServiceSettingsService(
    { get: () => settings.current, update: settings.update },
    secrets,
  );
  return { service, settings, secrets, values };
}

describe('AiServiceSettingsService', () => {
  it('saves text configuration without a network dependency', async () => {
    const current = createService();

    await current.service.saveText({
      endpoint: 'https://text.example.test/v1/chat/completions',
      model: 'text-model',
      apiKey: 'new-text-key',
    });

    expect(current.settings.current.textApiEndpoint)
      .toBe('https://text.example.test/v1/chat/completions');
    expect(current.settings.current.textApiModel).toBe('text-model');
    expect(current.secrets.set).toHaveBeenCalledWith('textApiKey', 'new-text-key');
  });

  it('saves image configuration independently from text configuration', async () => {
    const current = createService();

    await current.service.saveImage({
      endpoint: 'https://images.example.test/v1/images/generations',
      model: 'image-model',
      apiKey: 'new-image-key',
    });

    expect(current.settings.current.imageApiEndpoint)
      .toBe('https://images.example.test/v1/images/generations');
    expect(current.settings.current.textApiEndpoint).toBe('https://text.example.test/v1/chat');
    expect(current.secrets.set).toHaveBeenCalledWith('imageApiKey', 'new-image-key');
  });

  it('retains a stored key for a same-origin path change when the field is empty', async () => {
    const current = createService();

    await current.service.saveImage({
      endpoint: 'https://images.example.test/custom/generate',
      model: 'new-image-model',
      apiKey: '',
    });

    expect(current.values.get('imageApiKey')).toBe('stored-image-key');
    expect(current.secrets.set).not.toHaveBeenCalled();
  });

  it('replaces a stored key when a non-empty key is supplied on the same origin', async () => {
    const current = createService();
    const replacementImage = ['replacement', 'image', 'credential'].join('-');

    await current.service.saveImage({
      endpoint: 'https://images.example.test/custom/generate',
      model: 'new-image-model',
      apiKey: replacementImage,
    });

    expect(current.values.get('imageApiKey')).toBe(replacementImage);
  });

  it('requires a new key when the endpoint origin changes', async () => {
    const current = createService();

    await expect(current.service.saveImage({
      endpoint: 'https://new-images.example.test/v1/images',
      model: 'image-model',
      apiKey: '',
    })).rejects.toMatchObject({ code: 'AI_ENDPOINT_NEW_KEY_REQUIRED' });
    expect(current.settings.update).not.toHaveBeenCalled();
  });

  it('rejects a root endpoint path before any secret mutation', async () => {
    const current = createService();

    await expect(current.service.saveText({
      endpoint: 'https://text.example.test',
      model: 'text-model',
      apiKey: 'new-key',
    })).rejects.toMatchObject({ code: 'AI_ENDPOINT_PATH_MISSING' });
    expect(current.secrets.set).not.toHaveBeenCalled();
  });

  it('rolls back a replaced key when settings persistence fails', async () => {
    const current = createService();
    const replacementText = ['replacement', 'text', 'credential'].join('-');
    current.settings.update.mockRejectedValueOnce(new Error('synthetic save failure'));

    await expect(current.service.saveText({
      endpoint: 'https://text.example.test/v1/chat',
      model: 'text-model',
      apiKey: replacementText,
    })).rejects.toThrow('synthetic save failure');
    expect(current.values.get('textApiKey')).toBe('stored-text-key');
  });
});
