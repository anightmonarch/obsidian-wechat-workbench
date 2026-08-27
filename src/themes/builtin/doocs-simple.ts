import type { ThemeManifest } from '../../domain/theme';
import { DOOCS_COMMON_CSS } from './doocs-base';

export const DOOCS_SIMPLE_MANIFEST: ThemeManifest = Object.freeze({
  id: 'doocs-simple',
  name: '简洁',
  version: '1.0.0',
  author: 'Doocs / WeChat Workbench',
  description: 'Doocs 简洁主题的本地安全适配版。',
});

export const DOOCS_SIMPLE_CSS = `${DOOCS_COMMON_CSS}
.wechat-article h1 { padding: 0.5em 1em; margin: 2em auto 1em; color: #333333; font-size: 1.4em; font-weight: bold; text-align: center; text-shadow: 1px 1px 3px rgba(0, 0, 0, 0.05); }
.wechat-article h2 { padding: 0.3em 1.2em; margin: 2em auto 1em; color: #ffffff; background: #0F4C81; border-radius: 8px 24px 8px 24px; font-size: 1.3em; text-align: center; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06); }
.wechat-article h3 { padding: 0.2em 0 0.2em 12px; margin: 2em 8px 0.75em 0; color: #333333; background: #f3f7fb; border: 1px solid #dce8f2; border-left: 4px solid #0F4C81; border-radius: 6px; font-size: 1.2em; line-height: 1.8em; }
.wechat-article h4, .wechat-article h5, .wechat-article h6 { color: #0F4C81; font-size: 1.1em; }
.wechat-article blockquote { padding: 1em 1em 1em 2em; color: rgba(0, 0, 0, 0.6); background: #fafbfd; border-top: 1px solid #edf0f4; border-right: 1px solid #edf0f4; border-bottom: 1px solid #edf0f4; border-left-width: 2px; font-style: italic; }
.wechat-article code:not(pre code) { font-family: Menlo, Consolas, monospace; border-radius: 6px; }
.wechat-article pre { border: 1px solid #edf0f4; }
.wechat-article img { border: 1px solid #edf0f4; border-radius: 8px; }
.wechat-article ul { list-style: disc; }
.wechat-article li { margin: 0.5em 8px; }
`;
