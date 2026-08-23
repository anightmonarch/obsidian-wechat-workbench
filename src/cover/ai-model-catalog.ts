import type {
  AiModelCatalogPort,
  AiModelCatalogRequest,
  AiModelOption,
  AiProviderProtocol,
} from './ai-provider';
import type { HttpTransport } from '../wechat/http-transport';

export class AiModelCatalogError extends Error {
  constructor(
    readonly code:
      | 'AI_PROVIDER_URL_INVALID'
      | 'AI_PROVIDER_KEY_MISSING'
      | 'AI_MODEL_LIST_REJECTED'
      | 'AI_MODEL_LIST_INVALID'
      | 'AI_MODEL_LIST_FAILED',
    message: string,
  ) {
    super(message);
    this.name = 'AiModelCatalogError';
  }
}

function providerEndpoint(rawBaseUrl: string): string {
  let url: URL;
  try { url = new URL(rawBaseUrl.trim()); } catch {
    throw new AiModelCatalogError('AI_PROVIDER_URL_INVALID', 'Provider URL is invalid.');
  }
  if (url.protocol !== 'https:' || url.username.length > 0 || url.password.length > 0
    || url.search.length > 0 || url.hash.length > 0) {
    throw new AiModelCatalogError('AI_PROVIDER_URL_INVALID', 'Provider URL is not a public HTTPS endpoint.');
  }
  const path = url.pathname.replace(/\/+$/u, '');
  url.pathname = path.endsWith('/v1') ? `${path}/models` : `${path}/v1/models`;
  return url.toString();
}

function modelOptions(
  value: unknown,
  protocol: AiProviderProtocol,
): readonly Readonly<AiModelOption>[] {
  const payload = typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
  if (payload === null || !Array.isArray(payload.data)) {
    throw new AiModelCatalogError('AI_MODEL_LIST_INVALID', 'Provider returned an invalid model list.');
  }
  const ids = new Set<string>();
  for (const entry of payload.data) {
    if (typeof entry !== 'object' || entry === null) continue;
    const id = (entry as Record<string, unknown>).id;
    if (typeof id !== 'string') continue;
    const trimmed = id.trim();
    if (trimmed.length === 0 || [...trimmed].length > 200) continue;
    ids.add(trimmed);
  }
  return Object.freeze([...ids].sort((left, right) => left.localeCompare(right)).slice(0, 500).map(id => Object.freeze({
    id,
    capability: protocol === 'anthropic' ? 'PROMPT_PLANNING_ONLY' as const : 'IMAGE_UNVERIFIED' as const,
  })));
}

export class AiModelCatalogService implements AiModelCatalogPort {
  constructor(private readonly http: HttpTransport) {}

  async list(request: Readonly<AiModelCatalogRequest>): Promise<readonly Readonly<AiModelOption>[]> {
    const apiKey = request.apiKey.trim();
    if (apiKey.length === 0) {
      throw new AiModelCatalogError('AI_PROVIDER_KEY_MISSING', 'Provider API key is required.');
    }
    const url = providerEndpoint(request.baseUrl);
    let response;
    try {
      response = await this.http.request({
        method: 'GET',
        url,
        headers: request.protocol === 'anthropic'
          ? { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
          : { Authorization: `Bearer ${apiKey}` },
      });
    } catch {
      throw new AiModelCatalogError('AI_MODEL_LIST_FAILED', 'Provider model list request failed.');
    }
    if (response.status < 200 || response.status >= 300) {
      throw new AiModelCatalogError(
        'AI_MODEL_LIST_REJECTED',
        `Provider model list returned HTTP ${response.status}.`,
      );
    }
    try {
      return modelOptions(response.body, request.protocol);
    } catch (error) {
      if (error instanceof AiModelCatalogError) throw error;
      throw new AiModelCatalogError('AI_MODEL_LIST_INVALID', 'Provider returned an invalid model list.');
    }
  }
}
