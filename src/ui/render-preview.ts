import type { AssetSlot, RenderArtifact } from '../domain/artifact';

export interface PreviewAssetResolver {
  resolve(asset: Readonly<AssetSlot>): Promise<string | null>;
}

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

export class ArticlePreviewRenderer {
  private generation = 0;

  constructor(private readonly assets?: PreviewAssetResolver) {}

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
        image.alt = asset.kind === 'local-image' ? '本地图片' : 'Mermaid 图表';
        image.dataset.assetId = asset.id;
        pending.replaceWith(image);
      }).catch(() => {
        if (this.generation === requestedGeneration && pending.isConnected) {
          pending.textContent = asset.kind === 'local-image' ? '本地图片无法预览' : 'Mermaid 图表生成失败';
        }
      });
    }

    container.replaceChildren(root);
  }

  clear(): void {
    this.generation += 1;
  }
}
