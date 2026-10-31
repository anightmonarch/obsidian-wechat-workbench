export type FontFamilyId = 'sans-serif' | 'serif' | 'monospace';
export type FontSize = 14 | 15 | 16 | 17 | 18;
export type HeadingLevel = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
export type HeadingStyle = 'default' | 'color-only' | 'border-bottom' | 'border-left';
export type ImageCaptionMode = 'title-alt' | 'alt-title' | 'title' | 'alt' | 'filename' | 'none';
export type LineHeight = 1.5 | 1.65 | 1.75 | 1.9 | 2.05;
export type BlockSpacing = 0.75 | 0.9 | 1 | 1.15 | 1.35;
export type LinkColorMode = 'wechat-blue' | 'primary' | 'inherit';
export type BlockquoteBackground = 'default' | 'transparent' | 'primary';

export interface ArticleStyleConfig {
  version: 3;
  themeId: string;
  fontFamily: FontFamilyId;
  fontSize: FontSize;
  primaryColor: string;
  headingStyles: Readonly<Partial<Record<HeadingLevel, HeadingStyle>>>;
  codeThemeId: string;
  showCodeLineNumbers: boolean;
  macCodeBlock: boolean;
  imageCaption: ImageCaptionMode;
  externalLinkCitation: boolean;
  paragraphIndent: boolean;
  textJustify: boolean;
  wordCount: boolean;
  lineHeight: LineHeight;
  blockSpacing: BlockSpacing;
  linkColor: LinkColorMode;
  blockquoteBackground: BlockquoteBackground;
}

export type StyleParseResult =
  | Readonly<{ status: 'missing'; config: null; version: null }>
  | Readonly<{ status: 'valid'; config: Readonly<ArticleStyleConfig>; version: 1 | 2 | 3 }>
  | Readonly<{ status: 'unsupported'; config: null; version: number }>;
