import type { SettingsAccess } from './settings-tab';

/**
 * Settings used by plugin configuration forms. Persisting them must not
 * rebuild a rendered article; render-affecting settings own their refresh
 * behaviour at their dedicated call sites.
 */
export function createNonRenderingSettingsAccess(
  get: SettingsAccess['get'],
  update: SettingsAccess['update'],
): SettingsAccess {
  return Object.freeze({ get, update });
}
