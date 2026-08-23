import type {
  CoverCandidate,
  CoverResolutionContext,
  RenderAssetList,
  CoverSelection,
} from './cover-types';

function candidate(source: CoverCandidate['source'], vaultPath: string): Readonly<CoverCandidate> {
  const normalized = vaultPath.trim();
  if (normalized.length === 0) throw new Error('The selected cover path is empty.');
  return Object.freeze({ source, vaultPath: normalized });
}

export class CoverService {
  firstImage(artifact: Readonly<RenderAssetList>): Readonly<CoverCandidate | null> {
    const first = artifact.assets.find(asset => asset.kind === 'local-image' || asset.kind === 'remote-image');
    if (first === undefined) return null;
    return Object.freeze({
      source: first.kind === 'remote-image' ? 'first-remote-image' : 'first-local-image',
      vaultPath: first.source,
    });
  }

  resolve(
    selection: Readonly<CoverSelection>,
    context: Readonly<CoverResolutionContext>,
  ): Readonly<CoverCandidate> {
    if (selection.strategy === 'article') {
      if (context.snapshot.metadata.cover === null) {
        throw new Error('The article cover is not configured.');
      }
      return candidate('frontmatter-cover', context.snapshot.metadata.cover);
    }

    if (selection.strategy === 'first-image') {
      const first = context.artifact.assets.find(asset => asset.kind === 'local-image');
      if (first === undefined) throw new Error('The article has no local body image.');
      return candidate('first-local-image', first.source);
    }

    if (context.globalDefaultPath === null) {
      throw new Error('The global default cover is not configured.');
    }
    return candidate('configured-default', context.globalDefaultPath);
  }
}
