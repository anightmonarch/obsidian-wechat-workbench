import { describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS, type PluginSettings } from '../../../src/settings/model';
import { SettingsStore, type PluginDataPort } from '../../../src/settings/settings-store';
import { DEFAULT_ARTICLE_STYLE } from '../../../src/styles/style-config';
import { PUBLIC_WECHAT_RELAY_BASE_URL } from '../../../src/wechat/public-relay-constants';

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

    expect(settings.schemaVersion).toBe(8);
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
      schemaVersion: 8,
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

  it('migrates schema v5 to API backends without changing providers', async () => {
    const storedProviders = {
      text: {
        activeProvider: 'deepseek',
        providers: {
          agnes: {},
          deepseek: {
            baseUrl: 'https://api.deepseek.com',
            model: 'deepseek-v4-flash',
          },
        },
      },
      image: {
        activeProvider: 'agnes',
        providers: {
          agnes: {
            baseUrl: 'https://apihub.agnes-ai.com/v1',
            model: 'agnes-image-2.1-flash',
          },
          deepseek: {},
        },
      },
    };
    const settings = await new SettingsStore(new MemoryPluginData({
      schemaVersion: 5,
      aiProviders: storedProviders,
    })).load();

    expect(settings.schemaVersion).toBe(8);
    expect(settings.textGenerationBackend).toBe('api');
    expect(settings.imageGenerationBackend).toBe('api');
    expect(settings.localCodex).toEqual({ executablePath: '' });
    expect(settings.aiProviders.text.activeProvider).toBe('deepseek');
    expect(settings.aiProviders.image.activeProvider).toBe('agnes');
  });

  it('sanitizes schema v6 backends and trims the configured Codex path', async () => {
    const settings = await new SettingsStore(new MemoryPluginData({
      ...DEFAULT_SETTINGS,
      schemaVersion: 6,
      textGenerationBackend: 'unknown',
      imageGenerationBackend: 'codex',
      localCodex: { executablePath: '  /opt/homebrew/bin/codex  ' },
    })).load();

    expect(settings.textGenerationBackend).toBe('api');
    expect(settings.imageGenerationBackend).toBe('codex');
    expect(settings.localCodex).toEqual({ executablePath: '/opt/homebrew/bin/codex' });
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

  it('defaults connectionMode to local on empty data', async () => {
    const settings = await new SettingsStore(new MemoryPluginData()).load();
    expect(settings.schemaVersion).toBe(8);
    expect(settings.connectionMode).toBe('local');
    expect(settings).not.toHaveProperty('wechatApiBaseUrl');
    expect(settings).not.toHaveProperty('wechatProxyAccessKey');
  });

  it('respects an already-valid connectionMode', async () => {
    const settings = await new SettingsStore(new MemoryPluginData({
      schemaVersion: 8,
      connectionMode: 'public_relay',
    })).load();
    expect(settings.connectionMode).toBe('public_relay');
  });

  it('migrates legacy public relay base URL to public_relay', async () => {
    const settings = await new SettingsStore(new MemoryPluginData({
      schemaVersion: 7,
      wechatApiBaseUrl: `${PUBLIC_WECHAT_RELAY_BASE_URL}/`,
      wechatProxyAccessKey: 'wxp_legacy_user_key',
    })).load();
    expect(settings.schemaVersion).toBe(8);
    expect(settings.connectionMode).toBe('public_relay');
    expect(settings).not.toHaveProperty('wechatApiBaseUrl');
    expect(settings).not.toHaveProperty('wechatProxyAccessKey');
  });

  it('maps empty or custom legacy proxy URL to local (no silent public takeover)', async () => {
    const empty = await new SettingsStore(new MemoryPluginData({
      schemaVersion: 7,
      wechatApiBaseUrl: '',
    })).load();
    expect(empty.connectionMode).toBe('local');

    const custom = await new SettingsStore(new MemoryPluginData({
      schemaVersion: 7,
      wechatApiBaseUrl: 'http://203.0.113.9:18080',
    })).load();
    expect(custom.connectionMode).toBe('local');
  });

  it('rejects invalid connectionMode values and falls back via legacy URL rules', async () => {
    const settings = await new SettingsStore(new MemoryPluginData({
      schemaVersion: 8,
      connectionMode: 'custom',
      wechatApiBaseUrl: PUBLIC_WECHAT_RELAY_BASE_URL,
    })).load();
    // invalid mode ignored; legacy public URL still maps to public_relay
    expect(settings.connectionMode).toBe('public_relay');
  });
});
