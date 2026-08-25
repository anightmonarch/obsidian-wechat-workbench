import type { ThemeManifest } from '../../domain/theme';
import { DOOCS_COMMON_CSS } from './doocs-base';

export const DOOCS_GRACE_MANIFEST: ThemeManifest = Object.freeze({
  id: 'doocs-grace',
  name: '优雅',
  version: '1.0.0',
  author: 'Doocs, Doocs / WeChat Workbench',
  description: 'Doocs 优雅主题的本地安全适配版。',
});

export const DOOCS_GRACE_CSS = `${DOOCS_COMMON_CSS}
.wechat-article h1 { padding: 0.5em 1em; margin: 2em auto 1em; color: #333333; border-bottom: 2px solid #0F4C81; font-size: 1.4em; font-weight: bold; text-align: center; text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.1); }
.wechat-article h2 { padding: 0.3em 1em; margin: 2em auto 1em; color: #ffffff; background: #0F4C81; border-radius: 8px; font-size: 1.3em; text-align: center; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); }
.wechat-article h3 { padding: 0 0 0 12px; margin: 2em 8px 0.75em 0; border-left: 4px solid #0F4C81; border-bottom: 1px dashed #0F4C81; font-size: 1.2em; }
.wechat-article h4 { margin: 2em 8px 0.5em; color: #0F4C81; font-size: 1.1em; }
.wechat-article h5, .wechat-article h6 { color: #0F4C81; font-size: 1em; }
.wechat-article blockquote { padding: 1em 1em 1em 2em; color: rgba(0, 0, 0, 0.6); background: #f7f9fc; border-left-width: 4px; font-style: italic; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05); }
.wechat-article code:not(pre code) { font-family: Menlo, Consolas, monospace; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08); }
.wechat-article pre { box-shadow: inset 0 0 10px rgba(0, 0, 0, 0.05); }
.wechat-article img { border-radius: 8px; box-shadow: 0 6px 18px rgba(15, 23, 42, 0.22); }
.wechat-article ul { list-style: none; }
.wechat-article li { margin: 0.5em 8px; }
`;
