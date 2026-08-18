import katex from 'katex';

import type { AssetSlot, Diagnostic } from '../../domain/artifact';
import { hashContent } from '../canonicalize';
import { normalizeGeneratedSource, stableAssetId } from '../assets';

const UNSAFE_COMMAND = /\\(?:href|url|includegraphics|htmlClass|htmlData|htmlId|htmlStyle)\b/iu;

export interface MathProjection {
  assets: readonly AssetSlot[];
  diagnostics: readonly Diagnostic[];
}

function sanitizedKatexFragment(source: string, displayMode: boolean, document: Document): DocumentFragment {
  const html = katex.renderToString(source, {
    displayMode,
    output: 'htmlAndMathml',
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
    const wrapper = code.ownerDocument.createElementNS(
      'http://www.w3.org/1999/xhtml',
      displayMode ? 'div' : 'span',
    );
    wrapper.className = displayMode ? 'math-projection math-display' : 'math-projection math-inline';
    wrapper.setAttribute('data-asset-id', id);
    wrapper.setAttribute('data-asset-kind', 'generated-math');

    if (UNSAFE_COMMAND.test(source)) {
      wrapper.textContent = 'Unsupported formula';
      diagnostics.push({
        code: 'MATH_UNSAFE_COMMAND', severity: 'WARNING',
        message: 'A trusted KaTeX command was removed.', source: null,
      });
    } else {
      wrapper.append(sanitizedKatexFragment(source, displayMode, code.ownerDocument));
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
