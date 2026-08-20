import type { EditableArticleSettings } from '../domain/article';
import type { VaultFileRef } from '../domain/ports';
import type { FrontmatterMutationPort } from '../publish/publish-state-store';

function setOrDelete(
  frontmatter: Record<string, unknown>,
  field: string,
  value: string,
): void {
  const normalized = value.trim();
  if (normalized.length === 0) delete frontmatter[field];
  else frontmatter[field] = normalized;
}

export class ArticleSettingsService {
  constructor(private readonly frontmatter: FrontmatterMutationPort) {}

  async update(
    file: VaultFileRef,
    settings: Readonly<EditableArticleSettings>,
  ): Promise<void> {
    await this.frontmatter.processFrontmatter(file, frontmatter => {
      setOrDelete(frontmatter, 'title', settings.title);
      setOrDelete(frontmatter, 'author', settings.author);
      setOrDelete(frontmatter, 'digest', settings.digest);
      setOrDelete(frontmatter, 'content_source_url', settings.contentSourceUrl);
    });
  }
}
