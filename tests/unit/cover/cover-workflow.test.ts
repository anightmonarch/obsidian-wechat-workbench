import { describe, expect, it, vi } from 'vitest';

import type { NoteSnapshot } from '../../../src/domain/article';
import type { RenderArtifact } from '../../../src/domain/artifact';
import type { VaultFileRef } from '../../../src/domain/ports';
import { CoverWorkflow } from '../../../src/cover/cover-workflow';

const file: VaultFileRef = { path: '01-公众号/article.md', basename: 'article', modifiedAt: 1 };
const snapshot: Readonly<NoteSnapshot> = Object.freeze({
  vaultPath: file.path, basename: file.basename, modifiedAt: 1, markdown: '# Article',
  frontmatter: Object.freeze({ title: 'Article', custom: 'keep' }),
  metadata: Object.freeze({ title: 'Article', author: '', digest: '', cover: null, contentSourceUrl: '' }),
  selectedThemeId: 'native', sourceHash: 'SOURCE_HASH',
});
const artifact: Readonly<RenderArtifact> = Object.freeze({
  artifactVersion: '1', rendererVersion: '0.1.0',
  source: Object.freeze({ vaultPath: file.path, modifiedAt: 1, sourceHash: 'SOURCE_HASH' }),
  theme: Object.freeze({ id: 'native', version: '1.0.0', contentHash: 'THEME_HASH' }),
  metadata: snapshot.metadata,
  canonicalHtml: '<section class="wechat-article"><p>Body</p></section>', plainText: 'Body',
  assets: Object.freeze([Object.freeze({
    id: 'asset:first', kind: 'local-image' as const, source: 'assets/first.png',
    status: 'resolved' as const, contentHash: 'IMAGE_HASH', resolvedUrl: null,
  })]),
  diagnostics: Object.freeze([]), contentHash: 'CONTENT_HASH',
});
const processed = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const credential = ['SYNTHETIC', 'RUNTIME', 'CREDENTIAL'].join('_');

function harness() {
  const frontmatter: Record<string, unknown> = { title: 'Article', custom: 'keep' };
  const processFrontmatter = vi.fn(async (_file: VaultFileRef, mutate: (value: Record<string, unknown>) => void) => {
    mutate(frontmatter);
  });
  const save = vi.fn(async () => '.wechat-workbench/covers/article-test/cover-abcd1234.png');
  const generate = vi.fn(async () => ({
    bytes: processed, mimeType: 'image/png' as const, contentHash: 'AI_HASH', source: 'base64' as const,
  }));
  const workflow = new CoverWorkflow(
    { resolveLink: vi.fn(async (source: string) => source), readBinary: vi.fn(async () => processed) },
    { process: vi.fn(() => processed) },
    { save },
    { generate },
    { processFrontmatter },
    { get: () => ({ globalDefaultCoverPath: 'assets/default.png', imageApiBaseUrl: 'https://images.example.test', imageApiModel: 'model' }) },
    { get: vi.fn(() => credential), has: vi.fn(() => true) },
  );
  return { workflow, frontmatter, processFrontmatter, save, generate };
}

describe('CoverWorkflow', () => {
  it('prepares an exact local cover without changing article metadata before confirmation', async () => {
    const current = harness();

    const prepared = await current.workflow.prepareLocal(file, 'assets/first.png', 'first-local-image');

    expect(prepared).toMatchObject({
      source: 'first-local-image', vaultPath: '.wechat-workbench/covers/article-test/cover-abcd1234.png',
      mimeType: 'image/png',
    });
    expect(current.processFrontmatter).not.toHaveBeenCalled();
    expect(current.frontmatter).toEqual({ title: 'Article', custom: 'keep' });

    await current.workflow.confirm(file, prepared);
    expect(current.frontmatter).toEqual({
      title: 'Article', custom: 'keep',
      cover: '.wechat-workbench/covers/article-test/cover-abcd1234.png',
    });
  });

  it('gets the image credential only when AI generation is explicitly requested', async () => {
    const current = harness();
    const model = current.workflow.model(snapshot, artifact);

    expect(model.localOptions.filter(option => option.enabled).map(option => option.kind))
      .toEqual(['first-image', 'global-default']);
    expect(model.aiEnabled).toBe(true);

    const generated = await current.workflow.prepareAi(file, artifact);
    expect(generated.source).toBe('ai-generated');
    expect(current.generate).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Article', bodyExcerpt: 'Body', apiKey: credential,
    }));
  });
});
