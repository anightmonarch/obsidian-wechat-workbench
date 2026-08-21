import hljs from 'highlight.js/lib/common';

export interface CodeBlockOptions {
  showLineNumbers: boolean;
  macWindow: boolean;
}

interface HighlightToken {
  text: string;
  classes: readonly string[];
}

function createHtmlElement(document: Document, tagName: string): HTMLElement {
  return document.createElementNS('http://www.w3.org/1999/xhtml', tagName);
}

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

function collectTokens(node: Node, classes: readonly string[], lines: HighlightToken[][]): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const parts = (node.textContent ?? '').split('\n');
    parts.forEach((part, index) => {
      if (part.length > 0) lines[lines.length - 1]?.push({ text: part, classes });
      if (index < parts.length - 1) lines.push([]);
    });
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const element = node as Element;
  if (element.tagName !== 'SPAN') return;
  const safeClasses = [...element.classList]
    .filter(className => /^hljs-[a-z0-9_-]+$/u.test(className));
  const mergedClasses = [...new Set([...classes, ...safeClasses])].sort();
  for (const child of element.childNodes) collectTokens(child, mergedClasses, lines);
}

function projectLineNumbers(code: Element): void {
  const lines: HighlightToken[][] = [[]];
  for (const child of code.childNodes) collectTokens(child, [], lines);
  const document = code.ownerDocument;
  lines.forEach((tokens, index) => {
    const line = createHtmlElement(document, 'span');
    line.className = 'code-line';
    const number = createHtmlElement(document, 'span');
    number.className = 'code-line-number';
    number.setAttribute('aria-hidden', 'true');
    number.textContent = String(index + 1);
    const content = createHtmlElement(document, 'span');
    content.className = 'code-line-content';
    for (const token of tokens) {
      if (token.classes.length === 0) {
        content.append(document.createTextNode(token.text));
        continue;
      }
      const span = createHtmlElement(document, 'span');
      span.className = token.classes.join(' ');
      span.textContent = token.text;
      content.append(span);
    }
    line.append(number, content);
    code.append(line);
    if (index < lines.length - 1) code.append(document.createTextNode('\n'));
  });
}

function addMacWindow(pre: Element): void {
  if (pre.classList.contains('code-window')) return;
  pre.classList.add('code-window');
  const dots = createHtmlElement(pre.ownerDocument, 'span');
  dots.className = 'code-window-dots';
  dots.setAttribute('aria-hidden', 'true');
  for (const color of ['red', 'yellow', 'green']) {
    const dot = createHtmlElement(pre.ownerDocument, 'span');
    dot.className = `code-window-dot code-window-dot--${color}`;
    dots.append(dot);
  }
  pre.prepend(dots);
}

export function highlightCodeBlocks(
  root: Element,
  options: Readonly<CodeBlockOptions> = { showLineNumbers: false, macWindow: false },
): void {
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
    if (options.showLineNumbers) projectLineNumbers(code);
    if (options.macWindow) {
      const parent = code.parentElement;
      if (parent !== null) addMacWindow(parent);
    }
  }
}
