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

    expect(settings.schemaVersion).toBe(4);
    expect(settings.appId).toBe('wx-public-id');
    expect(settings.defaultThemeId).toBe('technical');
    expect(settings.defaultStyle).toEqual(DEFAULT_ARTICLE_STYLE);
    expect(settings.defaultStyle.externalLinkCitation).toBe(false);
    expect(settings.defaultStyle.wordCount).toBe(false);
    expect(settings.recentStyles).toEqual({});
  });

  it('migrates v2 account and image settings into schema v4', async () => {
    const settings = await new SettingsStore(new MemoryPluginData({
      schemaVersion: 2,
      appId: 'wx-public-id',
      imageApiBaseUrl: 'https://images.example.test/v1',
      imageApiModel: 'image-model',
    })).load();

    expect(settings).toMatchObject({
      schemaVersion: 4,
      accountDisplayName: '',
      accountVerification: null,
      imageApiProtocol: 'openai-compatible',
      imageApiBaseUrl: 'https://images.example.test/v1',
      imageApiEndpoint: 'https://images.example.test/v1',
      imageApiModel: 'image-model',
    });
  });

  it('migrates a v3 image URL without appending a provider path', async () => {
    const settings = await new SettingsStore(new MemoryPluginData({
      schemaVersion: 3,
      imageApiProtocol: 'openai-compatible',
      imageApiBaseUrl: 'https://images.example.test/custom/generate',
      imageApiModel: 'saved-image-model',
    })).load();

    expect(settings).toMatchObject({
      schemaVersion: 4,
      textApiEndpoint: '',
      textApiModel: '',
      imageApiEndpoint: 'https://images.example.test/custom/generate',
      imageApiModel: 'saved-image-model',
      imageApiBaseUrl: 'https://images.example.test/custom/generate',
      imageApiProtocol: 'openai-compatible',
    });
  });

  it('drops malformed verification records and unsupported protocols', async () => {
    const settings = await new SettingsStore(new MemoryPluginData({
      schemaVersion: 3,
      imageApiProtocol: 'unknown',
      accountVerification: {
        accountHash: 'x', outcome: 'SUCCESS', verifiedAt: 'now',
        errorCode: null, errcode: null,
      },
    })).load();

    expect(settings.imageApiProtocol).toBe('openai-compatible');
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

    await store.save({ ...DEFAULT_SETTINGS, textApiEndpoint: 'https://text.example.test/v1/chat' });

    expect(adapter.saved).not.toHaveProperty('textApiKey');
    expect(adapter.saved).not.toHaveProperty('imageApiKey');
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
      schemaVersion: 1,
      imageApiBaseUrl: 'https://user:password@images.example.test/v1?api_key=value#fragment',
    }));

    expect((await store.load()).imageApiBaseUrl).toBe('');
    expect((await store.load()).imageApiEndpoint).toBe('');
  });
});
