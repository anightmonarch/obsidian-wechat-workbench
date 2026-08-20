import type { ThemeManifest } from '../../domain/theme';

export const EDITORIAL_MANIFEST: ThemeManifest = Object.freeze({
  id: 'editorial',
  name: '编辑精选',
  version: '1.0.0',
  author: 'WeChat Workbench',
  description: 'A book-like editorial theme for long-form articles.',
});

export const EDITORIAL_CSS = `.wechat-article { color: #292724; font-family: Georgia, serif; font-size: 16px; line-height: 1.85; }
.wechat-article h1 { margin: 1.6em 0 0.9em; font-size: 1.65em; text-align: center; }
.wechat-article h2 { margin: 1.5em 0 0.8em; font-size: 1.28em; text-align: center; }
.wechat-article p { margin: 1em 0; text-align: justify; }
.wechat-article blockquote { margin: 1.2em 0; padding: 0.8em 1.2em; color: #615b54; border-top: 1px solid #c8c0b6; border-bottom: 1px solid #c8c0b6; }
.wechat-article img { max-width: 100%; height: auto; }`;
