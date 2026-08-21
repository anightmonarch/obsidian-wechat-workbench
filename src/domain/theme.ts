import type { ArticleStyleConfig } from './style';

export interface ThemeManifest {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
}

export interface ThemeDefinition {
  manifest: Readonly<ThemeManifest>;
  css: string;
  contentHash: string;
  source: 'builtin' | 'vault';
  previewPath: string | null;
  compiledStyle?: Readonly<{
    config: Readonly<ArticleStyleConfig>;
    baseThemeHash: string;
  }>;
}
