import type { ArticleStyleConfig } from '../domain/style';

export interface StyleResolveInput {
  defaultStyle: Readonly<ArticleStyleConfig>;
}

export interface ResolvedArticleStyle {
  source: 'global';
  renderMode: 'compiled' | 'legacy';
  themeId: string;
  config: Readonly<ArticleStyleConfig>;
}

export class StyleResolver {
  resolve(input: Readonly<StyleResolveInput>): Readonly<ResolvedArticleStyle> {
    return Object.freeze({
      source: 'global' as const,
      renderMode: 'compiled' as const,
      themeId: input.defaultStyle.themeId,
      config: input.defaultStyle,
    });
  }
}
