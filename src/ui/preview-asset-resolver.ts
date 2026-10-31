import type { AssetSlot } from '../domain/artifact';
import type { BinaryFilePort } from '../domain/ports';
import { detectImageMime, imageDataUrl } from '../media/image-format';
import { normalizeImageBytesForClipboard } from '../media/electron-image-normalize';
import { hashContent } from '../render/canonicalize';
import type { DiagramRenderer } from '../render/diagram-renderer';
import type { PreviewAssetResolver } from './render-preview';

function toPreviewDataUrl(bytes: Uint8Array): string | null {
  if (detectImageMime(bytes) === null) return null;
  const normalized = normalizeImageBytesForClipboard(bytes);
  const mime = detectImageMime(normalized.bytes) ?? normalized.mime;
  return imageDataUrl(normalized.bytes, mime);
}

export class WorkbenchPreviewAssetResolver implements PreviewAssetResolver {
  constructor(
    private readonly files: BinaryFilePort,
    private readonly diagrams: DiagramRenderer,
  ) {}

  async resolve(asset: Readonly<AssetSlot>): Promise<string | null> {
    if (asset.kind === 'local-image') {
      const bytes = await this.files.readBinary(asset.source);
      if (asset.contentHash === null || hashContent(bytes) !== asset.contentHash) return null;
      return toPreviewDataUrl(bytes);
    }
    if (asset.kind === 'generated-diagram') {
      const generated = await this.diagrams.renderMermaid(asset.source);
      return toPreviewDataUrl(generated.bytes);
    }
    return null;
  }

  async resolveLocalImage(path: string): Promise<string | null> {
    const bytes = await this.files.readBinary(path);
    return toPreviewDataUrl(bytes);
  }
}
