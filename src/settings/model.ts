import type { ArticleStyleConfig } from '../domain/style';

export type DefaultCoverStrategy = 'article' | 'first-image' | 'global-default';

export type AiProviderProtocol = 'openai-compatible' | 'anthropic';

export type AiServiceKind = 'text' | 'image';

export type AiProviderId = 'agnes' | 'deepseek';

export type AiRequestFormat = 'openai-chat-completions' | 'agnes-images' | 'openai-images';

export interface AiProviderProfile {
  baseUrl: string;
  model: string;
  requestFormat: AiRequestFormat;
  models: readonly string[];
}

export interface AiModeProviderSettings {
  activeProvider: AiProviderId | null;
  providers: Readonly<Record<AiProviderId, Readonly<AiProviderProfile>>>;
}

export interface AiProviderSettings {
  text: Readonly<AiModeProviderSettings>;
  image: Readonly<AiModeProviderSettings>;
}

export interface ResolvedAiService {
  kind: AiServiceKind;
  provider: AiProviderId;
  endpoint: string;
  model: string;
  requestFormat: AiRequestFormat;
}

export function aiProvidersFor(kind: AiServiceKind): readonly AiProviderId[] {
  return kind === 'text'
    ? Object.freeze(['agnes', 'deepseek'])
    : Object.freeze(['agnes']);
}

export function providerBaseUrl(kind: AiServiceKind, provider: AiProviderId): string {
  if (provider === 'deepseek') return 'https://api.deepseek.com';
  return kind === 'text' || kind === 'image' ? 'https://apihub.agnes-ai.com/v1' : '';
}

export function providerRequestFormat(kind: AiServiceKind, provider: AiProviderId): AiRequestFormat {
  if (kind === 'image' && provider === 'agnes') return 'agnes-images';
  if (kind === 'image') return 'openai-images';
  return 'openai-chat-completions';
}

function profile(
  kind: AiServiceKind,
  provider: AiProviderId,
  model = '',
): Readonly<AiProviderProfile> {
  return Object.freeze({
    baseUrl: providerBaseUrl(kind, provider),
    model,
    requestFormat: providerRequestFormat(kind, provider),
    models: Object.freeze([]),
  });
}

export function defaultAiProviders(): Readonly<AiProviderSettings> {
  return Object.freeze({
    text: Object.freeze({
      activeProvider: null,
      providers: Object.freeze({
        agnes: profile('text', 'agnes'),
        deepseek: profile('text', 'deepseek', 'deepseek-v4-flash'),
      }),
    }),
    image: Object.freeze({
      activeProvider: null,
      providers: Object.freeze({
        agnes: profile('image', 'agnes'),
        deepseek: profile('image', 'deepseek'),
      }),
    }),
  });
}

function endpointFromBase(baseUrl: string, path: string): string {
  const normalized = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return new URL(path, normalized).toString().replace(/\/$/u, '');
}

export function resolveAiService(
  settings: Readonly<Pick<PluginSettings, 'aiProviders'>>,
  kind: AiServiceKind,
): Readonly<ResolvedAiService> | null {
  const mode = settings.aiProviders[kind];
  if (mode.activeProvider === null) return null;
  if (!aiProvidersFor(kind).includes(mode.activeProvider)) return null;
  const profile = mode.providers[mode.activeProvider];
  if (profile.model.trim().length === 0) return null;
  const endpoint = profile.baseUrl.trim().length > 0
    ? endpointFromBase(profile.baseUrl.trim(), kind === 'text' ? 'chat/completions' : 'images/generations')
    : '';
  if (endpoint.length === 0) return null;
  return Object.freeze({
    kind,
    provider: mode.activeProvider,
    endpoint,
    model: profile.model.trim(),
    requestFormat: providerRequestFormat(kind, mode.activeProvider),
  });
}

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
  readonly schemaVersion: 5;
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
  textApiEndpoint: string;
  textApiModel: string;
  imageApiEndpoint: string;
  imageApiBaseUrl: string;
  imageApiProtocol: AiProviderProtocol;
  imageApiModel: string;
  aiProviders: Readonly<AiProviderSettings>;
  accessTokenExpiresAt: number | null;
  accountHash: string | null;
  mediaCache: readonly Readonly<MediaCacheRecord>[];
  recoveryReceipts: readonly Readonly<RecoveryReceiptRecord>[];
}

export const DEFAULT_SETTINGS: Readonly<PluginSettings> = Object.freeze({
  schemaVersion: 5,
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
  textApiEndpoint: '',
  textApiModel: '',
  imageApiEndpoint: '',
  imageApiBaseUrl: '',
  imageApiProtocol: 'openai-compatible',
  imageApiModel: '',
  aiProviders: defaultAiProviders(),
  accessTokenExpiresAt: null,
  accountHash: null,
  mediaCache: Object.freeze([]),
  recoveryReceipts: Object.freeze([]),
});
