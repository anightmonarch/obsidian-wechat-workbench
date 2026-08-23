import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

import type { NoteSnapshot } from '../../../src/domain/article';
import type { BinaryFilePort } from '../../../src/domain/ports';
import { stableAssetId } from '../../../src/render/assets';
import { RenderArtifactBuilder } from '../../../src/render/artifact-builder';
import { markdownToSafeHtml } from '../../../src/render/markdown-pipeline';
import { DEFAULT_ARTICLE_STYLE, patchArticleStyle } from '../../../src/styles/style-config';
import { BUILTIN_THEMES } from '../../../src/themes/builtin';

function snapshot(markdown: string): Readonly<NoteSnapshot> {
  return Object.freeze({
    vaultPath: 'articles/post.md',
    basename: 'post',
    modifiedAt: 100,
    markdown,
    frontmatter: Object.freeze({}),
    metadata: Object.freeze({
      title: 'Rich article', author: '', digest: '', cover: null, contentSourceUrl: '',
    }),
    selectedThemeId: 'native',
    sourceHash: 'source-hash',
  });
}

const nativeTheme = BUILTIN_THEMES.find(theme => theme.manifest.id === 'native');
if (nativeTheme === undefined) throw new Error('Native theme fixture is missing.');

describe('article image assets', () => {
  it('makes image markup inert before any DOM parser sees it', async () => {
    const html = await markdownToSafeHtml('![remote](https://example.test/image.png)');

    expect(html).not.toContain(' src=');
    expect(html).toContain('data-asset-source="https://example.test/image.png"');
  });

  it('creates a stable unresolved slot without loading a remote image', async () => {
    const resolveLink = vi.fn();
    const readBinary = vi.fn();
    const files: BinaryFilePort = {
      resolveLink,
      readBinary,
    };

    const artifact = await new RenderArtifactBuilder(files).build(
      snapshot('![remote](https://EXAMPLE.test:443/a/../image.png?size=2#preview)'),
      nativeTheme,
    );

    expect(resolveLink).not.toHaveBeenCalled();
    expect(readBinary).not.toHaveBeenCalled();
    expect(artifact.assets).toEqual([{
      id: stableAssetId('remote-image', 'https://example.test/image.png?size=2'),
      kind: 'remote-image',
      source: 'https://example.test/image.png?size=2',
      status: 'unresolved',
      contentHash: null,
      resolvedUrl: null,
    }]);
    expect(artifact.canonicalHtml).not.toContain('https://example.test/image.png');
    expect(artifact.canonicalHtml).toContain(`data-asset-id="${artifact.assets[0]?.id}"`);
  });

  it('resolves Markdown and Obsidian local image links without embedding bytes', async () => {
    const bytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47]);
    const resolveLink = vi.fn(async (source: string) => source === 'assets/photo one.png' ? 'media/photo one.png' : null);
    const readBinary = vi.fn(async () => bytes);
    const files: BinaryFilePort = {
      resolveLink,
      readBinary,
    };
    const markdown = [
      '![Markdown image](<assets/photo one.png>)',
      '![[assets/photo one.png|Obsidian image]]',
    ].join('\n\n');

    const artifact = await new RenderArtifactBuilder(files).build(snapshot(markdown), nativeTheme);

    expect(artifact.assets).toHaveLength(1);
    expect(artifact.assets[0]).toMatchObject({
      kind: 'local-image',
      source: 'media/photo one.png',
      status: 'resolved',
      contentHash: createHash('sha256').update(bytes).digest('hex'),
      resolvedUrl: null,
    });
    expect(readBinary).toHaveBeenCalledTimes(1);
    expect(artifact.canonicalHtml).not.toContain('data:image');
  });

  it('keeps local and remote images compatible with styled preview output', async () => {
    const bytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47]);
    const files: BinaryFilePort = {
      resolveLink: vi.fn(async () => 'media/photo.png'),
      readBinary: vi.fn(async () => bytes),
    };
    const style = patchArticleStyle(DEFAULT_ARTICLE_STYLE, { imageCaption: 'alt' });

    const artifact = await new RenderArtifactBuilder(files).build(
      snapshot([
        '![本地图片](<assets/photo.png>)',
        '![远程图片](https://example.test/remote.png)',
      ].join('\n\n')),
      nativeTheme,
      style,
    );

    expect(artifact.assets).toHaveLength(2);
    expect(artifact.assets.map(asset => asset.kind)).toEqual(['local-image', 'remote-image']);
    expect(artifact.canonicalHtml).toContain('class="image-figure"');
    expect(artifact.canonicalHtml).toContain('class="image-caption"');
    expect(artifact.canonicalHtml).toContain('本地图片');
    expect(artifact.canonicalHtml).toContain('data-asset-id');
    expect(artifact.canonicalHtml).not.toContain('src="https://example.test/remote.png"');
  });

  it('keeps a missing local image explicit and unresolved', async () => {
    const resolveLink = vi.fn(async () => null);
    const readBinary = vi.fn();
    const files: BinaryFilePort = {
      resolveLink,
      readBinary,
    };

    const artifact = await new RenderArtifactBuilder(files).build(
      snapshot('![missing](missing.png)'),
      nativeTheme,
    );

    expect(artifact.assets[0]).toMatchObject({
      kind: 'local-image',
      source: 'missing.png',
      status: 'unresolved',
      contentHash: null,
    });
    expect(artifact.diagnostics.map(item => item.code)).toContain('LOCAL_ASSET_UNRESOLVED');
  });

  it('removes insecure HTTP images instead of treating them as Vault files', async () => {
    const resolveLink = vi.fn();
    const files: BinaryFilePort = { resolveLink, readBinary: vi.fn() };

    const artifact = await new RenderArtifactBuilder(files).build(
      snapshot('![insecure](http://example.test/image.png)'),
      nativeTheme,
    );

    expect(resolveLink).not.toHaveBeenCalled();
    expect(artifact.assets).toEqual([]);
    expect(artifact.canonicalHtml).not.toContain('<img');
    expect(artifact.diagnostics.map(item => item.code)).toContain('REMOTE_ASSET_INSECURE');
  });

  it('turns a local resolver failure into a diagnostic instead of aborting the render', async () => {
    const files: BinaryFilePort = {
      resolveLink: vi.fn(async () => { throw new Error('adapter unavailable'); }),
      readBinary: vi.fn(),
    };

    const artifact = await new RenderArtifactBuilder(files).build(
      snapshot('![local](image.png)'),
      nativeTheme,
    );

    expect(artifact.assets[0]).toMatchObject({ source: 'image.png', status: 'unresolved' });
    expect(artifact.diagnostics.map(item => item.code)).toContain('LOCAL_ASSET_UNRESOLVED');
  });
});
