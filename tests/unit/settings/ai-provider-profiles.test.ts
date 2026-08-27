import { describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_SETTINGS,
  resolveAiService,
  type PluginSettings,
} from '../../../src/settings/model';
import { AiServiceSettingsService } from '../../../src/settings/ai-service-settings';

describe('AI provider profiles', () => {
  it('keeps one independent current provider for text and image workbench actions', () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      aiProviders: {
        text: {
          activeProvider: 'deepseek',
          providers: {
            agnes: { baseUrl: '', model: '', requestFormat: 'openai-chat-completions', models: [] },
            deepseek: { baseUrl: 'https://api.deepseek.example/v1', model: 'deepseek-text', requestFormat: 'agnes-images', models: [] },
          },
        },
        image: {
          activeProvider: 'agnes',
          providers: {
            agnes: { baseUrl: 'https://api.agnes.example/v1', model: 'agnes-image', requestFormat: 'agnes-images', models: [] },
            deepseek: { baseUrl: '', model: 'deepseek-image', requestFormat: 'openai-images', models: [] },
          },
        },
      },
    } as PluginSettings;

    expect(resolveAiService(settings, 'text')).toMatchObject({
      provider: 'deepseek', endpoint: 'https://api.deepseek.example/v1/chat/completions', model: 'deepseek-text', requestFormat: 'openai-chat-completions',
    });
    expect(resolveAiService(settings, 'image')).toMatchObject({
      provider: 'agnes', endpoint: 'https://api.agnes.example/v1/images/generations', model: 'agnes-image',
    });
  });

  it('rejects DeepSeek as an image provider because it only supports image input', async () => {
    const settings = { current: DEFAULT_SETTINGS as PluginSettings };
    const update = vi.fn(async (patch: Partial<PluginSettings>) => {
      settings.current = { ...settings.current, ...patch };
      return settings.current;
    });
    const secrets = {
      get: vi.fn(() => null), set: vi.fn(), clear: vi.fn(),
    };
    const service = new AiServiceSettingsService({ get: () => settings.current, update }, secrets);

    await expect(service.saveProfile({
      kind: 'image', provider: 'deepseek', baseUrl: 'https://api.deepseek.example/v1',
      model: 'deepseek-image', apiKey: 'synthetic-key',
    })).rejects.toMatchObject({ code: 'AI_PROVIDER_UNSUPPORTED' });

    expect(settings.current.aiProviders.image.activeProvider).toBeNull();
    expect(secrets.set).not.toHaveBeenCalled();
  });
});
