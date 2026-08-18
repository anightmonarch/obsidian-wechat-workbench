import hljs from 'highlight.js/lib/common';

function safeHighlightNode(source: Node, document: Document): Node | null {
  if (source.nodeType === Node.TEXT_NODE) {
    return document.createTextNode(source.textContent ?? '');
  }
  if (source.nodeType !== Node.ELEMENT_NODE) return null;
  const sourceElement = source as Element;
  if (sourceElement.tagName !== 'SPAN') return null;

  const safeClasses = [...sourceElement.classList]
    .filter(className => /^hljs-[a-z0-9_-]+$/u.test(className));
  const span = sourceElement.cloneNode(false) as HTMLSpanElement;
  for (const attribute of [...span.attributes]) span.removeAttribute(attribute.name);
  if (safeClasses.length > 0) span.className = safeClasses.sort().join(' ');
  for (const child of sourceElement.childNodes) {
    const safeChild = safeHighlightNode(child, document);
    if (safeChild !== null) span.append(safeChild);
  }
  return span;
}

function languageFor(code: Element): string | null {
  const languageClass = [...code.classList].find(className => className.startsWith('language-'));
  if (languageClass === undefined) return null;
  const language = languageClass.slice('language-'.length).toLowerCase();
  return hljs.getLanguage(language) === undefined ? null : language;
}

export function highlightCodeBlocks(root: Element): void {
  for (const code of root.querySelectorAll('pre > code')) {
    const language = languageFor(code);
    if (language === null) {
      code.classList.add('hljs');
      continue;
    }

    const highlighted = hljs.highlight(code.textContent ?? '', {
      language,
      ignoreIllegals: true,
    }).value;
    const parsed = new DOMParser().parseFromString(`<body>${highlighted}</body>`, 'text/html');
    code.replaceChildren();
    for (const child of parsed.body.childNodes) {
      const safeChild = safeHighlightNode(child, code.ownerDocument);
      if (safeChild !== null) code.append(safeChild);
    }
    code.classList.add('hljs');
  }
}
