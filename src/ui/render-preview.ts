import { setIcon } from 'obsidian';

import type { AssetSlot, RenderArtifact } from '../domain/artifact';
import { applyDiagramImagePresentation } from '../render/diagram-image';

export interface PreviewAssetResolver {
  resolve(asset: Readonly<AssetSlot>): Promise<string | null>;
  resolveLocalImage?(path: string): Promise<string | null>;
}

export type PreviewCodeCopy = (value: string) => Promise<void> | void;

const CODE_COPY_SUCCESS_FEEDBACK_MS = 1_000;

function placeholder(className: string, text: string): HTMLButtonElement {
  const button = createEl('button');
  button.type = 'button';
  button.className = className;
  button.textContent = text;
  return button;
}

function safePreviewUrl(value: string | null): string | null {
  return value !== null && /^(?:blob:|data:image\/(?:gif|jpeg|png|webp);base64,)/iu.test(value)
    ? value
    : null;
}

function createHtmlElement<T extends HTMLElement>(document: Document, tagName: string): T {
  return document.createElementNS('http://www.w3.org/1999/xhtml', tagName) as T;
}

function codeText(code: HTMLElement): string {
  const projectedLines = [...code.querySelectorAll<HTMLElement>('.code-line-content')];
  if (projectedLines.length > 0) {
    return projectedLines.map(line => line.textContent ?? '').join('\n');
  }
  const clone = code.cloneNode(true) as HTMLElement;
  for (const decoration of clone.querySelectorAll('.code-window-dots, .code-line-number')) {
    decoration.remove();
  }
  return clone.textContent ?? '';
}

function decorateCodeBlocks(root: HTMLElement, copyText: PreviewCodeCopy): void {
  for (const code of root.querySelectorAll<HTMLElement>('pre > code')) {
    const pre = code.parentElement;
    if (pre === null) continue;
    const frame = createHtmlElement<HTMLDivElement>(root.ownerDocument, 'div');
    frame.className = 'wechat-workbench__code-preview';
    const copy = createHtmlElement<HTMLButtonElement>(root.ownerDocument, 'button');
    copy.type = 'button';
    copy.className = 'wechat-workbench__code-copy';
    copy.dataset.testid = 'code-copy';
    copy.setAttribute('aria-label', '复制代码');
    copy.setAttribute('aria-live', 'polite');
    setIcon(copy, 'copy');
    let resetTimer: number | null = null;
    copy.addEventListener('click', () => {
      if (resetTimer !== null) {
        window.clearTimeout(resetTimer);
        resetTimer = null;
      }
      copy.disabled = true;
      copy.setAttribute('aria-label', '正在复制代码');
      void Promise.resolve(copyText(codeText(code))).then(() => {
        setIcon(copy, 'check');
        copy.setAttribute('aria-label', '代码已复制');
        resetTimer = window.setTimeout(() => {
          setIcon(copy, 'copy');
          copy.setAttribute('aria-label', '复制代码');
          resetTimer = null;
        }, CODE_COPY_SUCCESS_FEEDBACK_MS);
      }).catch(() => {
        setIcon(copy, 'circle-alert');
        copy.setAttribute('aria-label', '复制失败，点击重试');
      }).finally(() => {
        copy.disabled = false;
      });
    });
    pre.replaceWith(frame);
    frame.append(pre, copy);
  }
}

export class ArticlePreviewRenderer {
  private generation = 0;

  constructor(
    private readonly assets?: PreviewAssetResolver,
    private readonly copyText: PreviewCodeCopy = value => navigator.clipboard.writeText(value),
  ) {}

  render(container: HTMLElement, artifact: Readonly<RenderArtifact>): void {
    this.generation += 1;
    const requestedGeneration = this.generation;
    const parsed = new DOMParser().parseFromString(artifact.canonicalHtml, 'text/html');
    const parsedRoot = parsed.body.firstElementChild;
    if (parsedRoot === null || !parsedRoot.classList.contains('wechat-article')) {
      container.replaceChildren(placeholder('wechat-workbench__preview-error', '预览产物无效'));
      return;
    }
    const root = document.importNode(parsedRoot, true) as HTMLElement;
    const byId = new Map(artifact.assets.map(asset => [asset.id, asset]));

    for (const node of root.querySelectorAll<HTMLElement>('[data-asset-id]')) {
      const id = node.dataset.assetId;
      const asset = id === undefined ? undefined : byId.get(id);
      if (asset === undefined || asset.kind === 'generated-math') continue;

      if (asset.kind === 'remote-image') {
        node.replaceWith(placeholder(
          'wechat-workbench__remote-placeholder',
          `远程图片待加载 · ${node.getAttribute('alt') ?? '未命名图片'}`,
        ));
        continue;
      }

      const pending = placeholder(
        'wechat-workbench__asset-placeholder',
        asset.kind === 'local-image' ? '正在读取本地图片…' : '正在生成 Mermaid 图表…',
      );
      node.replaceWith(pending);
      if (this.assets === undefined) {
        pending.textContent = asset.kind === 'local-image' ? '本地图片已解析' : 'Mermaid 图表待生成';
        continue;
      }
      void this.assets.resolve(asset).then(value => {
        if (this.generation !== requestedGeneration || !pending.isConnected) return;
        const url = safePreviewUrl(value);
        if (url === null) {
          pending.textContent = asset.kind === 'local-image' ? '本地图片无法预览' : 'Mermaid 图表生成失败';
          return;
        }
        const image = createEl('img');
        image.src = url;
        if (asset.kind === 'generated-diagram') applyDiagramImagePresentation(image, 'Mermaid 图表');
        else image.alt = '本地图片';
        image.dataset.assetId = asset.id;
        pending.replaceWith(image);
      }).catch(() => {
        if (this.generation === requestedGeneration && pending.isConnected) {
          pending.textContent = asset.kind === 'local-image' ? '本地图片无法预览' : 'Mermaid 图表生成失败';
        }
      });
    }

    decorateCodeBlocks(root, this.copyText);

    container.replaceChildren(root);
  }

  clear(): void {
    this.generation += 1;
  }
}
