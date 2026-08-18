import {
  DEFAULT_SETTINGS,
  type DefaultCoverStrategy,
  type MediaCacheRecord,
  type PluginSettings,
  type RecoveryReceiptRecord,
} from './model';

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

function providerBaseUrl(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) return '';
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.username.length > 0 || url.password.length > 0
      || url.search.length > 0 || url.hash.length > 0) return '';
    return url.toString().replace(/\/$/u, '');
  } catch {
    return '';
  }
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

function mediaCache(value: unknown): readonly Readonly<MediaCacheRecord>[] {
  if (!Array.isArray(value)) return DEFAULT_SETTINGS.mediaCache;
  const entries: Readonly<MediaCacheRecord>[] = [];
  for (const item of value.slice(-500)) {
    if (!isRecord(item)) continue;
    if (typeof item.key !== 'string' || typeof item.accountHash !== 'string'
      || (item.kind !== 'body' && item.kind !== 'cover')
      || typeof item.contentHash !== 'string'
      || !(typeof item.mediaId === 'string' || item.mediaId === null)
      || !(typeof item.url === 'string' || item.url === null)
      || typeof item.createdAt !== 'number' || !Number.isFinite(item.createdAt)
      || typeof item.lastUsedAt !== 'number' || !Number.isFinite(item.lastUsedAt)) continue;
    entries.push(Object.freeze({
      key: item.key,
      accountHash: item.accountHash,
      kind: item.kind,
      contentHash: item.contentHash,
      mediaId: item.mediaId,
      url: item.url,
      createdAt: item.createdAt,
      lastUsedAt: item.lastUsedAt,
    }));
  }
  return Object.freeze(entries);
}

function recoveryReceipts(value: unknown): readonly Readonly<RecoveryReceiptRecord>[] {
  if (!Array.isArray(value)) return DEFAULT_SETTINGS.recoveryReceipts;
  const unresolved: Readonly<RecoveryReceiptRecord>[] = [];
  const resolved: Readonly<RecoveryReceiptRecord>[] = [];
  for (const item of value) {
    if (!isRecord(item)
      || typeof item.taskId !== 'string'
      || typeof item.accountHash !== 'string'
      || typeof item.mediaId !== 'string'
      || (item.operation !== 'CREATE' && item.operation !== 'UPDATE')
      || typeof item.contentHash !== 'string'
      || typeof item.themeHash !== 'string'
      || typeof item.coverHash !== 'string'
      || typeof item.remoteTimestamp !== 'number' || !Number.isFinite(item.remoteTimestamp)
      || (item.status !== 'UNRESOLVED' && item.status !== 'RESOLVED')) continue;
    const receipt = Object.freeze({
      taskId: item.taskId,
      vaultPath: typeof item.vaultPath === 'string' ? item.vaultPath : '',
      accountHash: item.accountHash,
      fingerprint: typeof item.fingerprint === 'string' ? item.fingerprint : '',
      mediaId: item.mediaId,
      operation: item.operation,
      contentHash: item.contentHash,
      themeHash: item.themeHash,
      coverHash: item.coverHash,
      remoteTimestamp: item.remoteTimestamp,
      status: item.status,
    });
    if (receipt.status === 'UNRESOLVED') unresolved.push(receipt);
    else resolved.push(receipt);
  }
  resolved.sort((left, right) => right.remoteTimestamp - left.remoteTimestamp);
  return Object.freeze([...unresolved, ...resolved.slice(0, 20)]);
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
    globalDefaultCoverPath: stringValue(
      stored.globalDefaultCoverPath,
      DEFAULT_SETTINGS.globalDefaultCoverPath,
    ),
    imageApiBaseUrl: providerBaseUrl(stored.imageApiBaseUrl),
    imageApiModel: stringValue(stored.imageApiModel, DEFAULT_SETTINGS.imageApiModel),
    accessTokenExpiresAt: nullableNumber(
      stored.accessTokenExpiresAt,
      DEFAULT_SETTINGS.accessTokenExpiresAt,
    ),
    accountHash: nullableString(stored.accountHash, DEFAULT_SETTINGS.accountHash),
    mediaCache: mediaCache(stored.mediaCache),
    recoveryReceipts: recoveryReceipts(stored.recoveryReceipts),
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
