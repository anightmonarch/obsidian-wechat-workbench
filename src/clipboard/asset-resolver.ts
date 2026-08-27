import type { AssetSlot, RenderArtifact } from '../domain/artifact';
import type { BinaryFilePort } from '../domain/ports';
import { detectImageMime, imageDataUrl } from '../media/image-format';
import { hashContent, parseArticleRoot } from '../render/canonicalize';
import { applyDiagramImagePresentation } from '../render/diagram-image';
import type { DiagramRenderer } from '../render/diagram-renderer';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;

export class ClipboardResolutionError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly source: string | null,
  ) {
    super(message);
    this.name = 'ClipboardResolutionError';
  }
}

function failure(code: string, message: string, source: string | null): never {
  throw new ClipboardResolutionError(code, message, source);
}

async function readableLocal(files: BinaryFilePort, asset: Readonly<AssetSlot>): Promise<Uint8Array> {
  try {
    return await files.readBinary(asset.source);
  } catch {
    return failure('LOCAL_ASSET_UNREADABLE', `Local image is unreadable: ${asset.source}`, asset.source);
  }
}

function checkedDataUrl(bytes: Uint8Array, asset: Readonly<AssetSlot>): string {
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    return failure('IMAGE_TOO_LARGE', `Image exceeds 5 MiB: ${asset.source}`, asset.source);
  }
  const mime = detectImageMime(bytes);
  if (mime === null) {
    return failure('IMAGE_TYPE_UNSUPPORTED', `Image type is unsupported: ${asset.source}`, asset.source);
  }
  return imageDataUrl(bytes, mime);
}

export class ClipboardAssetResolver {
  constructor(
    private readonly files: BinaryFilePort,
    private readonly diagrams: DiagramRenderer,
  ) {}

  async resolve(artifact: Readonly<RenderArtifact>): Promise<string> {
    const resolved = new Map<string, string | null>();
    let totalBytes = 0;

    for (const asset of artifact.assets) {
      if (asset.kind === 'local-image') {
        const bytes = await readableLocal(this.files, asset);
        if (asset.contentHash !== null && hashContent(bytes) !== asset.contentHash) {
          failure('LOCAL_ASSET_CHANGED', `Local image changed after rendering: ${asset.source}`, asset.source);
        }
        const dataUrl = checkedDataUrl(bytes, asset);
        totalBytes += bytes.byteLength;
        resolved.set(asset.id, dataUrl);
      } else if (asset.kind === 'generated-diagram') {
        const generated = await this.diagrams.renderMermaid(asset.source);
        const dataUrl = checkedDataUrl(generated.bytes, asset);
        totalBytes += generated.bytes.byteLength;
        resolved.set(asset.id, dataUrl);
      } else if (asset.kind === 'remote-image') {
        let safe = false;
        try { safe = new URL(asset.source).protocol === 'https:'; } catch { safe = false; }
        if (!safe) failure('REMOTE_ASSET_INSECURE', 'Remote image URL must be HTTPS.', asset.source);
        resolved.set(asset.id, asset.source);
      } else {
        resolved.set(asset.id, null);
      }
      if (totalBytes > MAX_TOTAL_BYTES) {
        failure('TOTAL_IMAGE_BYTES_EXCEEDED', 'Article images exceed the 20 MiB clipboard limit.', null);
      }
    }

    const root = parseArticleRoot(artifact.canonicalHtml);
    const assets = new Map(artifact.assets.map(asset => [asset.id, asset]));
    for (const node of root.querySelectorAll<HTMLElement>('[data-asset-id]')) {
      const id = node.dataset.assetId;
      const asset = id === undefined ? undefined : assets.get(id);
      if (asset === undefined) failure('ASSET_SLOT_UNRESOLVED', `Asset slot is unresolved: ${id ?? 'unknown'}`, id ?? null);

      const url = resolved.get(asset.id);
      if (asset.kind === 'generated-math') {
        node.removeAttribute('data-asset-id');
        node.removeAttribute('data-asset-kind');
      } else if (asset.kind === 'generated-diagram') {
        if (url === null || url === undefined) failure('ASSET_SLOT_UNRESOLVED', 'Diagram slot is unresolved.', asset.id);
        const image = node.ownerDocument.createElementNS('http://www.w3.org/1999/xhtml', 'img');
        image.setAttribute('src', url);
        applyDiagramImagePresentation(image, 'Mermaid diagram');
        node.replaceWith(image);
      } else {
        if (node.tagName !== 'IMG' || url === null || url === undefined) {
          failure('ASSET_SLOT_UNRESOLVED', `Image slot is unresolved: ${asset.source}`, asset.source);
        }
        node.removeAttribute('data-asset-id');
        node.removeAttribute('data-asset-kind');
        node.setAttribute('src', url);
      }
    }

    if (root.querySelector('[data-asset-id]') !== null) {
      failure('ASSET_SLOT_UNRESOLVED', 'Article still contains unresolved asset slots.', null);
    }
    return root.outerHTML;
  }
}
