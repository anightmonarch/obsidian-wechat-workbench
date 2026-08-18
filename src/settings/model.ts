export type DefaultCoverStrategy = 'article' | 'first-image' | 'global-default';

export interface PluginSettings {
  schemaVersion: 1;
  appId: string;
  defaultThemeId: string;
  customThemeDirectory: string;
  defaultAuthor: string;
  defaultSourceUrl: string;
  defaultCoverStrategy: DefaultCoverStrategy;
  imageApiBaseUrl: string;
  imageApiModel: string;
  accessTokenExpiresAt: number | null;
  accountHash: string | null;
}

export const DEFAULT_SETTINGS: Readonly<PluginSettings> = Object.freeze({
  schemaVersion: 1,
  appId: '',
  defaultThemeId: 'native',
  customThemeDirectory: '.wechat-workbench/themes',
  defaultAuthor: '',
  defaultSourceUrl: '',
  defaultCoverStrategy: 'first-image',
  imageApiBaseUrl: '',
  imageApiModel: '',
  accessTokenExpiresAt: null,
  accountHash: null,
});
