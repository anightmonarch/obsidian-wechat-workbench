import mermaid, { type MermaidConfig } from 'mermaid';

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
  initialize(config: Readonly<MermaidConfig>): void {
    mermaid.initialize(config);
  }

  async parse(source: string): Promise<unknown> {
    return mermaid.parse(source, { suppressErrors: false });
  }

  async renderSvg(id: string, source: string): Promise<string> {
    return (await mermaid.render(id, source)).svg;
  }
}

export class DiagramRenderer {
  constructor(
    private readonly engine: MermaidEnginePort,
    private readonly rasterizer: SvgRasterizerPort,
  ) {}

  async renderMermaid(rawSource: string): Promise<GeneratedAsset> {
    const source = normalizeGeneratedSource(rawSource);
    const id = stableAssetId('generated-diagram', source);
    this.engine.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      deterministicIds: true,
      deterministicIDSeed: id,
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
