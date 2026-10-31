import katex from 'katex';

import type { AssetSlot, Diagnostic } from '../../domain/artifact';
import { hashContent } from '../canonicalize';
import { normalizeGeneratedSource, stableAssetId } from '../assets';

const UNSAFE_COMMAND = /\\(?:href|url|includegraphics|htmlClass|htmlData|htmlId|htmlStyle)\b/iu;

/**
 * WeChat's editor unwraps nested `<section class="math-display">` and drops its
 * styles, but keeps inline styles on ordinary `<p>` (same as body paragraphs).
 * Center with a paragraph wrapper + text-align:center.
 */
/** Match body <p> longhand styles so WeChat paste keeps text-align:center. */
const DISPLAY_MATH_P_STYLE = [
  'letter-spacing: 0.04em',
  'margin-top: 1.25em',
  'margin-bottom: 1.25em',
  'margin-left: 0',
  'margin-right: 0',
  'text-align: center',
  'text-indent: 0',
].join('; ');

const DISPLAY_KATEX_STYLE = [
  'display: inline-block',
  'text-align: center',
  'margin-left: auto',
  'margin-right: auto',
].join('; ');

export interface MathProjection {
  assets: readonly AssetSlot[];
  diagnostics: readonly Diagnostic[];
}

function sanitizedKatexFragment(source: string, displayMode: boolean, document: Document): DocumentFragment {
  const html = katex.renderToString(source, {
    displayMode,
    output: 'html',
    strict: 'error',
    throwOnError: false,
    trust: false,
  });
  const parsed = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  for (const forbidden of parsed.body.querySelectorAll('script, style, iframe, object, embed, form, img, a')) {
    forbidden.remove();
  }
  for (const element of parsed.body.querySelectorAll('*')) {
    for (const attribute of [...element.attributes]) {
      if (/^on/iu.test(attribute.name) || /(?:expression|url\s*\()/iu.test(attribute.value)) {
        element.removeAttribute(attribute.name);
      }
    }
  }
  if (displayMode) {
    for (const katexDisplay of parsed.body.querySelectorAll('.katex-display')) {
      const existing = katexDisplay.getAttribute('style') ?? '';
      katexDisplay.setAttribute(
        'style',
        existing.length > 0 ? `${existing}; ${DISPLAY_KATEX_STYLE}` : DISPLAY_KATEX_STYLE,
      );
    }
  }
  const fragment = document.createRange().createContextualFragment('');
  for (const child of parsed.body.childNodes) fragment.append(document.importNode(child, true));
  return fragment;
}

export function renderMathExpressions(root: Element): MathProjection {
  const assets: AssetSlot[] = [];
  const diagnostics: Diagnostic[] = [];

  for (const code of root.querySelectorAll('code.math-inline, code.math-display')) {
    const displayMode = code.classList.contains('math-display');
    const source = normalizeGeneratedSource(code.textContent ?? '');
    const id = stableAssetId('generated-math', `${displayMode ? 'display' : 'inline'}\0${source}`);
    const doc = code.ownerDocument;
    const wrapper = doc.createElementNS(
      'http://www.w3.org/1999/xhtml',
      displayMode ? 'p' : 'span',
    );
    wrapper.className = displayMode ? 'math-display math-projection' : 'math-projection math-inline';
    wrapper.setAttribute('data-asset-id', id);
    wrapper.setAttribute('data-asset-kind', 'generated-math');
    if (displayMode) {
      wrapper.setAttribute('style', DISPLAY_MATH_P_STYLE);
    }

    if (UNSAFE_COMMAND.test(source)) {
      wrapper.textContent = 'Unsupported formula';
      diagnostics.push({
        code: 'MATH_UNSAFE_COMMAND', severity: 'WARNING',
        message: 'A trusted KaTeX command was removed.', source: null,
      });
    } else {
      if (!displayMode) wrapper.setAttribute('aria-label', source);
      const fragment = sanitizedKatexFragment(source, displayMode, doc);
      if (displayMode) {
        const first = fragment.querySelector?.('.katex-display')
          ?? (fragment.firstElementChild as Element | null);
        first?.setAttribute('aria-label', source);
      }
      wrapper.append(fragment);
    }

    const rendered = wrapper.innerHTML;
    assets.push({
      id,
      kind: 'generated-math',
      source,
      status: 'resolved',
      contentHash: hashContent(rendered),
      resolvedUrl: null,
    });
    code.replaceWith(wrapper);
  }

  return { assets, diagnostics };
}

/** Re-assert WeChat-safe centering after juice/canonicalize. */
export function reinforceDisplayMathCentering(root: Element): void {
  for (const block of root.querySelectorAll('.math-display')) {
    const el = block as HTMLElement;
    // Replace (not merge) so juice-inlined display/width/padding do not survive —
    // WeChat paste is likelier to keep body-like paragraph styles.
    el.setAttribute('style', DISPLAY_MATH_P_STYLE);
    el.removeAttribute('aria-label');
    for (const child of el.querySelectorAll('.katex-display')) {
      const node = child as HTMLElement;
      node.setAttribute('style', mergeStyle(node.getAttribute('style'), DISPLAY_KATEX_STYLE));
    }
  }
  for (const katexDisplay of root.querySelectorAll('.katex-display')) {
    const parent = katexDisplay.parentElement;
    if (parent && parent.tagName.toLowerCase() === 'p') {
      parent.setAttribute('style', DISPLAY_MATH_P_STYLE);
      parent.classList.add('math-display');
    }
    const node = katexDisplay as HTMLElement;
    node.setAttribute('style', mergeStyle(node.getAttribute('style'), DISPLAY_KATEX_STYLE));
  }
}

function mergeStyle(existing: string | null, required: string): string {
  const map = new Map<string, string>();
  for (const part of `${existing ?? ''};${required}`.split(';')) {
    const trimmed = part.trim();
    if (!trimmed.includes(':')) continue;
    const idx = trimmed.indexOf(':');
    const prop = trimmed.slice(0, idx).trim().toLowerCase();
    const value = trimmed.slice(idx + 1).trim();
    if (prop && value) map.set(prop, value);
  }
  return [...map.entries()].map(([k, v]) => `${k}: ${v}`).join('; ');
}
