import type { NoteSnapshot } from '../domain/article';
import type { ArticleStyleConfig } from '../domain/style';
import type { ThemeDefinition } from '../domain/theme';
import type { VaultFileRef } from '../domain/ports';
import type { PluginSettings } from '../settings/model';
import { StyleCompiler } from './style-compiler';
import { defaultStyleForTheme } from './style-config';
import { StyleFrontmatterStore } from './style-frontmatter-store';
import { StyleResolver, type ResolvedArticleStyle } from './style-resolver';

export interface StyleGlobalSettingsPort {
  get(): Readonly<Pick<PluginSettings, 'defaultStyle' | 'recentStyles'>>;
  update(
    patch: Readonly<Partial<Pick<PluginSettings, 'defaultStyle' | 'recentStyles'>>>,
  ): Promise<void>;
}

export interface StyleThemeRegistryPort {
  get(id: string): Readonly<ThemeDefinition> | undefined;
}

export class StyleWorkflowError extends Error {
  constructor(readonly code: 'STYLE_THEME_NOT_FOUND', message: string) {
    super(message);
    this.name = 'StyleWorkflowError';
  }
}

export class StyleWorkflow {
  constructor(
    private readonly resolver: StyleResolver,
    private readonly settings: StyleGlobalSettingsPort,
    private readonly themes: StyleThemeRegistryPort,
    private readonly compiler: StyleCompiler,
    private readonly frontmatter: StyleFrontmatterStore,
  ) {}

  resolve(snapshot: Readonly<NoteSnapshot>): Readonly<ResolvedArticleStyle> {
    const global = this.settings.get();
    return this.resolver.resolve({
      frontmatter: snapshot.frontmatter,
      selectedThemeId: snapshot.selectedThemeId,
      defaultStyle: global.defaultStyle,
    });
  }

  materialize(resolved: Readonly<ResolvedArticleStyle>): Readonly<ThemeDefinition> {
    const baseTheme = this.themes.get(resolved.themeId);
    if (baseTheme === undefined) {
      throw new StyleWorkflowError('STYLE_THEME_NOT_FOUND', `排版主题不存在：${resolved.themeId}`);
    }
    return resolved.renderMode === 'legacy'
      ? baseTheme
      : this.compiler.compile(baseTheme, resolved.config);
  }

  async saveArticle(file: VaultFileRef, config: Readonly<ArticleStyleConfig>): Promise<void> {
    await this.frontmatter.save(file, config);
    const current = this.settings.get();
    await this.settings.update({
      recentStyles: Object.freeze({ ...current.recentStyles, [config.themeId]: config }),
    });
  }

  async setGlobalDefault(config: Readonly<ArticleStyleConfig>): Promise<void> {
    const current = this.settings.get();
    await this.settings.update({
      defaultStyle: config,
      recentStyles: Object.freeze({ ...current.recentStyles, [config.themeId]: config }),
    });
  }

  reset(themeId: string): Readonly<ArticleStyleConfig> {
    return defaultStyleForTheme(themeId);
  }
}
