import type {
  ArticleStyleConfig,
  FontFamilyId,
  FontSize,
  HeadingLevel,
  HeadingStyle,
  ImageCaptionMode,
  StyleParseResult,
} from '../domain/style';

const THEME_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const COLOR = /^#[0-9a-f]{6}$/iu;
const FONT_FAMILIES = new Set<FontFamilyId>(['sans-serif', 'serif', 'monospace']);
const FONT_SIZES = new Set<FontSize>([14, 15, 16, 17, 18]);
const HEADING_LEVELS: readonly HeadingLevel[] = Object.freeze(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const HEADING_STYLES = new Set<HeadingStyle>([
  'default', 'color-only', 'border-bottom', 'border-left',
]);
const CAPTION_MODES = new Set<ImageCaptionMode>([
  'title-alt', 'alt-title', 'title', 'alt', 'filename', 'none',
]);

const BASE_DEFAULTS = Object.freeze({
  version: 2 as const,
  themeId: 'doocs-classic',
  fontFamily: 'sans-serif' as const,
  fontSize: 16 as const,
  primaryColor: '#0F4C81',
  headingStyles: Object.freeze({
    h1: 'default', h2: 'default', h3: 'default',
    h4: 'default', h5: 'default', h6: 'default',
  }),
  codeThemeId: 'github-dark',
  showCodeLineNumbers: false,
  macCodeBlock: true,
  imageCaption: 'alt' as const,
  externalLinkCitation: false,
  paragraphIndent: false,
  textJustify: false,
  wordCount: false,
});

function freezeConfig(value: ArticleStyleConfig): Readonly<ArticleStyleConfig> {
  return Object.freeze({
    ...value,
    headingStyles: Object.freeze({ ...value.headingStyles }),
  });
}

export const DEFAULT_ARTICLE_STYLE: Readonly<ArticleStyleConfig> = freezeConfig({
  ...BASE_DEFAULTS,
});

export function defaultStyleForTheme(themeId: string): Readonly<ArticleStyleConfig> {
  const normalizedThemeId = THEME_ID.test(themeId) ? themeId : DEFAULT_ARTICLE_STYLE.themeId;
  return freezeConfig({
    ...BASE_DEFAULTS,
    themeId: normalizedThemeId,
  });
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function first(value: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (key in value) return value[key];
  }
  return undefined;
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizedThemeId(value: unknown, fallback: string): string {
  const candidate = stringValue(value, fallback).toLowerCase();
  return THEME_ID.test(candidate) ? candidate : fallback;
}

function normalizedFont(value: unknown, fallback: FontFamilyId): FontFamilyId {
  const candidate = stringValue(value, fallback) as FontFamilyId;
  return FONT_FAMILIES.has(candidate) ? candidate : fallback;
}

function normalizedFontSize(value: unknown, fallback: FontSize): FontSize {
  const candidate = typeof value === 'number'
    ? value
    : typeof value === 'string' && /^\d+$/u.test(value.trim())
      ? Number(value)
      : fallback;
  return FONT_SIZES.has(candidate as FontSize) ? candidate as FontSize : fallback;
}

function normalizedColor(value: unknown, fallback: string): string {
  const candidate = stringValue(value, fallback);
  return COLOR.test(candidate) ? candidate.toUpperCase() : fallback;
}

function normalizedHeadingStyles(value: unknown, fallback: ArticleStyleConfig['headingStyles']): ArticleStyleConfig['headingStyles'] {
  const source = record(value);
  const output: Partial<Record<HeadingLevel, HeadingStyle>> = {};
  for (const level of HEADING_LEVELS) {
    const candidate = source?.[level];
    const fallbackValue = fallback[level] ?? 'default';
    output[level] = typeof candidate === 'string' && HEADING_STYLES.has(candidate as HeadingStyle)
      ? candidate as HeadingStyle
      : fallbackValue;
  }
  return Object.freeze(Object.fromEntries(
    HEADING_LEVELS.map(level => [level, output[level]]),
  ) as Partial<Record<HeadingLevel, HeadingStyle>>);
}

function normalizedCaption(value: unknown, fallback: ImageCaptionMode): ImageCaptionMode {
  const candidate = stringValue(value, fallback) as ImageCaptionMode;
  return CAPTION_MODES.has(candidate) ? candidate : fallback;
}

function normalizedConfig(value: Record<string, unknown>, fallback: Readonly<ArticleStyleConfig>): Readonly<ArticleStyleConfig> {
  const headingValue = first(value, 'headingStyles', 'headings');
  return freezeConfig({
    version: 2,
    themeId: normalizedThemeId(first(value, 'themeId', 'theme'), fallback.themeId),
    fontFamily: normalizedFont(first(value, 'fontFamily', 'font'), fallback.fontFamily),
    fontSize: normalizedFontSize(first(value, 'fontSize', 'font-size'), fallback.fontSize),
    primaryColor: normalizedColor(first(value, 'primaryColor', 'primary-color'), fallback.primaryColor),
    headingStyles: normalizedHeadingStyles(headingValue, fallback.headingStyles),
    codeThemeId: normalizedThemeId(first(value, 'codeThemeId', 'code-theme'), fallback.codeThemeId),
    showCodeLineNumbers: booleanValue(
      first(value, 'showCodeLineNumbers', 'code-line-numbers'),
      fallback.showCodeLineNumbers,
    ),
    macCodeBlock: booleanValue(
      first(value, 'macCodeBlock', 'mac-code-block'),
      fallback.macCodeBlock,
    ),
    imageCaption: normalizedCaption(
      first(value, 'imageCaption', 'image-caption'),
      fallback.imageCaption,
    ),
    externalLinkCitation: booleanValue(
      first(value, 'externalLinkCitation', 'external-link-citation'),
      fallback.externalLinkCitation,
    ),
    paragraphIndent: booleanValue(
      first(value, 'paragraphIndent', 'paragraph-indent'),
      fallback.paragraphIndent,
    ),
    textJustify: booleanValue(
      first(value, 'textJustify', 'text-justify'),
      fallback.textJustify,
    ),
    wordCount: booleanValue(
      first(value, 'wordCount', 'word-count'),
      fallback.wordCount,
    ),
  });
}

export function parseArticleStyle(
  value: unknown,
  fallback: Readonly<ArticleStyleConfig> = DEFAULT_ARTICLE_STYLE,
): StyleParseResult {
  if (value === undefined || value === null) {
    return Object.freeze({ status: 'missing', config: null, version: null });
  }
  const source = record(value);
  if (source === null) return Object.freeze({ status: 'unsupported', config: null, version: 0 });
  const version = typeof source.version === 'number' && Number.isInteger(source.version)
    ? source.version
    : 1;
  if (version !== 1 && version !== 2) return Object.freeze({ status: 'unsupported', config: null, version });
  return Object.freeze({
    status: 'valid',
    config: normalizedConfig(source, fallback),
    version,
  });
}

export function patchArticleStyle(
  current: Readonly<ArticleStyleConfig>,
  patch: Readonly<Partial<Omit<ArticleStyleConfig, 'version' | 'headingStyles'>> & {
    headingStyles?: ArticleStyleConfig['headingStyles'];
  }>,
): Readonly<ArticleStyleConfig> {
  const parsed = parseArticleStyle({
    ...current,
    ...patch,
    headingStyles: patch.headingStyles === undefined
      ? current.headingStyles
      : { ...current.headingStyles, ...patch.headingStyles },
  }, current);
  if (parsed.status !== 'valid') throw new Error('Style patch produced an invalid configuration.');
  return parsed.config;
}

export function serializeArticleStyle(config: Readonly<ArticleStyleConfig>): Readonly<Record<string, unknown>> {
  return Object.freeze({
    version: 2,
    theme: config.themeId,
    font: config.fontFamily,
    'font-size': config.fontSize,
    'primary-color': config.primaryColor,
    headings: Object.freeze({ ...config.headingStyles }),
    'code-theme': config.codeThemeId,
    'code-line-numbers': config.showCodeLineNumbers,
    'mac-code-block': config.macCodeBlock,
    'image-caption': config.imageCaption,
    'external-link-citation': config.externalLinkCitation,
    'paragraph-indent': config.paragraphIndent,
    'text-justify': config.textJustify,
    'word-count': config.wordCount,
  });
}
