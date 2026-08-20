import type { ThemeManifest } from '../../domain/theme';

export const TECHNICAL_MANIFEST: ThemeManifest = Object.freeze({
  id: 'technical',
  name: '技术文档',
  version: '1.0.0',
  author: 'WeChat Workbench',
  description: 'A compact technical theme optimized for code and structured notes.',
});

export const TECHNICAL_CSS = `.wechat-article { color: #20242a; font-size: 15px; line-height: 1.75; }
.wechat-article h1 { margin: 1.4em 0 0.75em; font-size: 1.5em; }
.wechat-article h2 { margin: 1.3em 0 0.65em; padding-left: 0.65em; font-size: 1.25em; border-left: 4px solid #3d6fb4; }
.wechat-article p { margin: 0.85em 0; }
.wechat-article pre { margin: 1em 0; padding: 1em; overflow: auto; background: #f4f6f8; border: 1px solid #d9dee5; border-radius: 6px; }
.wechat-article code { font-family: Menlo, Consolas, monospace; font-size: 0.9em; }
.wechat-article img { max-width: 100%; height: auto; }`;
