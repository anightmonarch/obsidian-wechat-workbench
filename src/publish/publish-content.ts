import { canonicalizeHtml, hashContent } from '../render/canonicalize';
import type { RenderArtifact } from '../domain/artifact';
import type { PublishCommand } from './publish-types';

export function normalizedFinalHtmlHash(html: string): string {
  try { return hashContent(canonicalizeHtml(html)); } catch { return hashContent(html); }
}

export function publishPayloadHash(artifact: Readonly<RenderArtifact>): string {
  return hashContent(JSON.stringify([
    artifact.metadata.title,
    artifact.metadata.author,
    artifact.metadata.digest,
    artifact.metadata.contentSourceUrl,
    artifact.contentHash,
    artifact.theme.id,
    artifact.theme.version,
    artifact.theme.contentHash,
  ]));
}

export function transactionFingerprint(command: Readonly<PublishCommand>): string {
  return hashContent(JSON.stringify([
    command.accountHash,
    command.file.path,
    command.payloadHash,
    command.coverPath,
    command.coverHash,
  ]));
}
