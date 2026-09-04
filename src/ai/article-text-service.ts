import type { ArticleDraftValues, NoteSnapshot } from '../domain/article';
import type { RenderArtifact } from '../domain/artifact';
import { aiSecretKind } from '../settings/ai-service-settings';
import {
  resolveAiService,
  type GenerationBackend,
  type PluginSettings,
} from '../settings/model';
import type { SecretKind } from '../settings/secret-store';
import { buildAiArticleContext, type AiArticleContext } from './article-context';
import type { LocalTextGenerator } from './codex-text-generator';
import type { AiTextGenerationRequest, AiTextGenerator } from './openai-text-generator';

export interface ArticleTextGenerationInput {
  snapshot: Readonly<NoteSnapshot>;
  artifact: Readonly<RenderArtifact>;
  draft: Readonly<ArticleDraftValues>;
  backend?: GenerationBackend;
  signal?: AbortSignal;
}

export interface ArticleTextGenerationPort {
  defaultBackend(): GenerationBackend;
  generateTitles(input: Readonly<ArticleTextGenerationInput>): Promise<readonly string[]>;
  generateDigest(input: Readonly<ArticleTextGenerationInput>): Promise<string>;
}

interface TextSettingsPort {
  get(): Readonly<Pick<PluginSettings, 'aiProviders' | 'textGenerationBackend'>>;
}

interface TextSecretPort {
  get(kind?: Extract<SecretKind, 'textAgnesApiKey' | 'textDeepseekApiKey'>): string | null;
}

export class ArticleTextGenerationService implements ArticleTextGenerationPort {
  constructor(
    private readonly settings: TextSettingsPort,
    private readonly secret: TextSecretPort,
    private readonly generator: AiTextGenerator,
    private readonly localGenerator: LocalTextGenerator,
  ) {}

  defaultBackend(): GenerationBackend {
    return this.settings.get().textGenerationBackend;
  }

  async generateTitles(input: Readonly<ArticleTextGenerationInput>): Promise<readonly string[]> {
    const operation = this.operation(input, 'title');
    return operation.backend === 'codex'
      ? this.localGenerator.generateTitles({
        context: operation.context,
        ...(input.signal === undefined ? {} : { signal: input.signal }),
      })
      : this.generator.generateTitles(this.apiRequest(operation.settings, operation.context, input.signal));
  }

  async generateDigest(input: Readonly<ArticleTextGenerationInput>): Promise<string> {
    const operation = this.operation(input, 'digest');
    return operation.backend === 'codex'
      ? this.localGenerator.generateDigest({
        context: operation.context,
        ...(input.signal === undefined ? {} : { signal: input.signal }),
      })
      : this.generator.generateDigest(this.apiRequest(operation.settings, operation.context, input.signal));
  }

  private operation(
    input: Readonly<ArticleTextGenerationInput>,
    purpose: 'title' | 'digest',
  ): Readonly<{
    backend: GenerationBackend;
    context: Readonly<AiArticleContext>;
    settings: Readonly<Pick<PluginSettings, 'aiProviders' | 'textGenerationBackend'>>;
  }> {
    const settings = this.settings.get();
    const context: Readonly<AiArticleContext> = buildAiArticleContext({
      snapshot: input.snapshot,
      artifact: input.artifact,
      draft: input.draft,
      purpose,
    });
    return Object.freeze({
      backend: input.backend ?? settings.textGenerationBackend,
      context,
      settings,
    });
  }

  private apiRequest(
    settings: Readonly<Pick<PluginSettings, 'aiProviders'>>,
    context: Readonly<AiArticleContext>,
    signal?: AbortSignal,
  ): Readonly<AiTextGenerationRequest> {
    const service = resolveAiService(settings, 'text');
    return Object.freeze({
      endpoint: service?.endpoint ?? '',
      model: service?.model ?? '',
      apiKey: service === null ? '' : this.secret.get(aiSecretKind('text', service.provider)) ?? '',
      context,
      ...(signal === undefined ? {} : { signal }),
    });
  }
}
