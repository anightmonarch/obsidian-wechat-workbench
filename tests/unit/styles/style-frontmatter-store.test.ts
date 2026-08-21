import { describe, expect, it } from 'vitest';

import type { VaultFileRef } from '../../../src/domain/ports';
import { DEFAULT_ARTICLE_STYLE, patchArticleStyle, serializeArticleStyle } from '../../../src/styles/style-config';
import { StyleFrontmatterStore } from '../../../src/styles/style-frontmatter-store';

describe('StyleFrontmatterStore', () => {
  it('writes only the article style fields atomically and preserves unrelated fields', async () => {
    const frontmatter: Record<string, unknown> = {
      title: 'Keep me',
      nested: { preserve: true },
    };
    let processedFile: VaultFileRef | null = null;
    const writer = {
      async processFrontmatter(file: VaultFileRef, mutate: (value: Record<string, unknown>) => void) {
        processedFile = file;
        mutate(frontmatter);
      },
    };
    const file: VaultFileRef = { path: 'article.md', basename: 'article', modifiedAt: 1 };
    const style = patchArticleStyle(DEFAULT_ARTICLE_STYLE, { themeId: 'doocs-grace' });

    await new StyleFrontmatterStore(writer).save(file, style);

    expect(processedFile).toBe(file);
    expect(frontmatter).toMatchObject({
      title: 'Keep me',
      nested: { preserve: true },
      'wechat-theme-id': style.themeId,
      'wechat-style': serializeArticleStyle(style),
    });
    expect(frontmatter).not.toHaveProperty('css');
    expect(frontmatter).not.toHaveProperty('html');
  });
});
