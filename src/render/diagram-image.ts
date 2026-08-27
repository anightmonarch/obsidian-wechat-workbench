const DIAGRAM_IMAGE_STYLE: Readonly<Record<string, string>> = Object.freeze({
  'border-radius': '6px',
  'box-shadow': 'none',
  display: 'block',
  height: 'auto',
  margin: '1.5em 0',
  'max-width': '100%',
  width: '100%',
});

export function applyDiagramImagePresentation(image: HTMLElement, alt: string): void {
  image.setAttribute('alt', alt);
  image.setCssProps(DIAGRAM_IMAGE_STYLE);
}
