import type { AiModelCatalogPort, AiModelOption, AiProviderProtocol } from '../cover/ai-provider';
import type { PluginSettings } from './model';

export class AiServiceSettingsError extends Error {
  constructor(readonly code:
    | 'AI_ENDPOINT_INVALID'
    | 'AI_ENDPOINT_PATH_MISSING'
    | 'AI_ENDPOINT_NEW_KEY_REQUIRED'
    | 'AI_MODEL_MISSING'
    | 'AI_MODEL_DISCOVERY_REMOVED', message: string) {
    super(message);
    this.name = 'AiServiceSettingsError';
  }
}

export interface AiServiceInput {
  endpoint: string;
  model: string;
  apiKey: string;
}

interface LegacyAiServiceInput {
  protocol: AiProviderProtocol;
  baseUrl: string;
  model: string;
  apiKey: string;
}

type AiServiceKind = 'text' | 'image';
type AiSecretKind = 'textApiKey' | 'imageApiKey';

interface AiSecretPort {
  get(kind: AiSecretKind): string | null;
  set(kind: AiSecretKind, value: string): void;
  clear(kind: AiSecretKind): void;
}

interface SettingsPort {
  get(): Readonly<PluginSettings>;
  update(patch: Partial<PluginSettings>): Promise<Readonly<PluginSettings>>;
}

function isLiteralPrivateHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/gu, '').toLowerCase();
  if (host === 'localhost' || host === '::1' || host === '0.0.0.0') return true;
  if (host.includes(':')) {
    return host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe8')
      || host.startsWith('fe9') || host.startsWith('fea') || host.startsWith('feb');
  }
  const parts = host.split('.');
  if (parts.length !== 4 || parts.some(part => !/^\d{1,3}$/u.test(part))) return false;
  const octets = parts.map(Number);
  if (octets.some(value => value > 255)) return false;
  const first = octets[0] ?? -1;
  const second = octets[1] ?? -1;
  return first === 10 || first === 127 || first === 169 && second === 254
    || first === 172 && second >= 16 && second <= 31
    || first === 192 && second === 168;
}

function normalizedEndpoint(value: string): string {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.username.length > 0 || url.password.length > 0
      || url.search.length > 0 || url.hash.length > 0 || isLiteralPrivateHost(url.hostname)) {
      throw new AiServiceSettingsError('AI_ENDPOINT_INVALID', 'Endpoint URL is not a public HTTPS endpoint.');
    }
    if (url.pathname === '' || url.pathname === '/') {
      throw new AiServiceSettingsError('AI_ENDPOINT_PATH_MISSING', 'Endpoint URL must include the complete API path.');
    }
    return url.toString().replace(/\/$/u, '');
  } catch (error) {
    if (error instanceof AiServiceSettingsError) throw error;
    throw new AiServiceSettingsError('AI_ENDPOINT_INVALID', 'Endpoint URL is invalid.');
  }
}

function endpointOrigin(value: string): string | null {
  if (value.trim().length === 0) return null;
  return new URL(value).origin;
}

export class AiServiceSettingsService {
  constructor(
    private readonly settings: SettingsPort,
    private readonly secrets: AiSecretPort,
    private readonly legacyCatalog?: AiModelCatalogPort,
  ) {}

  async saveText(input: Readonly<AiServiceInput>): Promise<Readonly<PluginSettings>> {
    return this.saveService('text', input);
  }

  async saveImage(input: Readonly<AiServiceInput>): Promise<Readonly<PluginSettings>> {
    return this.saveService('image', input);
  }

  private async saveService(
    kind: AiServiceKind,
    input: Readonly<AiServiceInput>,
  ): Promise<Readonly<PluginSettings>> {
    const endpoint = normalizedEndpoint(input.endpoint);
    const model = input.model.trim();
    if (model.length === 0) {
      throw new AiServiceSettingsError('AI_MODEL_MISSING', 'Model name is required.');
    }
    const current = this.settings.get();
    const endpointField = kind === 'text' ? 'textApiEndpoint' : 'imageApiEndpoint';
    const secretKind: AiSecretKind = kind === 'text' ? 'textApiKey' : 'imageApiKey';
    const previousKey = this.secrets.get(secretKind);
    const originChanged = endpointOrigin(current[endpointField]) !== endpointOrigin(endpoint);
    const suppliedKey = input.apiKey.trim();
    if (originChanged && suppliedKey.length === 0) {
      throw new AiServiceSettingsError(
        'AI_ENDPOINT_NEW_KEY_REQUIRED',
        'Changing service origin requires a new API key.',
      );
    }
    if (suppliedKey.length > 0) this.secrets.set(secretKind, suppliedKey);
    try {
      const patch: Partial<PluginSettings> = kind === 'text'
        ? { textApiEndpoint: endpoint, textApiModel: model }
        : { imageApiEndpoint: endpoint, imageApiModel: model };
      return await this.settings.update(patch);
    } catch (error) {
      if (suppliedKey.length > 0) {
        if (previousKey === null) this.secrets.clear(secretKind);
        else this.secrets.set(secretKind, previousKey);
      }
      throw error;
    }
  }

  /** Transitional API removed when the settings UI migrates to saveImage(). */
  async refreshModels(
    _input: Readonly<{ protocol: AiProviderProtocol; baseUrl: string; apiKey: string }>,
  ): Promise<readonly Readonly<AiModelOption>[]> {
    void this.legacyCatalog;
    throw new AiServiceSettingsError(
      'AI_MODEL_DISCOVERY_REMOVED',
      'Model discovery is not supported; enter the model name manually.',
    );
  }

  /** Transitional API removed when the settings UI migrates to saveImage(). */
  async save(input: Readonly<LegacyAiServiceInput>): Promise<Readonly<PluginSettings>> {
    return this.saveImage({ endpoint: input.baseUrl, model: input.model, apiKey: input.apiKey });
  }

}
