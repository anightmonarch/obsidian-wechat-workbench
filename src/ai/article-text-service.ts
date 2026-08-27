import type { ArticleDraftValues, NoteSnapshot } from '../domain/article';
import type { RenderArtifact } from '../domain/artifact';
import { aiSecretKind } from '../settings/ai-service-settings';
import { resolveAiService, type PluginSettings } from '../settings/model';
import type { SecretKind } from '../settings/secret-store';
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
  get(): Readonly<Partial<Pick<PluginSettings, 'textApiEndpoint' | 'textApiModel' | 'aiProviders'>>>;
}

interface TextSecretPort {
  get(kind?: Extract<SecretKind, 'textAgnesApiKey' | 'textDeepseekApiKey'>): string | null;
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
    const service = settings.aiProviders === undefined ? null : resolveAiService({ aiProviders: settings.aiProviders }, 'text');
    const context: Readonly<AiArticleContext> = buildAiArticleContext({
      snapshot: input.snapshot,
      artifact: input.artifact,
      draft: input.draft,
      purpose,
    });
    return Object.freeze({
      endpoint: service?.endpoint ?? settings.textApiEndpoint ?? '',
      model: service?.model ?? settings.textApiModel ?? '',
      apiKey: service === null ? this.secret.get() ?? '' : this.secret.get(aiSecretKind('text', service.provider)) ?? '',
      context,
    });
  }
}
