import {
  aiProvidersFor,
  providerRequestFormat,
  resolveAiService,
  type AiProviderId,
  type AiProviderProfile,
  type AiServiceKind,
  type PluginSettings,
} from './model';
import type { SecretKind } from './secret-store';
import type { AiModelCatalogPort } from './ai-model-catalog';

export class AiServiceSettingsError extends Error {
  constructor(readonly code:
    | 'AI_BASE_URL_INVALID'
    | 'AI_ENDPOINT_INVALID'
    | 'AI_ENDPOINT_NEW_KEY_REQUIRED'
    | 'AI_MODEL_MISSING'
    | 'AI_PROVIDER_UNSUPPORTED', message: string) {
    super(message);
    this.name = 'AiServiceSettingsError';
  }
}

export interface AiProviderProfileInput {
  kind: AiServiceKind;
  provider: AiProviderId;
  baseUrl: string;
  model: string;
  apiKey: string;
}

type AiSecretKind = Extract<SecretKind,
  'textAgnesApiKey' | 'textDeepseekApiKey' | 'imageAgnesApiKey' | 'imageDeepseekApiKey'>;

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
  if (host.includes(':')) return host.startsWith('fc') || host.startsWith('fd')
    || host.startsWith('fe8') || host.startsWith('fe9') || host.startsWith('fea') || host.startsWith('feb');
  const parts = host.split('.');
  if (parts.length !== 4 || parts.some(part => !/^\d{1,3}$/u.test(part))) return false;
  const octets = parts.map(Number);
  if (octets.some(value => value > 255)) return false;
  const first = octets[0] ?? -1;
  const second = octets[1] ?? -1;
  return first === 10 || first === 127 || first === 169 && second === 254
    || first === 172 && second >= 16 && second <= 31 || first === 192 && second === 168;
}

function normalizedUrl(value: string): string {
  const raw = value.trim();
  if (raw.length === 0) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username.length > 0 || url.password.length > 0
      || url.search.length > 0 || url.hash.length > 0 || isLiteralPrivateHost(url.hostname)) {
      throw new Error('invalid');
    }
    return url.toString().replace(/\/$/u, '');
  } catch {
    throw new AiServiceSettingsError(
      'AI_BASE_URL_INVALID', 'Base URL 必须是公网 HTTPS 地址。',
    );
  }
}

export function aiSecretKind(kind: 'text', provider: AiProviderId): Extract<AiSecretKind, 'textAgnesApiKey' | 'textDeepseekApiKey'>;
export function aiSecretKind(kind: 'image', provider: AiProviderId): Extract<AiSecretKind, 'imageAgnesApiKey' | 'imageDeepseekApiKey'>;
export function aiSecretKind(kind: AiServiceKind, provider: AiProviderId): AiSecretKind {
  if (kind === 'text') return provider === 'agnes' ? 'textAgnesApiKey' : 'textDeepseekApiKey';
  return provider === 'agnes' ? 'imageAgnesApiKey' : 'imageDeepseekApiKey';
}

function profileOrigin(profile: Readonly<AiProviderProfile>): string | null {
  const raw = profile.baseUrl.trim();
  return raw.length === 0 ? null : new URL(raw).origin;
}

export class AiServiceSettingsService {
  constructor(
    private readonly settings: SettingsPort,
    private readonly secrets: AiSecretPort,
    private readonly catalog?: AiModelCatalogPort,
  ) {}

  async listModels(input: Readonly<Pick<AiProviderProfileInput, 'kind' | 'provider' | 'baseUrl' | 'apiKey'>>): Promise<readonly string[]> {
    if (!aiProvidersFor(input.kind).includes(input.provider)) {
      throw new AiServiceSettingsError('AI_PROVIDER_UNSUPPORTED', 'DeepSeek 不支持图片生成，不能作为图片模型配置。');
    }
    const baseUrl = normalizedUrl(input.baseUrl);
    if (baseUrl.length === 0) throw new AiServiceSettingsError('AI_BASE_URL_INVALID', '获取模型列表前请填写 Base URL。');
    const keyKind = input.kind === 'text'
      ? aiSecretKind('text', input.provider)
      : aiSecretKind('image', input.provider);
    const apiKey = input.apiKey.trim() || this.secrets.get(keyKind) || '';
    if (apiKey.length === 0) throw new AiServiceSettingsError('AI_ENDPOINT_NEW_KEY_REQUIRED', '获取模型列表前请填写或保存 API Key。');
    if (this.catalog === undefined) throw new Error('当前环境未配置模型列表请求。');
    return this.catalog.list(baseUrl, apiKey);
  }

  async saveProfile(input: Readonly<AiProviderProfileInput>): Promise<Readonly<PluginSettings>> {
    if (!aiProvidersFor(input.kind).includes(input.provider)) {
      throw new AiServiceSettingsError('AI_PROVIDER_UNSUPPORTED', 'DeepSeek 不支持图片生成，不能作为图片模型配置。');
    }
    const baseUrl = normalizedUrl(input.baseUrl);
    if (baseUrl.length === 0) {
      throw new AiServiceSettingsError('AI_BASE_URL_INVALID', '请填写 Base URL。');
    }
    const model = input.model.trim();
    if (model.length === 0) throw new AiServiceSettingsError('AI_MODEL_MISSING', '请先选择或填写模型名称。');

    const current = this.settings.get();
    const mode = current.aiProviders[input.kind];
    const previousProfile = mode.providers[input.provider];
    const changedOrigin = profileOrigin(previousProfile) !== new URL(baseUrl).origin;
    const keyKind = input.kind === 'text'
      ? aiSecretKind('text', input.provider)
      : aiSecretKind('image', input.provider);
    const suppliedKey = input.apiKey.trim();
    if (changedOrigin && suppliedKey.length === 0) {
      throw new AiServiceSettingsError('AI_ENDPOINT_NEW_KEY_REQUIRED', '服务地址已变化，请输入该供应商的新 API Key。');
    }
    const previousKey = this.secrets.get(keyKind);
    if (suppliedKey.length > 0) this.secrets.set(keyKind, suppliedKey);
    const profile = Object.freeze({
      ...previousProfile,
      baseUrl,
      model,
      requestFormat: providerRequestFormat(input.kind, input.provider),
    });
    const aiProviders = Object.freeze({
      ...current.aiProviders,
      [input.kind]: Object.freeze({
        activeProvider: input.provider,
        providers: Object.freeze({ ...mode.providers, [input.provider]: profile }),
      }),
    });
    try {
      const resolved = resolveAiService({ aiProviders }, input.kind);
      return await this.settings.update({
        aiProviders,
        ...(input.kind === 'text'
          ? { textApiEndpoint: resolved?.endpoint ?? '', textApiModel: model }
          : { imageApiEndpoint: resolved?.endpoint ?? '', imageApiModel: model }),
      });
    } catch (error) {
      if (suppliedKey.length > 0) {
        if (previousKey === null) this.secrets.clear(keyKind);
        else this.secrets.set(keyKind, previousKey);
      }
      throw error;
    }
  }

}
