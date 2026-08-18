import { describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS, type PluginSettings } from '../../../src/settings/model';
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
});
