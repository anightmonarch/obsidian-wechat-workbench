import type { ImageCaptionMode } from '../domain/style';
import { readingTime } from './reading-time';

const WECHAT_OFFICIAL_HOST = 'mp.weixin.qq.com';

function createHtmlElement(document: Document, tagName: string): HTMLElement {
  return document.createElementNS('http://www.w3.org/1999/xhtml', tagName);
}

function imageFilename(source: string): string {
  const withoutQuery = source.split(/[?#]/u, 1)[0] ?? source;
  const basename = withoutQuery.split(/[\\/]/u).pop() ?? withoutQuery;
  return basename.replace(/\.[^.]+$/u, '');
}

function captionFor(image: HTMLImageElement, mode: ImageCaptionMode): string | null {
  if (mode === 'none') return null;
  const title = image.getAttribute('title')?.trim() ?? '';
  const alt = image.getAttribute('alt')?.trim() ?? '';
  const filename = imageFilename(image.getAttribute('data-asset-source') ?? '');
  switch (mode) {
    case 'title-alt': return title || alt || null;
    case 'alt-title': return alt || title || null;
    case 'title': return title || null;
    case 'alt': return alt || null;
    case 'filename': return filename || null;
  }
}

function isWhitespaceText(node: Node): boolean {
  return node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim().length === 0;
}

export function applyImageCaptions(root: Element, mode: ImageCaptionMode): void {
  for (const paragraph of [...root.querySelectorAll('p')]) {
    const children = [...paragraph.children];
    if (children.length !== 1 || children[0]?.tagName !== 'IMG') continue;
    if ([...paragraph.childNodes].some(node => !isWhitespaceText(node) && node.nodeType !== Node.ELEMENT_NODE)) continue;

    const image = children[0] as HTMLImageElement;
    const figure = createHtmlElement(root.ownerDocument, 'figure');
    figure.className = 'image-figure';
    figure.append(image);
    const caption = captionFor(image, mode);
    if (caption !== null) {
      const figcaption = createHtmlElement(root.ownerDocument, 'figcaption');
      figcaption.className = 'image-caption';
      figcaption.textContent = caption;
      figure.append(figcaption);
    }
    paragraph.replaceWith(figure);
  }
}

export function applyReadingSummary(root: Element, markdown: string, enabled: boolean): void {
  if (!enabled) return;

  const result = readingTime(markdown);
  if (result.words === 0) return;

  const blockquote = createHtmlElement(root.ownerDocument, 'blockquote');
  blockquote.className = 'reading-summary';
  const paragraph = createHtmlElement(root.ownerDocument, 'p');
  paragraph.textContent = `字数 ${result.words}，阅读大约需 ${Math.ceil(result.minutes)} 分钟`;
  blockquote.append(paragraph);
  root.prepend(blockquote);
}

export function applyExternalLinkCitations(root: Element, enabled: boolean): void {
  if (!enabled) return;

  const references = new Map<string, { index: number; label: string; href: string }>();
  for (const anchor of root.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    const href = anchor.getAttribute('href')?.trim() ?? '';
    let url: URL;
    try {
      url = new URL(href);
    } catch {
      continue;
    }

    if (!['http:', 'https:'].includes(url.protocol)
      || url.hostname === WECHAT_OFFICIAL_HOST
      || anchor.textContent?.trim() === href) {
      continue;
    }

    let reference = references.get(url.href);
    if (reference === undefined) {
      reference = {
        index: references.size + 1,
        label: anchor.getAttribute('title')?.trim() || anchor.textContent?.trim() || url.href,
        href: url.href,
      };
      references.set(url.href, reference);
    }

    const superscript = createHtmlElement(root.ownerDocument, 'sup');
    superscript.className = 'external-link-reference';
    superscript.textContent = `[${reference.index}]`;
    anchor.append(superscript);
  }

  if (references.size === 0) return;

  const section = createHtmlElement(root.ownerDocument, 'section');
  section.className = 'external-link-references';
  const heading = createHtmlElement(root.ownerDocument, 'h4');
  heading.textContent = '引用链接';
  section.append(heading);

  const list = createHtmlElement(root.ownerDocument, 'ol');
  for (const reference of references.values()) {
    const item = createHtmlElement(root.ownerDocument, 'li');
    const link = createHtmlElement(root.ownerDocument, 'a');
    link.setAttribute('href', reference.href);
    link.textContent = reference.label;
    item.append(link);
    list.append(item);
  }
  section.append(list);
  root.append(section);
}
