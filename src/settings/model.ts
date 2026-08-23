import type { ArticleStyleConfig } from '../domain/style';

export type DefaultCoverStrategy = 'article' | 'first-image' | 'global-default';

export type AiProviderProtocol = 'openai-compatible' | 'anthropic';

export interface AccountVerificationRecord {
  accountHash: string;
  outcome: 'SUCCESS' | 'FAILURE';
  verifiedAt: number;
  errorCode: string | null;
  errcode: number | null;
}

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
  vaultPath: string;
  accountHash: string;
  fingerprint: string;
  mediaId: string;
  operation: 'CREATE' | 'UPDATE';
  contentHash: string;
  themeHash: string;
  coverHash: string;
  remoteTimestamp: number;
  status: 'UNRESOLVED' | 'RESOLVED';
}

export interface PluginSettings {
  readonly schemaVersion: 3;
  appId: string;
  defaultThemeId: string;
  defaultStyle: Readonly<ArticleStyleConfig>;
  recentStyles: Readonly<Record<string, Readonly<ArticleStyleConfig>>>;
  customThemeDirectory: string;
  defaultAuthor: string;
  defaultSourceUrl: string;
  defaultCoverStrategy: DefaultCoverStrategy;
  globalDefaultCoverPath: string;
  accountDisplayName: string;
  accountVerification: Readonly<AccountVerificationRecord> | null;
  imageApiBaseUrl: string;
  imageApiProtocol: AiProviderProtocol;
  imageApiModel: string;
  accessTokenExpiresAt: number | null;
  accountHash: string | null;
  mediaCache: readonly Readonly<MediaCacheRecord>[];
  recoveryReceipts: readonly Readonly<RecoveryReceiptRecord>[];
}

export const DEFAULT_SETTINGS: Readonly<PluginSettings> = Object.freeze({
  schemaVersion: 3,
  appId: '',
  defaultThemeId: 'native',
  defaultStyle: Object.freeze({
    version: 2,
    themeId: 'doocs-classic',
    fontFamily: 'sans-serif',
    fontSize: 16,
    primaryColor: '#0F4C81',
    headingStyles: Object.freeze({
      h1: 'default', h2: 'default', h3: 'default',
      h4: 'default', h5: 'default', h6: 'default',
    }),
    codeThemeId: 'github-dark',
    showCodeLineNumbers: false,
    macCodeBlock: true,
    imageCaption: 'alt',
    externalLinkCitation: false,
    paragraphIndent: false,
    textJustify: false,
    wordCount: false,
  }),
  recentStyles: Object.freeze({}),
  customThemeDirectory: '.wechat-workbench/themes',
  defaultAuthor: '',
  defaultSourceUrl: '',
  defaultCoverStrategy: 'first-image',
  globalDefaultCoverPath: '',
  accountDisplayName: '',
  accountVerification: null,
  imageApiBaseUrl: '',
  imageApiProtocol: 'openai-compatible',
  imageApiModel: '',
  accessTokenExpiresAt: null,
  accountHash: null,
  mediaCache: Object.freeze([]),
  recoveryReceipts: Object.freeze([]),
});
