import { posix } from 'node:path';

import type { AssetSlot, RenderArtifact } from '../domain/artifact';
import type { BinaryFilePort } from '../domain/ports';
import { detectImageMime, type SupportedImageMime } from '../media/image-format';
import { hashContent, parseArticleRoot } from '../render/canonicalize';
import { applyDiagramImagePresentation } from '../render/diagram-image';
import type { DiagramRenderer } from '../render/diagram-renderer';
import type { RemoteImageFetcher } from '../security/remote-image-fetcher';
import { AssetCache } from './asset-cache';

export interface PublishAccount {
  accountHash: string;
  accessToken: string;
}

export interface UploadImage {
  bytes: Uint8Array;
  mimeType: SupportedImageMime;
  filename: string;
}

export interface MediaUploadPort {
  uploadBodyImage(image: Readonly<UploadImage>, accessToken: string): Promise<Readonly<{ url: string }>>;
  uploadCover(image: Readonly<UploadImage>, accessToken: string): Promise<Readonly<{ mediaId: string; url?: string }>>;
}

export interface ResolvedArtifact {
  html: string;
  uploadedAssetIds: readonly string[];
}

function imageFilename(asset: Readonly<AssetSlot>, mimeType: SupportedImageMime): string {
  const existing = posix.basename(asset.source).replace(/[^A-Za-z0-9._-]/gu, '-');
  if (existing.length > 0 && /\.(?:gif|jpe?g|png|webp)$/iu.test(existing)) return existing;
  const extension = mimeType === 'image/jpeg' ? 'jpg' : mimeType.slice('image/'.length);
  return `wechat-asset.${extension}`;
}

function validatedUpload(bytes: Uint8Array, asset: Readonly<AssetSlot>): UploadImage {
  const mimeType = detectImageMime(bytes);
  if (mimeType === null) throw new Error(`Unsupported image type: ${asset.source}`);
  if (asset.contentHash !== null && hashContent(bytes) !== asset.contentHash) {
    throw new Error(`Image changed after rendering: ${asset.source}`);
  }
  return { bytes, mimeType, filename: imageFilename(asset, mimeType) };
}

function httpsUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:') throw new Error('WeChat body image URL must be HTTPS.');
  return url.toString();
}

export class AssetUploadService {
  constructor(
    private readonly files: BinaryFilePort,
    private readonly remoteImages: RemoteImageFetcher,
    private readonly diagrams: DiagramRenderer,
    private readonly media: MediaUploadPort,
    private readonly cache: AssetCache,
  ) {}

  async resolveBodyAssets(
    artifact: Readonly<RenderArtifact>,
    account: Readonly<PublishAccount>,
  ): Promise<Readonly<ResolvedArtifact>> {
    const urls = new Map<string, string | null>();
    const uploaded: string[] = [];
    for (const asset of artifact.assets) {
      if (asset.kind === 'generated-math') {
        urls.set(asset.id, null);
        continue;
      }
      const image = await this.loadImage(asset);
      const contentHash = hashContent(image.bytes);
      const cached = await this.cache.get(account.accountHash, 'body', contentHash);
      let url: string | null = null;
      if (cached?.url !== null && cached?.url !== undefined) {
        try { url = httpsUrl(cached.url); } catch { url = null; }
      }
      if (url === null) {
        const receipt = await this.media.uploadBodyImage(image, account.accessToken);
        url = httpsUrl(receipt.url);
        await this.cache.put(account.accountHash, 'body', contentHash, { mediaId: null, url });
        uploaded.push(asset.id);
      }
      urls.set(asset.id, url);
    }

    const root = parseArticleRoot(artifact.canonicalHtml);
    const assets = new Map(artifact.assets.map(asset => [asset.id, asset]));
    for (const node of root.querySelectorAll<HTMLElement>('[data-asset-id]')) {
      const id = node.dataset.assetId;
      const asset = id === undefined ? undefined : assets.get(id);
      if (asset === undefined) throw new Error(`Unresolved article asset slot: ${id ?? 'unknown'}`);
      if (asset.kind === 'generated-math') {
        node.removeAttribute('data-asset-id');
        node.removeAttribute('data-asset-kind');
        continue;
      }
      const url = urls.get(asset.id);
      if (url === undefined || url === null) throw new Error(`Unresolved article asset: ${asset.source}`);
      if (asset.kind === 'generated-diagram') {
        const image = node.ownerDocument.createElementNS('http://www.w3.org/1999/xhtml', 'img');
        image.setAttribute('src', url);
        applyDiagramImagePresentation(image, 'Mermaid diagram');
        node.replaceWith(image);
      } else {
        if (node.tagName !== 'IMG') throw new Error(`Image slot has invalid element: ${asset.source}`);
        node.removeAttribute('data-asset-id');
        node.removeAttribute('data-asset-kind');
        node.setAttribute('src', url);
      }
    }
    if (root.querySelector('[data-asset-id]') !== null) throw new Error('Article contains unresolved asset slots.');
    return Object.freeze({ html: root.outerHTML, uploadedAssetIds: Object.freeze(uploaded) });
  }

  async uploadCover(
    image: Readonly<UploadImage>,
    account: Readonly<PublishAccount>,
  ): Promise<Readonly<{ mediaId: string; url?: string }>> {
    if (detectImageMime(image.bytes) !== image.mimeType) throw new Error('Cover MIME type does not match its bytes.');
    const contentHash = hashContent(image.bytes);
    const cached = await this.cache.get(account.accountHash, 'cover', contentHash);
    if (cached?.mediaId !== null && cached?.mediaId !== undefined) {
      const cachedUrl = cached.url === null ? null : httpsUrl(cached.url);
      return Object.freeze({
        mediaId: cached.mediaId,
        ...(cachedUrl === null ? {} : { url: cachedUrl }),
      });
    }
    const receipt = await this.media.uploadCover(image, account.accessToken);
    if (receipt.mediaId.trim().length === 0) throw new Error('WeChat cover upload returned an empty media ID.');
    const normalized = Object.freeze({
      mediaId: receipt.mediaId,
      ...(receipt.url === undefined ? {} : { url: httpsUrl(receipt.url) }),
    });
    await this.cache.put(account.accountHash, 'cover', contentHash, {
      mediaId: normalized.mediaId,
      url: normalized.url ?? null,
    });
    return normalized;
  }

  private async loadImage(asset: Readonly<AssetSlot>): Promise<UploadImage> {
    if (asset.kind === 'local-image') return validatedUpload(await this.files.readBinary(asset.source), asset);
    if (asset.kind === 'remote-image') {
      const image = await this.remoteImages.fetch(asset.source);
      return { bytes: image.bytes, mimeType: image.mimeType, filename: imageFilename(asset, image.mimeType) };
    }
    if (asset.kind === 'generated-diagram') {
      const image = await this.diagrams.renderMermaid(asset.source);
      return validatedUpload(image.bytes, asset);
    }
    throw new Error(`Unsupported upload asset: ${asset.kind}`);
  }
}
