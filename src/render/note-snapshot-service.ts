import { createHash } from 'node:crypto';

import type { ArticleMetadata, NoteSnapshot } from '../domain/article';
import type { VaultFileRef, VaultPort } from '../domain/ports';

export interface MetadataPort {
  getFrontmatter(path: string): Readonly<Record<string, unknown>>;
}

export interface SnapshotDefaults {
  defaultAuthor: string;
  defaultSourceUrl: string;
  defaultThemeId: string;
}

function normalizedMarkdown(markdown: string): string {
  return markdown.replace(/\r\n?/gu, '\n');
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function nonEmptyString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

function optionalString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) {
    return value;
  }

  for (const nested of Object.values(value)) {
    deepFreeze(nested);
  }
  return Object.freeze(value);
}

function clonedFrontmatter(frontmatter: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  return deepFreeze(structuredClone(frontmatter));
}

function articleMetadata(
  file: VaultFileRef,
  frontmatter: Readonly<Record<string, unknown>>,
  defaults: SnapshotDefaults,
): Readonly<ArticleMetadata> {
  const cover = optionalString(frontmatter.cover);
  return Object.freeze({
    title: nonEmptyString(frontmatter.title, file.basename),
    author: nonEmptyString(frontmatter.author, defaults.defaultAuthor),
    digest: optionalString(frontmatter.digest),
    cover: cover.length > 0 ? cover : null,
    contentSourceUrl: nonEmptyString(
      frontmatter.content_source_url,
      defaults.defaultSourceUrl,
    ),
  });
}

export class NoteSnapshotService {
  constructor(
    private readonly vault: VaultPort,
    private readonly metadata: MetadataPort,
    private readonly defaults: SnapshotDefaults,
  ) {}

  async snapshot(file: VaultFileRef): Promise<Readonly<NoteSnapshot>> {
    const markdown = normalizedMarkdown(await this.vault.readText(file.path));
    const frontmatter = clonedFrontmatter(this.metadata.getFrontmatter(file.path));
    const snapshot: NoteSnapshot = {
      vaultPath: file.path,
      basename: file.basename,
      modifiedAt: file.modifiedAt,
      markdown,
      frontmatter,
      metadata: articleMetadata(file, frontmatter, this.defaults),
      selectedThemeId: nonEmptyString(
        frontmatter['wechat-theme-id'],
        this.defaults.defaultThemeId,
      ),
      sourceHash: sha256(markdown),
    };

    return deepFreeze(snapshot);
  }
}
