import { hashContent } from '../render/canonicalize';
import type { ArticleDraftValues, NoteSnapshot } from '../domain/article';
import type { RenderArtifact } from '../domain/artifact';

export type AiContextPurpose = 'title' | 'digest' | 'cover';

export interface AiArticleContext {
  notePathHash: string;
  sourceHash: string;
  title: string;
  digest: string;
  headings: readonly string[];
  bodyExcerpt: string;
}

interface AiArticleContextInput {
  snapshot: Readonly<NoteSnapshot>;
  artifact: Readonly<RenderArtifact>;
  draft: Readonly<ArticleDraftValues>;
  purpose: AiContextPurpose;
}

const BODY_LIMITS: Readonly<Record<AiContextPurpose, number>> = Object.freeze({
  title: 6_000,
  digest: 6_000,
  cover: 3_000,
});

function sanitizeText(value: string): string {
  return [...value].map(character => {
    const code = character.codePointAt(0) ?? 0;
    return code <= 8 || code === 11 || code === 12 || code >= 14 && code <= 31
      || code === 127 || code >= 128 && code <= 159
      || code >= 0x202a && code <= 0x202e || code >= 0x2066 && code <= 0x2069
      ? ' '
      : character;
  }).join('')
    .replace(/\s+/gu, ' ')
    .trim();
}

function stripFrontmatter(value: string): string {
  return value.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/u, '');
}

function sanitizedBody(value: string): string {
  return sanitizeText(stripFrontmatter(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, ' ')
    .replace(/<!--[\s\S]*?-->/gu, ' ')
    .replace(/```[\s\S]*?```/gu, '\n[代码块]\n')
    .replace(/!\[([^\]]*)\]\([^)]*\)/gu, '$1')
    .replace(/!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/gu, '$1')
    .replace(/<[^>]+>/gu, ' '));
}

function headings(value: string): readonly string[] {
  const result: string[] = [];
  for (const match of value.matchAll(/^#{1,6}\s+(.+)$/gmu)) {
    const heading = sanitizeText(match[1] ?? '');
    if (heading.length > 0) result.push(heading);
  }
  return Object.freeze(result.slice(0, 30));
}

function excerpt(value: string, limit: number): string {
  const characters = [...value];
  if (characters.length <= limit) return value;
  const marker = [...'[内容已截断]'];
  const available = Math.max(0, limit - marker.length);
  const headLength = Math.floor(available * 0.7);
  return [...characters.slice(0, headLength), ...marker, ...characters.slice(-(available - headLength))].join('');
}

export function buildAiArticleContext(
  input: Readonly<AiArticleContextInput>,
): Readonly<AiArticleContext> {
  const title = sanitizeText(input.draft.title).slice(0, 200);
  const digest = sanitizeText(input.draft.digest).slice(0, 500);
  const source = sanitizedBody(input.artifact.plainText.length > 0
    ? input.artifact.plainText
    : input.snapshot.markdown);
  const bodyExcerpt = excerpt(source, BODY_LIMITS[input.purpose]);
  const draftFingerprint = JSON.stringify({ title, author: sanitizeText(input.draft.author), digest });
  return Object.freeze({
    notePathHash: hashContent(input.snapshot.vaultPath).slice(0, 16),
    sourceHash: hashContent(`${input.artifact.source.sourceHash}\n${draftFingerprint}`),
    title,
    digest,
    headings: headings(input.snapshot.markdown),
    bodyExcerpt,
  });
}
