export type DefaultCoverStrategy = 'article' | 'first-image' | 'global-default';

export interface MediaCacheRecord {
  key: string;
  accountHash: string;
  kind: 'body' | 'cover';
  contentHash: string;
  mediaId: string | null;
  url: string | null;
  createdAt: number;
  lastUsedAt: number;
}

export interface RecoveryReceiptRecord {
  taskId: string;
  accountHash: string;
  mediaId: string;
  operation: 'CREATE' | 'UPDATE';
  contentHash: string;
  themeHash: string;
  coverHash: string;
  remoteTimestamp: number;
  status: 'UNRESOLVED' | 'RESOLVED';
}

export interface PluginSettings {
  schemaVersion: 1;
  appId: string;
  defaultThemeId: string;
  customThemeDirectory: string;
  defaultAuthor: string;
  defaultSourceUrl: string;
  defaultCoverStrategy: DefaultCoverStrategy;
  globalDefaultCoverPath: string;
  imageApiBaseUrl: string;
  imageApiModel: string;
  accessTokenExpiresAt: number | null;
  accountHash: string | null;
  mediaCache: readonly Readonly<MediaCacheRecord>[];
  recoveryReceipts: readonly Readonly<RecoveryReceiptRecord>[];
}

export const DEFAULT_SETTINGS: Readonly<PluginSettings> = Object.freeze({
  schemaVersion: 1,
  appId: '',
  defaultThemeId: 'native',
  customThemeDirectory: '.wechat-workbench/themes',
  defaultAuthor: '',
  defaultSourceUrl: '',
  defaultCoverStrategy: 'first-image',
  globalDefaultCoverPath: '',
  imageApiBaseUrl: '',
  imageApiModel: '',
  accessTokenExpiresAt: null,
  accountHash: null,
  mediaCache: Object.freeze([]),
  recoveryReceipts: Object.freeze([]),
});
