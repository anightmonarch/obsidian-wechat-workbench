import { createHash } from 'node:crypto';

interface StyleDeclaration {
  property: string;
  value: string;
}

function tokenizeValue(value: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let depth = 0;
  for (const character of value) {
    if (character === '(') depth += 1;
    if (character === ')') depth = Math.max(0, depth - 1);
    if (depth === 0 && /\s/u.test(character)) {
      if (current.length > 0) tokens.push(current);
      current = '';
      continue;
    }
    current += character;
  }
  if (current.length > 0) tokens.push(current);
  return tokens;
}

const BORDER_STYLE_KEYWORDS = new Set([
  'none', 'hidden', 'dotted', 'dashed', 'solid', 'double', 'groove', 'ridge', 'inset', 'outset',
]);
const BORDER_WIDTH_KEYWORDS = new Set(['thin', 'medium', 'thick']);

function expandBorderSide(value: string, prefix: string): StyleDeclaration[] {
  const width = (candidate: string): boolean => (
    BORDER_WIDTH_KEYWORDS.has(candidate.toLowerCase())
    || candidate === '0'
    || /^\d+(?:\.\d+)?(?:[a-z%]+)?$/iu.test(candidate)
  );
  let borderWidth: string | null = null;
  let borderStyle: string | null = null;
  let borderColor: string | null = null;
  for (const token of tokenizeValue(value)) {
    const keyword = token.toLowerCase();
    if (BORDER_STYLE_KEYWORDS.has(keyword)) borderStyle = token;
    else if (width(keyword) && borderColor === null && borderStyle === null) borderWidth = token;
    else borderColor = token;
  }
  return [
    { property: `${prefix}-width`, value: borderWidth ?? 'medium' },
    { property: `${prefix}-style`, value: borderStyle ?? 'none' },
    { property: `${prefix}-color`, value: borderColor ?? 'currentcolor' },
  ];
}

function sidesOf(tokens: string[]): readonly [string, string, string, string] | null {
  switch (tokens.length) {
    case 1: {
      const only = tokens[0] ?? '';
      return [only, only, only, only];
    }
    case 2: {
      const vertical = tokens[0] ?? '';
      const horizontal = tokens[1] ?? '';
      return [vertical, horizontal, vertical, horizontal];
    }
    case 3: {
      const top = tokens[0] ?? '';
      const horizontal = tokens[1] ?? '';
      const bottom = tokens[2] ?? '';
      return [top, horizontal, bottom, horizontal];
    }
    case 4: {
      const top = tokens[0] ?? '';
      const right = tokens[1] ?? '';
      const bottom = tokens[2] ?? '';
      const left = tokens[3] ?? '';
      return [top, right, bottom, left];
    }
    default: return null;
  }
}

function isColorValue(token: string): boolean {
  return /^#[0-9a-f]{3,8}$/iu.test(token)
    || /^(?:rgb|rgba|hsl|hsla|color-mix|oklch|oklab|lab|lch)\(/iu.test(token)
    || ['transparent', 'currentcolor'].includes(token.toLowerCase());
}

function expandDeclaration(property: string, value: string): StyleDeclaration[] {
  switch (property) {
    case 'margin':
    case 'padding': {
      const sides = sidesOf(tokenizeValue(value));
      if (sides === null) return [{ property, value }];
      const [top, right, bottom, left] = sides;
      return [
        { property: `${property}-top`, value: top },
        { property: `${property}-right`, value: right },
        { property: `${property}-bottom`, value: bottom },
        { property: `${property}-left`, value: left },
      ];
    }
    case 'border-left':
    case 'border-right':
    case 'border-top':
    case 'border-bottom':
      return expandBorderSide(value, property);
    case 'border': {
      const sides = ['top', 'right', 'bottom', 'left'];
      return sides.flatMap(side => expandBorderSide(value, `border-${side}`));
    }
    case 'background': {
      const tokens = tokenizeValue(value);
      if (tokens.length === 1 && isColorValue(tokens[0] ?? '')) {
        return [{ property: 'background-color', value: tokens[0] ?? value }];
      }
      return [{ property, value }];
    }
    default:
      return [{ property, value }];
  }
}

function canonicalStyle(style: string): string {
  const resolved = new Map<string, string>();
  for (const raw of style.split(';')) {
    const declaration = raw.trim();
    if (declaration.length === 0) continue;
    const separator = declaration.indexOf(':');
    if (separator <= 0) continue;
    const property = declaration.slice(0, separator).trim().toLowerCase();
    const value = declaration.slice(separator + 1).trim();
    if (property.length === 0 || value.length === 0) continue;
    for (const expanded of expandDeclaration(property, value)) {
      resolved.set(expanded.property, expanded.value);
    }
  }
  return [...resolved.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([property, value]) => `${property}: ${value}`)
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
