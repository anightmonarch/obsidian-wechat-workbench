import type { AssetSlot } from '../domain/artifact';
import type { BinaryFilePort } from '../domain/ports';
import { detectImageMime, imageDataUrl } from '../media/image-format';
import { hashContent } from '../render/canonicalize';
import type { DiagramRenderer } from '../render/diagram-renderer';
import type { PreviewAssetResolver } from './render-preview';

export class WorkbenchPreviewAssetResolver implements PreviewAssetResolver {
  constructor(
    private readonly files: BinaryFilePort,
    private readonly diagrams: DiagramRenderer,
  ) {}

  async resolve(asset: Readonly<AssetSlot>): Promise<string | null> {
    if (asset.kind === 'local-image') {
      const bytes = await this.files.readBinary(asset.source);
      if (asset.contentHash === null || hashContent(bytes) !== asset.contentHash) return null;
      const mime = detectImageMime(bytes);
      return mime === null ? null : imageDataUrl(bytes, mime);
    }
    if (asset.kind === 'generated-diagram') {
      const generated = await this.diagrams.renderMermaid(asset.source);
      return imageDataUrl(generated.bytes, 'image/png');
    }
    return null;
  }

  async resolveLocalImage(path: string): Promise<string | null> {
    const bytes = await this.files.readBinary(path);
    const mime = detectImageMime(bytes);
    return mime === null ? null : imageDataUrl(bytes, mime);
  }
}
