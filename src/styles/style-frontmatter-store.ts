import type { ArticleStyleConfig } from '../domain/style';
import type { VaultFileRef } from '../domain/ports';
import type { FrontmatterMutationPort } from '../publish/publish-state-store';
import { serializeArticleStyle } from './style-config';

export const ARTICLE_STYLE_FRONTMATTER_KEY = 'wechat-style';
export const ARTICLE_THEME_FRONTMATTER_KEY = 'wechat-theme-id';

export class StyleFrontmatterStore {
  constructor(private readonly frontmatter: FrontmatterMutationPort) {}

  async save(file: VaultFileRef, config: Readonly<ArticleStyleConfig>): Promise<void> {
    await this.frontmatter.processFrontmatter(file, value => {
      value[ARTICLE_THEME_FRONTMATTER_KEY] = config.themeId;
      value[ARTICLE_STYLE_FRONTMATTER_KEY] = serializeArticleStyle(config);
    });
  }
}
