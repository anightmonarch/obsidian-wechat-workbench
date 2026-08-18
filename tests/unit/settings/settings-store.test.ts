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
});
