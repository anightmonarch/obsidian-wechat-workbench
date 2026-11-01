import hljs from 'highlight.js/lib/common';

export interface CodeBlockOptions {
  showLineNumbers: boolean;
  macWindow: boolean;
}

interface HighlightToken {
  text: string;
  classes: readonly string[];
}

/** WeChat MP rewrites/strips white-space on pre/code/spans and drops
 *  space-only text nodes between inline tokens. Encode spaces as NBSP so
 *  indentation and inter-token gaps survive draft sync. */
function protectCodeWhitespace(text: string): string {
  return text.replace(/\t/gu, '    ').replace(/ /gu, '\u00a0');
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

function appendTokens(target: Element, tokens: HighlightToken[], document: Document): void {
  for (const token of tokens) {
    const text = protectCodeWhitespace(token.text);
    if (token.classes.length === 0) {
      target.append(document.createTextNode(text));
      continue;
    }
    const span = createHtmlElement(document, 'span');
    span.className = token.classes.join(' ');
    span.textContent = text;
    target.append(span);
  }
}

function projectCodeLines(code: Element, lineNumbers: boolean): void {
  const lines: HighlightToken[][] = [[]];
  for (const child of code.childNodes) collectTokens(child, [], lines);
  const document = code.ownerDocument;
  code.replaceChildren();
  lines.forEach((tokens, index) => {
    if (lineNumbers) {
      const line = createHtmlElement(document, 'span');
      line.className = 'code-line';
      const number = createHtmlElement(document, 'span');
      number.className = 'code-line-number';
      number.setAttribute('aria-hidden', 'true');
      number.textContent = String(index + 1);
      const content = createHtmlElement(document, 'span');
      content.className = 'code-line-content';
      appendTokens(content, tokens, document);
      line.append(number, content);
      code.append(line);
      return;
    }
    // WeChat rewrites white-space on pre/code, collapsing newline text nodes;
    // explicit block spans keep the line structure; NBSP keeps intra-line spaces.
    const line = createHtmlElement(document, 'span');
    line.className = 'code-line-block';
    appendTokens(line, tokens, document);
    code.append(line);
  });
}

function wrapScrollSection(pre: Element): void {
  const document = pre.ownerDocument;
  const section = createHtmlElement(document, 'section');
  section.className = 'code-scroll';
  pre.replaceWith(section);
  section.append(pre);
}

/** Artifact header chrome for WeChat layout fidelity.
 *  Mac dots (when enabled) + a vertical spacer only.
 *  Never emit a fake copy control: WeChat strips JS, so click-to-copy cannot
 *  work inside the article body. Preview attaches a live icon button instead. */
function addCodeChrome(pre: Element, macWindow: boolean): void {
  const document = pre.ownerDocument;
  const host = pre.querySelector(':scope > code') ?? pre;
  if (host.querySelector(':scope > .code-window-chrome') !== null) return;
  if (host.querySelector(':scope > .code-window-chrome-spacer') !== null) return;

  // Without Mac dots there is no header chrome to preserve — and never a fake copy.
  if (!macWindow) return;

  pre.classList.add('code-window');

  const chrome = createHtmlElement(document, 'span');
  chrome.className = 'code-window-chrome';
  chrome.setAttribute('aria-hidden', 'true');

  const dots = createHtmlElement(document, 'span');
  dots.className = 'code-window-dots';
  for (const color of ['red', 'yellow', 'green']) {
    const dot = createHtmlElement(document, 'span');
    dot.className = `code-window-dot code-window-dot--${color}`;
    // Non-empty content keeps the span alive after WeChat draft sanitization.
    dot.textContent = '\u00a0';
    dots.append(dot);
  }
  chrome.append(dots);

  // WeChat often collapses header margin/height. Reuse the proven
  // .code-line-block display:block + min-height pattern as a spacer row.
  const spacer = createHtmlElement(document, 'span');
  spacer.className = 'code-line-block code-window-chrome-spacer';
  spacer.setAttribute('aria-hidden', 'true');
  spacer.textContent = '\u00a0';

  host.prepend(chrome, spacer);
}

export function highlightCodeBlocks(
  root: Element,
  options: Readonly<CodeBlockOptions> = { showLineNumbers: false, macWindow: false },
): void {
  for (const code of root.querySelectorAll('pre > code')) {
    const pre = code.parentElement;
    const language = languageFor(code);
    if (language === null) {
      code.classList.add('hljs');
      projectCodeLines(code, options.showLineNumbers);
      if (pre !== null) {
        addCodeChrome(pre, false);
        wrapScrollSection(pre);
      }
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
    projectCodeLines(code, options.showLineNumbers);
    if (pre !== null) {
      addCodeChrome(pre, options.macWindow);
      wrapScrollSection(pre);
    }
  }
}
