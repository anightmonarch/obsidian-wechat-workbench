import type { AiProviderId, AiRequestFormat } from '../settings/model';

export interface AiModelCatalogRequest {
  provider: AiProviderId;
  requestFormat: Extract<AiRequestFormat, 'agnes-images' | 'openai-images'>;
  baseUrl: string;
  apiKey: string;
  signal?: AbortSignal;
}

export interface AiModelOption {
  id: string;
  capability: 'IMAGE_UNVERIFIED';
}

export interface AiModelCatalogPort {
  list(request: Readonly<AiModelCatalogRequest>): Promise<readonly Readonly<AiModelOption>[]>;
}
