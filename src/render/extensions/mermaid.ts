import type { AssetSlot } from '../../domain/artifact';
import { normalizeGeneratedSource, stableAssetId } from '../assets';

export function extractMermaidAssets(root: Element): readonly AssetSlot[] {
  const assets: AssetSlot[] = [];
  for (const code of root.querySelectorAll('pre > code.language-mermaid')) {
    const source = normalizeGeneratedSource(code.textContent ?? '');
    const id = stableAssetId('generated-diagram', source);
    const placeholder = code.ownerDocument.createElementNS('http://www.w3.org/1999/xhtml', 'figure');
    placeholder.className = 'mermaid-placeholder';
    placeholder.setAttribute('data-asset-id', id);
    placeholder.setAttribute('data-asset-kind', 'generated-diagram');
    const label = code.ownerDocument.createElementNS('http://www.w3.org/1999/xhtml', 'span');
    label.textContent = 'Mermaid diagram';
    placeholder.append(label);
    (code.parentElement ?? code).replaceWith(placeholder);
    assets.push({
      id,
      kind: 'generated-diagram',
      source,
      status: 'unresolved',
      contentHash: null,
      resolvedUrl: null,
    });
  }
  return assets;
}
