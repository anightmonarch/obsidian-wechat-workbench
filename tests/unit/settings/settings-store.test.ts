import { describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS, type PluginSettings } from '../../../src/settings/model';
import { DEFAULT_ARTICLE_STYLE } from '../../../src/styles/style-config';
import { SettingsStore, type PluginDataPort } from '../../../src/settings/settings-store';

class MemoryPluginData implements PluginDataPort {
  saved: unknown;

  constructor(private readonly loaded: unknown = null) {}

  async loadData(): Promise<unknown> {
    return this.loaded;
  }

  async saveData(data: unknown): Promise<void> {
    this.saved = structuredClone(data);
  }
}

describe('SettingsStore', () => {
  it('migrates schema v1 without dropping account or publish state', async () => {
    const settings = await new SettingsStore(new MemoryPluginData({
      schemaVersion: 1,
      appId: 'wx-public-id',
      defaultThemeId: 'technical',
      mediaCache: [],
      recoveryReceipts: [],
    })).load();

    expect(settings.schemaVersion).toBe(5);
    expect(settings.appId).toBe('wx-public-id');
    expect(settings.defaultThemeId).toBe('technical');
    expect(settings.defaultStyle).toEqual(DEFAULT_ARTICLE_STYLE);
    expect(settings.defaultStyle.externalLinkCitation).toBe(false);
    expect(settings.defaultStyle.wordCount).toBe(false);
    expect(settings.recentStyles).toEqual({});
  });

  it('uses current provider defaults for pre-v5 data', async () => {
    const settings = await new SettingsStore(new MemoryPluginData({
      schemaVersion: 2,
      appId: 'wx-public-id',
    })).load();

    expect(settings).toMatchObject({
      schemaVersion: 5,
      accountDisplayName: '',
      accountVerification: null,
    });
    expect(settings.aiProviders).toEqual(DEFAULT_SETTINGS.aiProviders);
  });

  it('sanitizes schema v5 provider profiles', async () => {
    const settings = await new SettingsStore(new MemoryPluginData({
      schemaVersion: 5,
      aiProviders: {
        text: { activeProvider: null, providers: { agnes: {}, deepseek: {} } },
        image: {
          activeProvider: 'agnes',
          providers: {
            agnes: {
              baseUrl: 'https://images.example.test/v1/',
              model: ' saved-image-model ',
              requestFormat: 'untrusted-format',
            },
            deepseek: {},
          },
        },
      },
    })).load();

    expect(settings.aiProviders.image.activeProvider).toBe('agnes');
    expect(settings.aiProviders.image.providers.agnes).toMatchObject({
      baseUrl: 'https://images.example.test/v1',
      model: 'saved-image-model',
      requestFormat: 'agnes-images',
    });
  });

  it('drops malformed verification records and unsupported provider selections', async () => {
    const settings = await new SettingsStore(new MemoryPluginData({
      schemaVersion: 5,
      aiProviders: {
        text: { activeProvider: 'unknown', providers: { agnes: {}, deepseek: {} } },
        image: { activeProvider: null, providers: { agnes: {}, deepseek: {} } },
      },
      accountVerification: {
        accountHash: 'x', outcome: 'SUCCESS', verifiedAt: 'now',
        errorCode: null, errcode: null,
      },
    })).load();

    expect(settings.aiProviders.text.activeProvider).toBeNull();
    expect(settings.accountVerification).toBeNull();
  });

  it('sanitizes style maps and still refuses credential-shaped extras', async () => {
    const settings = await new SettingsStore(new MemoryPluginData({
      schemaVersion: 2,
      defaultStyle: { version: 1, theme: 'doocs-simple', 'primary-color': '#009874' },
      recentStyles: {
        'doocs-simple': { version: 1, theme: 'doocs-simple', 'font-size': 18 },
      },
      appSecret: 'must-not-load',
    })).load();

    expect(settings.defaultStyle.themeId).toBe('doocs-simple');
    expect(settings.recentStyles['doocs-simple']?.fontSize).toBe(18);
    expect(settings).not.toHaveProperty('appSecret');
  });

  it('returns immutable defaults when no plugin data exists', async () => {
    const store = new SettingsStore(new MemoryPluginData());

    const settings = await store.load();

    expect(settings).toEqual(DEFAULT_SETTINGS);
    expect(Object.isFrozen(settings)).toBe(true);
  });

  it('pre-fills official Base URLs and drops advanced endpoint overrides', async () => {
    const settings = await new SettingsStore(new MemoryPluginData({
      schemaVersion: 5,
      aiProviders: {
        text: {
          activeProvider: 'deepseek',
          providers: {
            agnes: {},
            deepseek: {
              baseUrl: 'https://api.deepseek.com',
              endpointOverride: 'https://api.deepseek.com/custom/chat',
              model: 'deepseek-v4-flash',
              requestFormat: 'agnes-images',
            },
          },
        },
        image: { activeProvider: null, providers: { agnes: {}, deepseek: {} } },
      },
    })).load();

    expect(DEFAULT_SETTINGS.aiProviders.text.providers.agnes.baseUrl).toBe('https://apihub.agnes-ai.com/v1');
    expect(DEFAULT_SETTINGS.aiProviders.text.providers.deepseek.baseUrl).toBe('https://api.deepseek.com');
    expect(DEFAULT_SETTINGS.aiProviders.image.providers.agnes.baseUrl).toBe('https://apihub.agnes-ai.com/v1');
    expect(settings.aiProviders.text.providers.deepseek).not.toHaveProperty('endpointOverride');
    expect(settings.aiProviders.text.providers.deepseek.requestFormat).toBe('openai-chat-completions');
  });

  it('loads known non-secret fields and ignores unknown or secret-shaped fields', async () => {
    const store = new SettingsStore(new MemoryPluginData({
      schemaVersion: 1,
      appId: 'wx-public-id',
      defaultThemeId: 'technical',
      appSecret: 'must-not-load',
      accessToken: 'must-not-load',
      unknownField: 'must-not-load',
    }));

    const settings = await store.load();

    expect(settings.appId).toBe('wx-public-id');
    expect(settings.defaultThemeId).toBe('technical');
    expect(settings).not.toHaveProperty('appSecret');
    expect(settings).not.toHaveProperty('accessToken');
    expect(settings).not.toHaveProperty('unknownField');
  });

  it('never serializes secret fields into plugin data', async () => {
    const adapter = new MemoryPluginData();
    const store = new SettingsStore(adapter);
    const settings: PluginSettings = { ...DEFAULT_SETTINGS, appId: 'wx-public-id' };

    await store.save(settings);

    expect(adapter.saved).toEqual(expect.objectContaining({ appId: 'wx-public-id' }));
    expect(adapter.saved).not.toHaveProperty('appSecret');
    expect(adapter.saved).not.toHaveProperty('accessToken');
    expect(adapter.saved).not.toHaveProperty('imageApiKey');
  });

  it('never serializes text or image API keys', async () => {
    const adapter = new MemoryPluginData();
    const store = new SettingsStore(adapter);

    await store.save({ ...DEFAULT_SETTINGS });

    expect(adapter.saved).not.toHaveProperty('textApiKey');
    expect(adapter.saved).not.toHaveProperty('imageApiKey');
  });

  it('persists only the current provider profile model', async () => {
    const adapter = new MemoryPluginData();
    const store = new SettingsStore(adapter);

    await store.save({ ...DEFAULT_SETTINGS });

    expect(adapter.saved).toHaveProperty('aiProviders');
    expect(adapter.saved).not.toHaveProperty('textApiEndpoint');
    expect(adapter.saved).not.toHaveProperty('textApiModel');
    expect(adapter.saved).not.toHaveProperty('imageApiEndpoint');
    expect(adapter.saved).not.toHaveProperty('imageApiBaseUrl');
    expect(adapter.saved).not.toHaveProperty('imageApiProtocol');
    expect(adapter.saved).not.toHaveProperty('imageApiModel');
  });

  it('sanitizes recovery receipts and drops article or credential-shaped extras', async () => {
    const store = new SettingsStore(new MemoryPluginData({
      schemaVersion: 1,
      recoveryReceipts: [{
        taskId: 'TASK_1', accountHash: 'ACCOUNT_HASH', mediaId: 'TEST_MEDIA_ID',
        operation: 'CREATE', contentHash: 'CONTENT_HASH', themeHash: 'THEME_HASH',
        coverHash: 'COVER_HASH', remoteTimestamp: 1, status: 'UNRESOLVED',
        title: 'must-not-load', accessToken: 'must-not-load', html: 'must-not-load',
      }],
    }));

    const settings = await store.load();

    expect(settings.recoveryReceipts).toHaveLength(1);
    expect(settings.recoveryReceipts[0]).not.toHaveProperty('title');
    expect(settings.recoveryReceipts[0]).not.toHaveProperty('accessToken');
    expect(settings.recoveryReceipts[0]).not.toHaveProperty('html');
  });

  it('does not persist credentials, query parameters, or fragments in provider URLs', async () => {
    const store = new SettingsStore(new MemoryPluginData({
      schemaVersion: 5,
      aiProviders: {
        text: { activeProvider: null, providers: { agnes: {}, deepseek: {} } },
        image: {
          activeProvider: 'agnes',
          providers: {
            agnes: {
              baseUrl: 'https://user:password@images.example.test/v1?api_key=value#fragment',
              model: 'image-model',
            },
            deepseek: {},
          },
        },
      },
    }));

    expect((await store.load()).aiProviders.image.providers.agnes.baseUrl)
      .toBe(DEFAULT_SETTINGS.aiProviders.image.providers.agnes.baseUrl);
  });
});
