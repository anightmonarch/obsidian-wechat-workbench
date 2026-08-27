import type { SupportedImageMime } from '../media/image-format';
import type { AiProviderId, AiRequestFormat } from '../settings/model';

export interface AiCoverGenerationRequest {
  provider?: AiProviderId;
  requestFormat?: Extract<AiRequestFormat, 'agnes-images' | 'openai-images'>;
  /** @deprecated v4 request compatibility; ignored by the v5 resolver. */
  protocol?: 'openai-compatible' | 'anthropic';
  endpoint: string;
  model: string;
  apiKey: string;
  title: string;
  digest: string;
  supplementalPrompt: string;
  presetId?: string;
  signal?: AbortSignal;
}

export interface GeneratedCover {
  bytes: Uint8Array;
  mimeType: SupportedImageMime;
  contentHash: string;
  source: 'base64' | 'remote-url';
}

export interface CoverGenerator {
  generate(request: Readonly<AiCoverGenerationRequest>): Promise<Readonly<GeneratedCover>>;
}
