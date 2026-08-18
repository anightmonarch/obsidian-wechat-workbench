import { nativeImage } from 'electron';
import { Buffer } from 'node:buffer';
import type { MermaidConfig } from 'mermaid';

import { hashContent } from './canonicalize';
import { normalizeGeneratedSource, stableAssetId } from './assets';

export interface MermaidEnginePort {
  initialize(config: Readonly<MermaidConfig>): void;
  parse(source: string): Promise<unknown>;
  renderSvg(id: string, source: string): Promise<string>;
}

export interface SvgRasterizerPort {
  toPng(svg: string): Promise<Uint8Array>;
}

export interface GeneratedAsset {
  id: string;
  source: string;
  mimeType: 'image/png';
  bytes: Uint8Array;
  contentHash: string;
}

export class BrowserMermaidEngine implements MermaidEnginePort {
  private config: Readonly<MermaidConfig> | null = null;
  private module: Promise<typeof import('mermaid')> | null = null;

  initialize(config: Readonly<MermaidConfig>): void {
    this.config = config;
  }

  async parse(source: string): Promise<unknown> {
    const mermaid = (await this.load()).default;
    if (this.config === null) throw new Error('Mermaid engine is not initialized.');
    mermaid.initialize(this.config);
    return mermaid.parse(source, { suppressErrors: false });
  }

  async renderSvg(id: string, source: string): Promise<string> {
    const mermaid = (await this.load()).default;
    return (await mermaid.render(id, source)).svg;
  }

  private load(): Promise<typeof import('mermaid')> {
    this.module ??= import('mermaid');
    return this.module;
  }
}

export class ElectronSvgRasterizer implements SvgRasterizerPort {
  async toPng(svg: string): Promise<Uint8Array> {
    if (/<(?:foreignObject|image|script)\b|(?:href|src)\s*=\s*["']https?:|url\(\s*["']?(?!#)/iu.test(svg)) {
      throw new Error('Mermaid SVG contains an external or active resource.');
    }
    const encoded = Buffer.from(svg, 'utf8').toString('base64');
    const image = nativeImage.createFromDataURL(`data:image/svg+xml;base64,${encoded}`);
    if (image.isEmpty()) throw new Error('Mermaid SVG could not be rasterized.');
    return new Uint8Array(image.toPNG());
  }
}

export class DiagramRenderer {
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly engine: MermaidEnginePort,
    private readonly rasterizer: SvgRasterizerPort,
  ) {}

  async renderMermaid(rawSource: string): Promise<GeneratedAsset> {
    const task = this.queue.then(() => this.renderQueued(rawSource));
    this.queue = task.then(() => undefined, () => undefined);
    return task;
  }

  private async renderQueued(rawSource: string): Promise<GeneratedAsset> {
    const source = normalizeGeneratedSource(rawSource);
    const id = stableAssetId('generated-diagram', source);
    this.engine.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      deterministicIds: true,
      deterministicIDSeed: id,
      flowchart: { htmlLabels: false },
    });
    await this.engine.parse(source);
    const svg = await this.engine.renderSvg(`mermaid-${id.slice('asset:'.length, 24)}`, source);
    const bytes = await this.rasterizer.toPng(svg);
    return {
      id,
      source,
      mimeType: 'image/png',
      bytes,
      contentHash: hashContent(bytes),
    };
  }
}
