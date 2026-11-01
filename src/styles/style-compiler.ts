import { createHash } from 'node:crypto';

import type { Diagnostic } from '../domain/artifact';
import type { ArticleStyleConfig, HeadingLevel, HeadingStyle } from '../domain/style';
import type { ThemeDefinition } from '../domain/theme';
import { validateThemePack } from '../themes/theme-validator';
import { CodeThemeRegistry } from './code-theme-registry';
import { serializeArticleStyle } from './style-config';

const FONT_STACKS: Readonly<Record<ArticleStyleConfig['fontFamily'], string>> = Object.freeze({
  'sans-serif': '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
  serif: 'Georgia, "Times New Roman", "Songti SC", SimSun, serif',
  monospace: 'Menlo, Monaco, Consolas, "SFMono-Regular", monospace',
});

const HEADING_LEVELS: readonly HeadingLevel[] = Object.freeze(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

export class StyleCompileError extends Error {
  readonly code = 'STYLE_CSS_INVALID';

  constructor(readonly diagnostics: readonly Diagnostic[]) {
    super('Compiled article style failed CSS validation.');
    this.name = 'StyleCompileError';
  }
}

function headingOverride(
  level: HeadingLevel,
  style: HeadingStyle,
  primaryColor: string,
): string {
  switch (style) {
    case 'color-only':
      return `.wechat-article ${level} { display: block; padding: 0; background: transparent; border: 0; border-radius: 0; box-shadow: none; color: ${primaryColor}; text-align: left; }`;
    case 'border-bottom':
      return `.wechat-article ${level} { display: block; padding: 0 0 0.3em; background: transparent; border: 0; border-bottom: 2px solid ${primaryColor}; border-radius: 0; box-shadow: none; color: ${primaryColor}; text-align: left; }`;
    case 'border-left':
      return `.wechat-article ${level} { display: block; padding: 0 0 0 0.7em; background: transparent; border: 0; border-left: 4px solid ${primaryColor}; border-radius: 0; box-shadow: none; color: ${primaryColor}; text-align: left; }`;
    case 'default':
      return '';
  }
}

function primaryColorOverrides(primaryColor: string): string {
  return `.wechat-article h1 { border-bottom-color: ${primaryColor}; }
.wechat-article h2 { background-color: ${primaryColor}; }
.wechat-article h3 { border-left-color: ${primaryColor}; }
.wechat-article h4, .wechat-article h5, .wechat-article h6, .wechat-article strong { color: ${primaryColor}; }
.wechat-article h1 strong, .wechat-article h2 strong, .wechat-article h3 strong, .wechat-article h4 strong, .wechat-article h5 strong, .wechat-article h6 strong { color: inherit; }
.wechat-article code:not(pre code) { color: ${primaryColor}; border-color: ${primaryColor}; }`;
}

const WECHAT_LINK_BLUE = '#576b95';

function linkColorValue(config: Readonly<ArticleStyleConfig>): string {
  if (config.linkColor === 'primary') return config.primaryColor;
  if (config.linkColor === 'inherit') return 'inherit';
  return WECHAT_LINK_BLUE;
}

function blockquoteBackgroundCss(config: Readonly<ArticleStyleConfig>): string {
  if (config.blockquoteBackground === 'transparent') {
    return '.wechat-article blockquote { background: transparent; }';
  }
  if (config.blockquoteBackground === 'primary') {
    return `.wechat-article blockquote { background: color-mix(in srgb, ${config.primaryColor} 8%, transparent); }`;
  }
  return '';
}

function scaleLength(length: string, spacing: number): string {
  const match = /^(-?\d+(?:\.\d+)?)(em|px|rem|%)$/u.exec(length);
  if (match === null) return length;
  const scaled = Math.round(Number(match[1]) * spacing * 10000) / 10000;
  return `${scaled}${match[2]}`;
}

export function scaleMarginValue(value: string, spacing: number): string {
  const parts = value.trim().split(/\s+/u);
  if (parts.length === 0) return value;
  const verticalIndexes = parts.length === 3 || parts.length === 4 ? [0, 2] : [0];
  const next = [...parts];
  for (const index of verticalIndexes) {
    const part = next[index];
    if (part !== undefined) next[index] = scaleLength(part, spacing);
  }
  return next.join(' ');
}

function scaleVerticalMargins(css: string, spacing: number): string {
  if (spacing === 1) return css;
  return css.replace(/margin:\s*([^;{}]+);/gu, (_full, value: string) => `margin: ${scaleMarginValue(value, spacing)};`);
}

function styleOverrides(config: Readonly<ArticleStyleConfig>): string {
  const headingCss = HEADING_LEVELS
    .map(level => headingOverride(level, config.headingStyles[level] ?? 'default', config.primaryColor))
    .filter(Boolean)
    .join('\n');
  const indent = config.paragraphIndent ? '2em' : '0';
  const alignment = config.textJustify ? 'justify' : 'left';
  const quoteBackground = blockquoteBackgroundCss(config);
  return `.wechat-article { font-family: ${FONT_STACKS[config.fontFamily]}; font-size: ${config.fontSize}px; line-height: ${config.lineHeight}; }
.wechat-article p { text-indent: ${indent}; text-align: ${alignment}; }
.wechat-article a { color: ${linkColorValue(config)}; }
${primaryColorOverrides(config.primaryColor)}
${headingCss}
${quoteBackground}`;
}

function structuralCss(config: Readonly<ArticleStyleConfig>): string {
  const spacing = config.blockSpacing;
  const codeScrollCss = `.wechat-article pre { overflow-x: auto; }
.wechat-article pre > code { overflow-x: auto; overflow-wrap: normal; white-space: pre; word-break: keep-all; }
.wechat-article .code-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
.wechat-article .code-line-block { display: block; min-height: 1.5em; white-space: pre; }
.wechat-article p.math-display, .wechat-article .math-display { margin: 1.25em 0; text-align: center; text-indent: 0; letter-spacing: 0.04em; }
.wechat-article .math-display .katex-display { display: inline-block; text-align: center; margin-left: auto; margin-right: auto; }
.wechat-article mark, .wechat-article mark.obsidian-highlight { background: #fff3a3; color: inherit; padding: 0.1em 0.25em; border-radius: 2px; }`;
  // Mac header chrome + spacer for draft layout. Never style a fake copy control —
  // WeChat strips JS; preview owns the live clipboard button.
  // Mac dots stay WeChat-safe: inline-block + margin (flex/gap/absolute get stripped).
  const codeChromeCss = `.wechat-article pre .code-window-chrome { display: block; overflow: hidden; margin: 0; padding: 0 0 0.35em; }
.wechat-article pre .code-window-chrome-spacer { display: block; min-height: 1.35em; height: 1.35em; line-height: 1.35em; font-size: 12px; overflow: hidden; white-space: pre; }`;
  const macCss = config.macCodeBlock
    ? `.wechat-article pre.code-window { padding: 0; }
.wechat-article pre.code-window > code { display: block; padding: 1em; }
.wechat-article pre.code-window .code-window-dots { float: left; font-size: 0; line-height: 0; }
.wechat-article pre.code-window .code-window-dot { display: inline-block; width: 0.55em; height: 0.55em; border-radius: 50%; margin-right: 0.35em; font-size: 12px; line-height: 0.55em; overflow: hidden; vertical-align: top; }
.wechat-article pre.code-window .code-window-dot--red { background: #ff5f57; }
.wechat-article pre.code-window .code-window-dot--yellow { background: #febc2e; }
.wechat-article pre.code-window .code-window-dot--green { background: #28c840; }`
    : '';
  const lineNumberCss = config.showCodeLineNumbers
    ? `.wechat-article pre .code-line { display: flex; align-items: baseline; min-height: 1.5em; line-height: 1.5; }
.wechat-article pre .code-line-number { flex: 0 0 2.5em; margin-right: 1em; color: #8892a0; text-align: right; user-select: none; }
.wechat-article pre .code-line-content { flex: 1 1 auto; min-width: 0; }`
    : '';
  return `${codeScrollCss}
${codeChromeCss}
${macCss}
${lineNumberCss}
.wechat-article figure.image-figure { margin: ${scaleMarginValue('1.5em 0', spacing)}; }
.wechat-article figcaption.image-caption { margin-top: 0.45em; color: #777777; font-size: 0.8em; text-align: center; }
.wechat-article blockquote.reading-summary { margin: ${scaleMarginValue('1em 0', spacing)}; padding: 0.85em 1em; border-left: 4px solid ${config.primaryColor}; background: #f4f7fb; }
.wechat-article blockquote.reading-summary > p { margin: 0; }
.wechat-article section.external-link-references { margin-top: 2em; padding-top: 1em; border-top: 1px solid #d9dfe7; font-size: 0.9em; }
.wechat-article section.external-link-references h4 { margin: 0 0 0.5em; }
.wechat-article section.external-link-references ol { margin: 0; padding-left: 1.5em; }
.wechat-article section.external-link-references a { overflow-wrap: anywhere; }
.wechat-article sup.external-link-reference { margin-left: 0.15em; color: ${config.primaryColor}; font-size: 0.75em; }`;
}

function canonicalConfig(config: Readonly<ArticleStyleConfig>): string {
  return JSON.stringify(serializeArticleStyle(config));
}

export class StyleCompiler {
  constructor(private readonly codeThemes: Readonly<Pick<CodeThemeRegistry, 'get'>> = new CodeThemeRegistry()) {}

  compile(
    baseTheme: Readonly<ThemeDefinition>,
    config: Readonly<ArticleStyleConfig>,
  ): Readonly<ThemeDefinition> {
    const themedCss = scaleVerticalMargins(baseTheme.css, config.blockSpacing);
    const mergedCss = [
      themedCss,
      styleOverrides(config),
      this.codeThemes.get(config.codeThemeId),
      structuralCss(config),
    ].filter(Boolean).join('\n');
    const validation = validateThemePack(baseTheme.manifest, mergedCss);
    if (!validation.ok) throw new StyleCompileError(validation.diagnostics);

    const normalizedCss = validation.css.replace(/\r\n/gu, '\n').trim();
    const contentHash = createHash('sha256')
      .update(baseTheme.contentHash)
      .update(canonicalConfig(config))
      .update(normalizedCss)
      .digest('hex');
    return Object.freeze({
      ...baseTheme,
      css: normalizedCss,
      contentHash,
      compiledStyle: Object.freeze({
        config,
        baseThemeHash: baseTheme.contentHash,
      }),
    });
  }
}
