export type AiProviderProtocol = 'openai-compatible' | 'anthropic';

export interface AiModelCatalogRequest {
  protocol: AiProviderProtocol;
  baseUrl: string;
  apiKey: string;
  signal?: AbortSignal;
}

export interface AiModelOption {
  id: string;
  capability: 'IMAGE_UNVERIFIED' | 'PROMPT_PLANNING_ONLY';
}

export interface AiModelCatalogPort {
  list(request: Readonly<AiModelCatalogRequest>): Promise<readonly Readonly<AiModelOption>[]>;
}
