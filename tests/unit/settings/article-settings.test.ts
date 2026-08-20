import { describe, expect, it, vi } from 'vitest';

import type { VaultFileRef } from '../../../src/domain/ports';
import { ArticleSettingsService } from '../../../src/settings/article-settings';

describe('ArticleSettingsService', () => {
  it('writes trimmed editable fields and removes empty frontmatter values', async () => {
    const frontmatter: Record<string, unknown> = {
      title: 'Old title',
      author: 'Old author',
      digest: 'Old digest',
      content_source_url: 'https://old.example.com',
      keep_me: 'preserved',
    };
    const processFrontmatter = vi.fn(async (
      _file: VaultFileRef,
      mutate: (value: Record<string, unknown>) => void,
    ) => mutate(frontmatter));
    const service = new ArticleSettingsService({ processFrontmatter });
    const file = { path: 'article.md', basename: 'article', modifiedAt: 1 };

    await service.update(file, {
      title: '  Updated title  ',
      author: '   ',
      digest: ' Updated digest ',
      contentSourceUrl: '',
    });

    expect(processFrontmatter).toHaveBeenCalledOnce();
    expect(frontmatter).toEqual({
      title: 'Updated title',
      digest: 'Updated digest',
      keep_me: 'preserved',
    });
  });
});
