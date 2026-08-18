import type { ArticleMetadata } from './article';

export type AssetKind =
  | 'local-image'
  | 'remote-image'
  | 'generated-diagram'
  | 'generated-math';

export interface AssetSlot {
  id: string;
  kind: AssetKind;
  source: string;
  status: 'unresolved' | 'resolved';
  contentHash: string | null;
  resolvedUrl: string | null;
}

export type DiagnosticSeverity = 'BLOCKING' | 'WARNING' | 'INFO';

export interface Diagnostic {
  code: string;
  severity: DiagnosticSeverity;
  message: string;
  source: string | null;
}

export interface RenderArtifact {
  artifactVersion: string;
  rendererVersion: string;
  source: Readonly<{
    vaultPath: string;
    modifiedAt: number;
    sourceHash: string;
  }>;
  theme: Readonly<{
    id: string;
    version: string;
    contentHash: string;
  }>;
  metadata: Readonly<ArticleMetadata>;
  canonicalHtml: string;
  plainText: string;
  assets: readonly AssetSlot[];
  diagnostics: readonly Diagnostic[];
  contentHash: string;
}
