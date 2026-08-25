import { describe, expect, it, vi } from 'vitest';

import type { NoteSnapshot } from '../../../src/domain/article';
import type { RenderArtifact } from '../../../src/domain/artifact';
import type { VaultFileRef } from '../../../src/domain/ports';
import { CoverWorkflow } from '../../../src/cover/cover-workflow';
import { publishPayloadHash } from '../../../src/publish/publish-content';

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
  const remoteFetch = vi.fn(async () => ({
    sourceUrl: 'https://cdn.example.test/first.png',
    finalUrl: 'https://cdn.example.test/first.png',
    mimeType: 'image/png' as const,
    bytes: processed,
    contentHash: 'REMOTE_HASH',
  }));
  const workflow = new CoverWorkflow(
    { resolveLink: vi.fn(async (source: string) => source), readBinary: vi.fn(async () => processed) },
    { process: vi.fn(() => processed) },
    { save },
    { generate },
    { processFrontmatter },
    { get: () => ({ globalDefaultCoverPath: 'assets/default.png', imageApiProtocol: 'openai-compatible' as const, imageApiEndpoint: 'https://images.example.test/v1/images/generations', imageApiModel: 'model' }) },
    { get: vi.fn(() => credential), has: vi.fn(() => true) },
    { fetch: remoteFetch },
  );
  return { workflow, frontmatter, processFrontmatter, save, generate, remoteFetch };
}

function anthropicHarness() {
  const current = harness();
  const settings = { get: () => ({
    globalDefaultCoverPath: 'assets/default.png',
    imageApiProtocol: 'anthropic' as const,
    imageApiEndpoint: 'https://api.anthropic.test/v1/images/generations',
    imageApiModel: 'claude-model',
  }) };
  const workflow = new CoverWorkflow(
    { resolveLink: vi.fn(async (source: string) => source), readBinary: vi.fn(async () => processed) },
    { process: vi.fn(() => processed) },
    { save: current.save },
    { generate: current.generate },
    { processFrontmatter: current.processFrontmatter },
    settings,
    { get: vi.fn(() => credential), has: vi.fn(() => true) },
    { fetch: current.remoteFetch },
  );
  return { ...current, workflow };
}

describe('CoverWorkflow', () => {
  it('exposes exactly first image, upload, and ai choices', async () => {
    const current = harness();
    const model = current.workflow.model(snapshot, artifact);

    expect(model.options.map(option => option.kind)).toEqual(['first-image', 'upload', 'ai']);
    expect(model.options.map(option => option.label)).toEqual([
      '文章首图（默认）', '上传本地图片', '智能生成封面',
    ]);
  });

  it('clears explicit frontmatter cover when dynamic first image is confirmed', async () => {
    const current = harness();

    const prepared = await current.workflow.prepareFirstImage(file, artifact);

    expect(prepared.source).toBe('dynamic-first-image');
    expect(prepared.persistence).toBe('CLEAR_EXPLICIT_COVER');
    expect(prepared.vaultPath).toBeNull();
    expect(prepared.contextHash).not.toBe('');
    expect(current.save).not.toHaveBeenCalled();
    expect(current.processFrontmatter).not.toHaveBeenCalled();

    current.frontmatter.cover = 'old-explicit-cover.png';
    await current.workflow.confirm(file, prepared);
    expect(current.frontmatter.cover).toBeUndefined();
    expect(current.frontmatter.custom).toBe('keep');
  });

  it('validates uploaded bytes and preserves state when chooser is cancelled', async () => {
    const current = harness();

    const empty = await current.workflow.prepareUpload(file, new Uint8Array(), 'HASH').catch((error: unknown) => error);
    const forged = await current.workflow.prepareUpload(file, Uint8Array.from([1, 2, 3]), 'HASH').catch((error: unknown) => error);
    expect(empty).toMatchObject({ code: 'COVER_UPLOAD_EMPTY' });
    expect(forged).toMatchObject({ code: 'COVER_UPLOAD_UNSUPPORTED' });

    const cancelled = await current.workflow.prepareUpload(file, processed, publishPayloadHash(artifact));
    expect(cancelled.source).toBe('local-upload');
    expect(cancelled.vaultPath).toBeNull();
    expect(current.save).not.toHaveBeenCalled();
    expect(current.processFrontmatter).not.toHaveBeenCalled();
  });

  it('persists the actual plugin-owned Vault path for uploaded covers', async () => {
    const current = harness();

    const prepared = await current.workflow.prepareUpload(file, processed, publishPayloadHash(artifact));

    expect(prepared.persistence).toBe('SET_EXPLICIT_COVER');
    expect(prepared.vaultPath).toBeNull();
    expect(current.save).not.toHaveBeenCalled();
    await current.workflow.confirm(file, prepared);
    expect(current.frontmatter.cover).toBe('.wechat-workbench/covers/article-test/cover-abcd1234.png');
    expect(current.save).toHaveBeenCalledOnce();
  });

  it('gets the image credential only when AI generation is explicitly requested', async () => {
    const current = harness();
    const model = current.workflow.model(snapshot, artifact);

    expect(model.options.filter(option => option.enabled).map(option => option.kind))
      .toEqual(['first-image', 'upload', 'ai']);
    expect(model.aiEnabled).toBe(true);

    const generated = await current.workflow.prepareAi(file, artifact);
    expect(generated.source).toBe('ai-generated');
    expect(current.generate).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Article', digest: '', apiKey: credential,
      endpoint: 'https://images.example.test/v1/images/generations',
      supplementalPrompt: '',
    }));
    expect(current.save).not.toHaveBeenCalled();
  });

  it('passes the optional prompt only for the current generation session', async () => {
    const current = harness();

    await current.workflow.prepareAi(file, artifact, '电影感、蓝色调');

    expect(current.generate).toHaveBeenCalledWith(expect.objectContaining({
      supplementalPrompt: '电影感、蓝色调',
    }));
  });

  it('omits unchecked title and digest values from the AI cover request', async () => {
    const current = harness();

    await current.workflow.prepareAi(file, artifact, '', {
      includeTitle: false,
      includeDigest: false,
    });

    expect(current.generate).toHaveBeenCalledWith(expect.objectContaining({
      title: '',
      digest: '',
    }));
  });

  it('disables Anthropic image generation without invoking the image generator', async () => {
    const current = anthropicHarness();

    const model = current.workflow.model(snapshot, artifact);

    expect(model.options.find(option => option.kind === 'ai')).toMatchObject({
      enabled: false,
      disabledReason: 'Anthropic 当前只支持封面策划，未提供图片输出。',
    });
    expect(model.aiEnabled).toBe(false);
    await expect(current.workflow.prepareAi(file, artifact)).rejects.toMatchObject({
      code: 'AI_PROVIDER_IMAGE_UNSUPPORTED',
    });
    expect(current.generate).not.toHaveBeenCalled();
  });
});
