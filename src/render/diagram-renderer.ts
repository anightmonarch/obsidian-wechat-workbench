import { Buffer } from 'node:buffer';
import type { MermaidConfig } from 'mermaid';

import { hashContent } from './canonicalize';
import { normalizeGeneratedSource, stableAssetId } from './assets';

const MIN_RASTER_WIDTH = 1200;
const MIN_RASTER_SCALE = 2;
const MAX_RASTER_DIMENSION = 4096;

function rasterSize(width: number, height: number): Readonly<{ width: number; height: number }> {
  const desiredScale = Math.max(MIN_RASTER_SCALE, MIN_RASTER_WIDTH / width);
  const boundedScale = Math.min(
    desiredScale,
    Math.max(1, MAX_RASTER_DIMENSION / width),
    Math.max(1, MAX_RASTER_DIMENSION / height),
  );
  return Object.freeze({
    width: Math.round(width * boundedScale),
    height: Math.round(height * boundedScale),
  });
}

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
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Mermaid SVG could not be rasterized.'));
      image.src = `data:image/svg+xml;base64,${encoded}`;
    });

    const width = image.naturalWidth;
    const height = image.naturalHeight;
    if (width <= 0 || height <= 0) throw new Error('Mermaid SVG could not be rasterized.');
    const output = rasterSize(width, height);

    const canvas = createEl('canvas');
    canvas.width = output.width;
    canvas.height = output.height;
    const context = canvas.getContext('2d');
    if (context === null) throw new Error('Mermaid SVG could not be rasterized.');
    context.drawImage(image, 0, 0, output.width, output.height);

    const png = canvas.toDataURL('image/png');
    const separator = png.indexOf(',');
    if (separator === -1) throw new Error('Mermaid SVG could not be rasterized.');
    return new Uint8Array(Buffer.from(png.slice(separator + 1), 'base64'));
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
      htmlLabels: false,
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
