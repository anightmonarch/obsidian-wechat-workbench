import { describe, expect, it, vi } from 'vitest';

import type { AiArticleContext } from '../../../src/ai/article-context';
import {
  ArticleTextGenerationService,
} from '../../../src/ai/article-text-service';
import { CodexRuntimeError } from '../../../src/codex/codex-errors';
import type { LocalTextGenerator } from '../../../src/ai/codex-text-generator';
import type { AiTextGenerator } from '../../../src/ai/openai-text-generator';
import type { NoteSnapshot } from '../../../src/domain/article';
import type { RenderArtifact } from '../../../src/domain/artifact';
import { DEFAULT_SETTINGS } from '../../../src/settings/model';

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
    const aiProviders = {
      ...DEFAULT_SETTINGS.aiProviders,
      text: {
        ...DEFAULT_SETTINGS.aiProviders.text,
        activeProvider: 'agnes' as const,
        providers: {
          ...DEFAULT_SETTINGS.aiProviders.text.providers,
          agnes: {
            ...DEFAULT_SETTINGS.aiProviders.text.providers.agnes,
            baseUrl: 'https://text.example.test/v1',
            model: 'text-model',
          },
        },
      },
    };
    const localGenerator: LocalTextGenerator = {
      generateTitles: vi.fn(async () => ['本地一', '本地二', '本地三']),
      generateDigest: vi.fn(async () => '本地摘要'),
    };
    const service = new ArticleTextGenerationService(
      { get: () => ({ aiProviders, textGenerationBackend: 'api' as const }) },
      { get: () => credential },
      generator,
      localGenerator,
    );

    const input = { snapshot, artifact, draft: { title: 'Draft title', author: 'Author', digest: 'Draft digest' } };
    await expect(service.generateTitles(input)).resolves.toEqual(['标题一', '标题二', '标题三']);
    await expect(service.generateDigest(input)).resolves.toBe('摘要候选');
    expect(generateTitles).toHaveBeenCalledOnce();
    expect(generateDigest).toHaveBeenCalledOnce();
  });

  it('uses the configured Codex backend without resolving a provider secret', async () => {
    const apiTitles = vi.fn(async () => ['远程一', '远程二', '远程三']);
    const apiGenerator: AiTextGenerator = {
      generateTitles: apiTitles,
      generateDigest: vi.fn(async () => '远程摘要'),
    };
    const localTitles = vi.fn(async (
      request: Parameters<LocalTextGenerator['generateTitles']>[0],
    ) => {
      expect(request.context.title).toBe('Draft title');
      return ['本地一', '本地二', '本地三'];
    });
    const localGenerator: LocalTextGenerator = {
      generateTitles: localTitles,
      generateDigest: vi.fn(async () => '本地摘要'),
    };
    const secretGet = vi.fn(() => credential);
    const service = new ArticleTextGenerationService(
      { get: () => ({
        aiProviders: DEFAULT_SETTINGS.aiProviders,
        textGenerationBackend: 'codex' as const,
      }) },
      { get: secretGet },
      apiGenerator,
      localGenerator,
    );
    const input = {
      snapshot,
      artifact,
      draft: { title: 'Draft title', author: 'Author', digest: 'Draft digest' },
    };

    await expect(service.generateTitles(input)).resolves.toEqual(['本地一', '本地二', '本地三']);
    expect(localTitles).toHaveBeenCalledOnce();
    expect(apiTitles).not.toHaveBeenCalled();
    expect(secretGet).not.toHaveBeenCalled();
  });

  it('uses a one-call API override without mutating the saved Codex default', async () => {
    const backend = { value: 'codex' as const };
    const apiDigest = vi.fn(async () => '远程摘要');
    const apiGenerator: AiTextGenerator = {
      generateTitles: vi.fn(async () => ['远程一', '远程二', '远程三']),
      generateDigest: apiDigest,
    };
    const localDigest = vi.fn(async () => '本地摘要');
    const localGenerator: LocalTextGenerator = {
      generateTitles: vi.fn(async () => ['本地一', '本地二', '本地三']),
      generateDigest: localDigest,
    };
    const service = new ArticleTextGenerationService(
      { get: () => ({ aiProviders: {
        ...DEFAULT_SETTINGS.aiProviders,
        text: {
          ...DEFAULT_SETTINGS.aiProviders.text,
          activeProvider: 'deepseek' as const,
        },
      }, textGenerationBackend: backend.value }) },
      { get: () => credential },
      apiGenerator,
      localGenerator,
    );

    await expect(service.generateDigest({
      snapshot,
      artifact,
      draft: { title: 'Draft', author: '', digest: '' },
      backend: 'api',
    })).resolves.toBe('远程摘要');
    expect(apiDigest).toHaveBeenCalledOnce();
    expect(localDigest).not.toHaveBeenCalled();
    expect(backend.value).toBe('codex');
  });

  it('never falls back to API when Codex fails', async () => {
    const apiTitles = vi.fn(async () => ['远程一', '远程二', '远程三']);
    const apiGenerator: AiTextGenerator = {
      generateTitles: apiTitles,
      generateDigest: vi.fn(async () => '远程摘要'),
    };
    const localGenerator: LocalTextGenerator = {
      generateTitles: vi.fn(async () => { throw new CodexRuntimeError('CODEX_PROCESS_FAILED'); }),
      generateDigest: vi.fn(async () => '本地摘要'),
    };
    const service = new ArticleTextGenerationService(
      { get: () => ({
        aiProviders: DEFAULT_SETTINGS.aiProviders,
        textGenerationBackend: 'codex' as const,
      }) },
      { get: () => credential },
      apiGenerator,
      localGenerator,
    );

    await expect(service.generateTitles({
      snapshot,
      artifact,
      draft: { title: 'Draft', author: '', digest: '' },
    })).rejects.toMatchObject({ code: 'CODEX_PROCESS_FAILED' });
    expect(apiTitles).not.toHaveBeenCalled();
  });
});
