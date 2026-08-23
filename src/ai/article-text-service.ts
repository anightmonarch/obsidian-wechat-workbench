import type { ArticleDraftValues, NoteSnapshot } from '../domain/article';
import type { RenderArtifact } from '../domain/artifact';
import type { PluginSettings } from '../settings/model';
import { buildAiArticleContext, type AiArticleContext } from './article-context';
import type { AiTextGenerationRequest, AiTextGenerator } from './openai-text-generator';

export interface ArticleTextGenerationInput {
  snapshot: Readonly<NoteSnapshot>;
  artifact: Readonly<RenderArtifact>;
  draft: Readonly<ArticleDraftValues>;
}

export interface ArticleTextGenerationPort {
  generateTitles(input: Readonly<ArticleTextGenerationInput>): Promise<readonly string[]>;
  generateDigest(input: Readonly<ArticleTextGenerationInput>): Promise<string>;
}

interface TextSettingsPort {
  get(): Readonly<Pick<PluginSettings, 'textApiEndpoint' | 'textApiModel'>>;
}

interface TextSecretPort {
  get(): string | null;
}

export class ArticleTextGenerationService implements ArticleTextGenerationPort {
  constructor(
    private readonly settings: TextSettingsPort,
    private readonly secret: TextSecretPort,
    private readonly generator: AiTextGenerator,
  ) {}

  async generateTitles(input: Readonly<ArticleTextGenerationInput>): Promise<readonly string[]> {
    return this.generator.generateTitles(this.request(input, 'title'));
  }

  async generateDigest(input: Readonly<ArticleTextGenerationInput>): Promise<string> {
    return this.generator.generateDigest(this.request(input, 'digest'));
  }

  private request(
    input: Readonly<ArticleTextGenerationInput>,
    purpose: 'title' | 'digest',
  ): Readonly<AiTextGenerationRequest> {
    const settings = this.settings.get();
    const context: Readonly<AiArticleContext> = buildAiArticleContext({
      snapshot: input.snapshot,
      artifact: input.artifact,
      draft: input.draft,
      purpose,
    });
    return Object.freeze({
      endpoint: settings.textApiEndpoint,
      model: settings.textApiModel,
      apiKey: this.secret.get() ?? '',
      context,
    });
  }
}
