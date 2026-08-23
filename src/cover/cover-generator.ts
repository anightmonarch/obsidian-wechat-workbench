import type { SupportedImageMime } from '../media/image-format';
import type { AiProviderProtocol } from './ai-provider';

export interface AiCoverGenerationRequest {
  protocol: AiProviderProtocol;
  endpoint: string;
  model: string;
  apiKey: string;
  title: string;
  digest: string;
  bodyExcerpt: string;
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
