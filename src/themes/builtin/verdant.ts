import type { ThemeManifest } from '../../domain/theme';

export const VERDANT_MANIFEST: ThemeManifest = Object.freeze({
  id: 'verdant',
  name: '苍绿',
  version: '1.0.0',
  author: 'WeChat Workbench',
  description: 'A restrained green theme with clear section hierarchy.',
});

export const VERDANT_CSS = `.wechat-article { color: #26332b; font-size: 16px; line-height: 1.8; }
.wechat-article h1 { margin: 1.5em 0 0.8em; color: #16794b; font-size: 1.55em; }
.wechat-article h2 { margin: 1.4em 0 0.75em; padding-bottom: 0.3em; color: #1f8f5a; font-size: 1.3em; border-bottom: 2px solid #8fd3ad; }
.wechat-article p { margin: 0.95em 0; }
.wechat-article strong { color: #12653f; }
.wechat-article blockquote { margin: 1em 0; padding: 0.7em 1em; background: #f1faf5; border-left: 3px solid #2da66a; }
.wechat-article img { max-width: 100%; height: auto; }`;
