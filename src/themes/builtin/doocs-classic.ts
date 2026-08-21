import type { ThemeManifest } from '../../domain/theme';
import { DOOCS_COMMON_CSS } from './doocs-base';

export const DOOCS_CLASSIC_MANIFEST: ThemeManifest = Object.freeze({
  id: 'doocs-classic',
  name: '经典',
  version: '1.0.0',
  author: 'Doocs / WeChat Workbench',
  description: 'Doocs 经典主题的本地安全适配版。',
});

export const DOOCS_CLASSIC_CSS = `${DOOCS_COMMON_CSS}
.wechat-article h1 { display: table; padding: 0 1em; margin: 2em auto 1em; color: #333333; border-bottom: 2px solid #0F4C81; font-size: 1.2em; font-weight: bold; text-align: center; }
.wechat-article h2 { display: table; padding: 0 0.2em; margin: 4em auto 2em; color: #ffffff; background: #0F4C81; font-size: 1.2em; font-weight: bold; text-align: center; }
.wechat-article h3 { padding-left: 8px; margin: 2em 8px 0.75em 0; color: #333333; border-left: 3px solid #0F4C81; font-size: 1.1em; font-weight: bold; line-height: 1.2; }
.wechat-article h4 { margin: 2em 8px 0.5em; color: #0F4C81; font-size: 1em; font-weight: bold; }
.wechat-article h5 { margin: 1.5em 8px 0.5em; color: #0F4C81; font-size: 1em; font-weight: bold; }
.wechat-article h6 { margin: 1.5em 8px 0.5em; color: #0F4C81; font-size: 1em; }
`;
