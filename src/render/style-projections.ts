import type { ImageCaptionMode } from '../domain/style';

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
