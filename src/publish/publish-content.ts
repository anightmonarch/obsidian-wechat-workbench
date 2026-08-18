import { canonicalizeHtml, hashContent } from '../render/canonicalize';

export function normalizedFinalHtmlHash(html: string): string {
  try { return hashContent(canonicalizeHtml(html)); } catch { return hashContent(html); }
}
