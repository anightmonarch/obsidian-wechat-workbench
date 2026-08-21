export type FontFamilyId = 'sans-serif' | 'serif' | 'monospace';
export type FontSize = 14 | 15 | 16 | 17 | 18;
export type HeadingLevel = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
export type HeadingStyle = 'default' | 'color-only' | 'border-bottom' | 'border-left';
export type ImageCaptionMode = 'title-alt' | 'alt-title' | 'title' | 'alt' | 'filename' | 'none';

export interface ArticleStyleConfig {
  version: 1;
  themeId: string;
  fontFamily: FontFamilyId;
  fontSize: FontSize;
  primaryColor: string;
  headingStyles: Readonly<Partial<Record<HeadingLevel, HeadingStyle>>>;
  codeThemeId: string;
  showCodeLineNumbers: boolean;
  macCodeBlock: boolean;
  imageCaption: ImageCaptionMode;
  paragraphIndent: boolean;
  textJustify: boolean;
}

export type StyleParseResult =
  | Readonly<{ status: 'missing'; config: null; version: null }>
  | Readonly<{ status: 'valid'; config: Readonly<ArticleStyleConfig>; version: 1 }>
  | Readonly<{ status: 'unsupported'; config: null; version: number }>;
