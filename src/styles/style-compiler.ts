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
.wechat-article a { color: ${primaryColor}; }
.wechat-article code:not(pre code) { color: ${primaryColor}; border-color: ${primaryColor}; }`;
}

function styleOverrides(config: Readonly<ArticleStyleConfig>): string {
  const headingCss = HEADING_LEVELS
    .map(level => headingOverride(level, config.headingStyles[level] ?? 'default', config.primaryColor))
    .filter(Boolean)
    .join('\n');
  const indent = config.paragraphIndent ? '2em' : '0';
  const alignment = config.textJustify ? 'justify' : 'left';
  return `.wechat-article { font-family: ${FONT_STACKS[config.fontFamily]}; font-size: ${config.fontSize}px; line-height: 1.75; }
.wechat-article p { text-indent: ${indent}; text-align: ${alignment}; }
${primaryColorOverrides(config.primaryColor)}
${headingCss}`;
}

function structuralCss(config: Readonly<ArticleStyleConfig>): string {
  const macCss = config.macCodeBlock
    ? `.wechat-article pre.code-window { padding-top: 1.8em; position: relative; }
.wechat-article pre.code-window .code-window-dots { position: absolute; top: 0.7em; left: 0.9em; display: inline-flex; gap: 0.35em; }
.wechat-article pre.code-window .code-window-dot { display: block; width: 0.55em; height: 0.55em; border-radius: 50%; }
.wechat-article pre.code-window .code-window-dot--red { background: #ff5f57; }
.wechat-article pre.code-window .code-window-dot--yellow { background: #febc2e; }
.wechat-article pre.code-window .code-window-dot--green { background: #28c840; }`
    : '';
  const lineNumberCss = config.showCodeLineNumbers
    ? `.wechat-article pre .code-line { display: flex; min-height: 1.5em; }
.wechat-article pre .code-line-number { flex: 0 0 2.5em; margin-right: 1em; color: #8892a0; text-align: right; user-select: none; }
.wechat-article pre .code-line-content { flex: 1 1 auto; min-width: 0; }`
    : '';
  return `${macCss}
${lineNumberCss}
.wechat-article figure.image-figure { margin: 1.5em 8px; }
.wechat-article figcaption.image-caption { margin-top: 0.45em; color: #777777; font-size: 0.8em; text-align: center; }`;
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
    const mergedCss = [
      baseTheme.css,
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
