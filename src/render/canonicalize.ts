import { createHash } from 'node:crypto';

function canonicalStyle(style: string): string {
  return style
    .split(';')
    .map(declaration => declaration.trim())
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right))
    .join('; ');
}

function canonicalizeElement(element: Element): void {
  if (element.matches('ol, ul')) {
    for (const node of [...element.childNodes]) {
      if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim().length === 0) node.remove();
    }
  }
  if (element.hasAttribute('class')) {
    const className = [...element.classList].sort().join(' ');
    if (className.length > 0) element.setAttribute('class', className);
    else element.removeAttribute('class');
  }
  if (element.hasAttribute('style')) {
    const style = canonicalStyle(element.getAttribute('style') ?? '');
    if (style.length > 0) element.setAttribute('style', style);
    else element.removeAttribute('style');
  }

  const attributes = [...element.attributes]
    .map(attribute => [attribute.name, attribute.value] as const)
    .sort(([left], [right]) => left.localeCompare(right));
  for (const attribute of [...element.attributes]) element.removeAttribute(attribute.name);
  for (const [name, value] of attributes) element.setAttribute(name, value);

  for (const child of element.children) canonicalizeElement(child);
}

export function parseArticleRoot(html: string): HTMLElement {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const root = document.body.firstElementChild;
  if (!(root instanceof HTMLElement) || !root.classList.contains('wechat-article')) {
    throw new Error('Rendered article root is missing.');
  }
  return root;
}

export function canonicalizeHtml(html: string): string {
  const root = parseArticleRoot(html);
  canonicalizeElement(root);
  return root.outerHTML;
}

export function hashContent(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}
