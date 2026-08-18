import { createHash } from 'node:crypto';
import { posix } from 'node:path';

import type { AssetKind, AssetSlot, Diagnostic } from '../domain/artifact';
import type { BinaryFilePort } from '../domain/ports';

const IMAGE_EXTENSION = /\.(?:avif|gif|jpe?g|png|svg|webp)$/iu;

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

export function normalizeGeneratedSource(source: string): string {
  return source.replace(/\r\n?/gu, '\n').trim();
}

export function stableAssetId(kind: AssetKind, normalizedSource: string): string {
  return `asset:${sha256(`${kind}\0${normalizedSource}`)}`;
}

function normalizedRemoteUrl(source: string): string | null {
  try {
    const url = new URL(source);
    if (url.protocol !== 'https:') return null;
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

function normalizedLocalSource(source: string): string {
  let decoded = source;
  try {
    decoded = decodeURI(source);
  } catch {
    // Keep the source unchanged so the unresolved diagnostic remains actionable.
  }
  return posix.normalize(decoded.replaceAll('\\', '/').replace(/^\.\//u, ''));
}

function markdownImage(source: string, alias: string | undefined): string {
  const safeSource = source.replaceAll('>', '%3E');
  const fallback = posix.basename(source).replace(IMAGE_EXTENSION, '');
  const requestedAlt = alias?.trim() ?? '';
  const alt = /^\d+(?:x\d+)?$/u.test(requestedAlt) ? fallback : (requestedAlt || fallback);
  return `![${alt.replaceAll(']', '\\]')}](<${safeSource}>)`;
}

export function expandObsidianImageEmbeds(markdown: string): string {
  return markdown.replace(/!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/gu, (match, sourceValue: string, alias?: string) => {
    const source = sourceValue.trim();
    return IMAGE_EXTENSION.test(source) ? markdownImage(source, alias) : match;
  });
}

export interface ImageAssetExtraction {
  assets: readonly AssetSlot[];
  diagnostics: readonly Diagnostic[];
}

export async function extractImageAssets(
  root: Element,
  fromPath: string,
  files?: BinaryFilePort,
): Promise<ImageAssetExtraction> {
  const assets = new Map<string, AssetSlot>();
  const diagnostics: Diagnostic[] = [];
  const localContentHashes = new Map<string, Promise<string | null>>();

  for (const image of root.querySelectorAll('img')) {
    const source = (image.getAttribute('data-asset-source') ?? image.getAttribute('src') ?? '').trim();
    let asset: AssetSlot;
    const scheme = /^([a-z][a-z0-9+.-]*):/iu.exec(source)?.[1]?.toLowerCase() ?? null;

    if (/^https:/iu.test(source)) {
      const normalized = normalizedRemoteUrl(source);
      if (normalized === null) {
        image.remove();
        diagnostics.push({
          code: 'REMOTE_ASSET_INVALID', severity: 'BLOCKING',
          message: 'A remote image URL is invalid or not HTTPS.', source,
        });
        continue;
      }
      asset = {
        id: stableAssetId('remote-image', normalized),
        kind: 'remote-image',
        source: normalized,
        status: 'unresolved',
        contentHash: null,
        resolvedUrl: null,
      };
    } else if (scheme !== null) {
      image.remove();
      diagnostics.push({
        code: scheme === 'http' ? 'REMOTE_ASSET_INSECURE' : 'IMAGE_PROTOCOL_UNSUPPORTED',
        severity: 'BLOCKING',
        message: scheme === 'http'
          ? 'Remote images must use HTTPS.'
          : `Image protocol is unsupported: ${scheme}`,
        source,
      });
      continue;
    } else {
      const localSource = normalizedLocalSource(source);
      let resolvedPath: string | null = null;
      if (files !== undefined) {
        try {
          resolvedPath = await files.resolveLink(localSource, fromPath);
        } catch {
          resolvedPath = null;
        }
      }
      const normalizedPath = resolvedPath === null ? localSource : normalizedLocalSource(resolvedPath);
      let contentHash: string | null = null;
      if (resolvedPath !== null && files !== undefined) {
        let pendingHash = localContentHashes.get(normalizedPath);
        if (pendingHash === undefined) {
          pendingHash = Promise.resolve()
            .then(() => files.readBinary(normalizedPath))
            .then(bytes => sha256(bytes))
            .catch(() => null);
          localContentHashes.set(normalizedPath, pendingHash);
        }
        contentHash = await pendingHash;
      }
      asset = {
        id: stableAssetId('local-image', normalizedPath),
        kind: 'local-image',
        source: normalizedPath,
        status: contentHash === null ? 'unresolved' : 'resolved',
        contentHash,
        resolvedUrl: null,
      };
      if (contentHash === null) {
        diagnostics.push({
          code: 'LOCAL_ASSET_UNRESOLVED', severity: 'BLOCKING',
          message: `Local image could not be resolved: ${normalizedPath}`,
          source: normalizedPath,
        });
      }
    }

    assets.set(asset.id, asset);
    for (const attribute of ['data-asset-source', 'src', 'srcset', 'loading', 'referrerpolicy', 'crossorigin']) {
      image.removeAttribute(attribute);
    }
    image.setAttribute('data-asset-id', asset.id);
    image.setAttribute('data-asset-kind', asset.kind);
  }

  return { assets: [...assets.values()], diagnostics };
}
