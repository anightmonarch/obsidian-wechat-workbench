import type { AiModelCatalogPort, AiModelOption, AiProviderProtocol } from '../cover/ai-provider';
import type { PluginSettings } from './model';

export class AiServiceSettingsError extends Error {
  constructor(readonly code:
    | 'AI_PROVIDER_URL_INVALID'
    | 'AI_PROVIDER_NEW_KEY_REQUIRED'
    | 'AI_MODEL_NOT_REFRESHED', message: string) {
    super(message);
    this.name = 'AiServiceSettingsError';
  }
}

function normalizedUrl(value: string): string {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.username.length > 0 || url.password.length > 0
      || url.search.length > 0 || url.hash.length > 0) {
      throw new AiServiceSettingsError('AI_PROVIDER_URL_INVALID', 'Provider URL is not a public HTTPS endpoint.');
    }
    return url.toString().replace(/\/$/u, '');
  } catch (error) {
    if (error instanceof AiServiceSettingsError) throw error;
    throw new AiServiceSettingsError('AI_PROVIDER_URL_INVALID', 'Provider URL is invalid.');
  }
}

export interface AiServiceInput {
  protocol: AiProviderProtocol;
  baseUrl: string;
  model: string;
  apiKey: string;
}

type ImageSecretKind = 'imageApiKey';

interface ImageSecretPort {
  get(kind: ImageSecretKind): string | null;
  set(kind: ImageSecretKind, value: string): void;
  clear(kind: ImageSecretKind): void;
}

interface SettingsPort {
  get(): Readonly<PluginSettings>;
  update(patch: Partial<PluginSettings>): Promise<Readonly<PluginSettings>>;
}

const AI_PROTOCOLS: readonly AiProviderProtocol[] = ['openai-compatible', 'anthropic'];

function isProtocol(value: unknown): value is AiProviderProtocol {
  return typeof value === 'string' && AI_PROTOCOLS.includes(value as AiProviderProtocol);
}

export class AiServiceSettingsService {
  private latestModels: readonly Readonly<AiModelOption>[] = [];
  private latestCatalogEndpoint: string | null = null;

  constructor(
    private readonly settings: SettingsPort,
    private readonly secrets: ImageSecretPort,
    private readonly catalog: AiModelCatalogPort,
  ) {}

  async refreshModels(
    input: Readonly<Omit<AiServiceInput, 'model'>>,
  ): Promise<readonly Readonly<AiModelOption>[]> {
    const baseUrl = normalizedUrl(input.baseUrl);
    const current = this.settings.get();
    let apiKey = input.apiKey.trim();
    const sameEndpoint = input.protocol === current.imageApiProtocol
      && baseUrl === current.imageApiBaseUrl;
    if (apiKey.length === 0) {
      if (!sameEndpoint) {
        throw new AiServiceSettingsError('AI_PROVIDER_NEW_KEY_REQUIRED', 'Changing protocol or service address requires a new API key.');
      }
      apiKey = this.secrets.get('imageApiKey') ?? '';
    }
    const models = Object.freeze(await this.catalog.list({
      protocol: input.protocol,
      baseUrl,
      apiKey,
    }));
    this.latestModels = models;
    this.latestCatalogEndpoint = endpointKey(input.protocol, baseUrl);
    return this.latestModels;
  }

  async save(input: Readonly<AiServiceInput>): Promise<Readonly<PluginSettings>> {
    const protocol = isProtocol(input.protocol) ? input.protocol : currentProtocol(this.settings.get());
    const baseUrl = normalizedUrl(input.baseUrl);
    const model = input.model.trim();
    const current = this.settings.get();
    const sameEndpoint = protocol === current.imageApiProtocol && baseUrl === current.imageApiBaseUrl;
    const allowed = this.latestCatalogEndpoint === endpointKey(protocol, baseUrl)
      && this.latestModels.some(option => option.id === model)
      || sameEndpoint && model === current.imageApiModel;
    if (!allowed) {
      throw new AiServiceSettingsError('AI_MODEL_NOT_REFRESHED', 'Select a model after refreshing the provider list.');
    }
    let previousKey = this.secrets.get('imageApiKey');
    if (!sameEndpoint) {
      if (input.apiKey.trim().length === 0) {
        throw new AiServiceSettingsError('AI_PROVIDER_NEW_KEY_REQUIRED', 'Changing protocol or service address requires a new API key.');
      }
      this.secrets.set('imageApiKey', input.apiKey.trim());
    }
    try {
      return await this.settings.update({
        imageApiProtocol: protocol,
        imageApiBaseUrl: baseUrl,
        imageApiModel: model,
      });
    } catch (error) {
      if (!sameEndpoint) {
        if (previousKey === null) this.secrets.clear('imageApiKey');
        else this.secrets.set('imageApiKey', previousKey);
      }
      throw error;
    } finally {
      previousKey = null;
    }
  }
}

function endpointKey(protocol: AiProviderProtocol, baseUrl: string): string {
  return `${protocol}\n${baseUrl}`;
}

function currentProtocol(settings: Readonly<PluginSettings>): AiProviderProtocol {
  return settings.imageApiProtocol;
}
