import type { NoteSnapshot } from '../domain/article';
import type { RenderArtifact } from '../domain/artifact';
import type { DefaultCoverStrategy } from '../settings/model';

export type CoverCandidateSource =
  | 'frontmatter-cover'
  | 'first-local-image'
  | 'configured-default';

export interface CoverSelection {
  strategy: DefaultCoverStrategy;
}

export interface CoverResolutionContext {
  snapshot: Readonly<NoteSnapshot>;
  artifact: Readonly<RenderArtifact>;
  globalDefaultPath: string | null;
}

export interface CoverCandidate {
  source: CoverCandidateSource;
  vaultPath: string;
}
