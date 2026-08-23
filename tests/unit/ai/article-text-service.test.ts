import { describe, expect, it, vi } from 'vitest';

import type { AiArticleContext } from '../../../src/ai/article-context';
import {
  ArticleTextGenerationService,
} from '../../../src/ai/article-text-service';
import type { AiTextGenerator } from '../../../src/ai/openai-text-generator';
import type { NoteSnapshot } from '../../../src/domain/article';
import type { RenderArtifact } from '../../../src/domain/artifact';

const credential = ['SYNTHETIC', 'TEXT', 'SERVICE'].join('_');
const snapshot: Readonly<NoteSnapshot> = Object.freeze({
  vaultPath: 'article.md', basename: 'article', modifiedAt: 1, markdown: '# Article\nBody',
  frontmatter: Object.freeze({}),
  metadata: Object.freeze({ title: 'Article', author: 'Author', digest: '', cover: null, contentSourceUrl: '' }),
  selectedThemeId: 'native', sourceHash: 'SOURCE_HASH',
});
const artifact: Readonly<RenderArtifact> = Object.freeze({
  artifactVersion: '1', rendererVersion: '0.1.0',
  source: Object.freeze({ vaultPath: 'article.md', modifiedAt: 1, sourceHash: 'SOURCE_HASH' }),
  theme: Object.freeze({ id: 'native', version: '1.0.0', contentHash: 'THEME_HASH' }),
  metadata: snapshot.metadata, canonicalHtml: '<section>Body</section>', plainText: 'Body',
  assets: Object.freeze([]), diagnostics: Object.freeze([]), contentHash: 'CONTENT_HASH',
});

describe('ArticleTextGenerationService', () => {
  it('combines current draft values with the article artifact and configured text service', async () => {
    const generateTitles = vi.fn(async (request: { endpoint: string; model: string; apiKey: string; context: Readonly<AiArticleContext> }) => {
      expect(request.endpoint).toBe('https://text.example.test/v1/chat/completions');
      expect(request.model).toBe('text-model');
      expect(request.apiKey).toBe(credential);
      expect(request.context.title).toBe('Draft title');
      expect(request.context.digest).toBe('Draft digest');
      return ['标题一', '标题二', '标题三'] as const;
    });
    const generateDigest = vi.fn(async () => '摘要候选');
    const generator: AiTextGenerator = { generateTitles, generateDigest };
    const service = new ArticleTextGenerationService(
      { get: () => ({ textApiEndpoint: 'https://text.example.test/v1/chat/completions', textApiModel: 'text-model' }) },
      { get: () => credential },
      generator,
    );

    const input = { snapshot, artifact, draft: { title: 'Draft title', author: 'Author', digest: 'Draft digest' } };
    await expect(service.generateTitles(input)).resolves.toEqual(['标题一', '标题二', '标题三']);
    await expect(service.generateDigest(input)).resolves.toBe('摘要候选');
    expect(generateTitles).toHaveBeenCalledOnce();
    expect(generateDigest).toHaveBeenCalledOnce();
  });
});
