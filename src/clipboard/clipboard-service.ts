import type { RenderArtifact } from '../domain/artifact';

export interface ClipboardWrite {
  html?: string;
  text: string;
}

export interface ClipboardPort {
  write(content: Readonly<ClipboardWrite>): void;
}

export interface ClipboardAssetResolverPort {
  resolve(artifact: Readonly<RenderArtifact>): Promise<string>;
}

export interface CopyResult {
  mode: 'rich' | 'source';
  contentHash: string;
}

export class ClipboardService {
  constructor(
    private readonly assets: ClipboardAssetResolverPort,
    private readonly clipboard: ClipboardPort,
  ) {}

  async copyForWeChat(artifact: Readonly<RenderArtifact>): Promise<Readonly<CopyResult>> {
    const html = await this.assets.resolve(artifact);
    this.clipboard.write({ html, text: artifact.plainText });
    return Object.freeze({ mode: 'rich', contentHash: artifact.contentHash });
  }

  async copyHtmlSource(artifact: Readonly<RenderArtifact>): Promise<Readonly<CopyResult>> {
    this.clipboard.write({ text: artifact.canonicalHtml });
    return Object.freeze({ mode: 'source', contentHash: artifact.contentHash });
  }
}
