import type { ArticleStyleConfig } from '../domain/style';
import { defaultStyleForTheme, parseArticleStyle } from './style-config';

export interface StyleResolveInput {
  frontmatter: Readonly<Record<string, unknown>>;
  selectedThemeId: string;
  defaultStyle: Readonly<ArticleStyleConfig>;
}

export interface ResolvedArticleStyle {
  source: 'article' | 'legacy' | 'global' | 'unsupported-fallback';
  renderMode: 'compiled' | 'legacy';
  themeId: string;
  config: Readonly<ArticleStyleConfig>;
  unsupportedVersion: number | null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export class StyleResolver {
  resolve(input: Readonly<StyleResolveInput>): Readonly<ResolvedArticleStyle> {
    const articleValue = input.frontmatter['wechat-style'];
    if (articleValue !== undefined && articleValue !== null) {
      const parsed = parseArticleStyle(articleValue, input.defaultStyle);
      if (parsed.status === 'valid') {
        return Object.freeze({
          source: 'article',
          renderMode: 'compiled',
          themeId: parsed.config.themeId,
          config: parsed.config,
          unsupportedVersion: null,
        });
      }
      return Object.freeze({
        source: 'unsupported-fallback',
        renderMode: 'compiled',
        themeId: input.defaultStyle.themeId,
        config: input.defaultStyle,
        unsupportedVersion: parsed.version,
      });
    }

    const legacyThemeId = text(input.frontmatter['wechat-theme-id']);
    if (legacyThemeId.length > 0) {
      const config = defaultStyleForTheme(legacyThemeId);
      return Object.freeze({
        source: 'legacy',
        renderMode: 'legacy',
        themeId: legacyThemeId,
        config,
        unsupportedVersion: null,
      });
    }

    return Object.freeze({
      source: 'global',
      renderMode: 'compiled',
      themeId: input.defaultStyle.themeId,
      config: input.defaultStyle,
      unsupportedVersion: null,
    });
  }
}
