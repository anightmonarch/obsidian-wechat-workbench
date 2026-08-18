import type { ThemeManifest } from '../../domain/theme';

export const NATIVE_MANIFEST: ThemeManifest = Object.freeze({
  id: 'native',
  name: 'Native',
  version: '1.0.0',
  author: 'WeChat Workbench',
  description: 'Clean typography close to the native WeChat reading experience.',
});

export const NATIVE_CSS = `.wechat-article { color: #242424; font-size: 16px; line-height: 1.75; }
.wechat-article h1 { margin: 1.4em 0 0.8em; font-size: 1.55em; line-height: 1.35; }
.wechat-article h2 { margin: 1.35em 0 0.7em; font-size: 1.3em; line-height: 1.4; }
.wechat-article p { margin: 0.9em 0; }
.wechat-article blockquote { margin: 1em 0; padding: 0.2em 1em; color: #666666; border-left: 3px solid #d9d9d9; }
.wechat-article img { max-width: 100%; height: auto; }`;
