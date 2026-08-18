import { DEFAULT_SETTINGS, type DefaultCoverStrategy, type PluginSettings } from './model';

export interface PluginDataPort {
  loadData(): Promise<unknown>;
  saveData(data: unknown): Promise<void>;
}

const COVER_STRATEGIES = new Set<DefaultCoverStrategy>([
  'article',
  'first-image',
  'global-default',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function nullableString(value: unknown, fallback: string | null): string | null {
  return typeof value === 'string' || value === null ? value : fallback;
}

function nullableNumber(value: unknown, fallback: number | null): number | null {
  return typeof value === 'number' && Number.isFinite(value) || value === null
    ? value
    : fallback;
}

function coverStrategy(value: unknown): DefaultCoverStrategy {
  return typeof value === 'string' && COVER_STRATEGIES.has(value as DefaultCoverStrategy)
    ? value as DefaultCoverStrategy
    : DEFAULT_SETTINGS.defaultCoverStrategy;
}

function sanitizeSettings(value: unknown): PluginSettings {
  const stored = isRecord(value) && value.schemaVersion === 1 ? value : {};

  return {
    schemaVersion: 1,
    appId: stringValue(stored.appId, DEFAULT_SETTINGS.appId),
    defaultThemeId: stringValue(stored.defaultThemeId, DEFAULT_SETTINGS.defaultThemeId),
    customThemeDirectory: stringValue(
      stored.customThemeDirectory,
      DEFAULT_SETTINGS.customThemeDirectory,
    ),
    defaultAuthor: stringValue(stored.defaultAuthor, DEFAULT_SETTINGS.defaultAuthor),
    defaultSourceUrl: stringValue(stored.defaultSourceUrl, DEFAULT_SETTINGS.defaultSourceUrl),
    defaultCoverStrategy: coverStrategy(stored.defaultCoverStrategy),
    imageApiBaseUrl: stringValue(stored.imageApiBaseUrl, DEFAULT_SETTINGS.imageApiBaseUrl),
    imageApiModel: stringValue(stored.imageApiModel, DEFAULT_SETTINGS.imageApiModel),
    accessTokenExpiresAt: nullableNumber(
      stored.accessTokenExpiresAt,
      DEFAULT_SETTINGS.accessTokenExpiresAt,
    ),
    accountHash: nullableString(stored.accountHash, DEFAULT_SETTINGS.accountHash),
  };
}

export class SettingsStore {
  constructor(private readonly data: PluginDataPort) {}

  async load(): Promise<Readonly<PluginSettings>> {
    return Object.freeze(sanitizeSettings(await this.data.loadData()));
  }

  async save(settings: PluginSettings): Promise<Readonly<PluginSettings>> {
    const sanitized = Object.freeze(sanitizeSettings(settings));
    await this.data.saveData(sanitized);
    return sanitized;
  }
}
