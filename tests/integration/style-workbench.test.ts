import { describe, expect, it } from 'vitest';

import type { NoteSnapshot } from '../../src/domain/article';
import { RenderArtifactBuilder } from '../../src/render/artifact-builder';
import { publishPayloadHash } from '../../src/publish/publish-content';
import { CodeThemeRegistry } from '../../src/styles/code-theme-registry';
import { DEFAULT_ARTICLE_STYLE, patchArticleStyle, serializeArticleStyle } from '../../src/styles/style-config';
import { StyleCompiler } from '../../src/styles/style-compiler';
import { StyleFrontmatterStore } from '../../src/styles/style-frontmatter-store';
import { StyleResolver } from '../../src/styles/style-resolver';
import { StyleWorkflow } from '../../src/styles/style-workflow';
import { BUILTIN_THEMES } from '../../src/themes/builtin';

function snapshot(frontmatter: Readonly<Record<string, unknown>>): Readonly<NoteSnapshot> {
  return Object.freeze({
    vaultPath: 'article.md', basename: 'article', modifiedAt: 1,
    markdown: '# Article\n\nA paragraph.', frontmatter: Object.freeze(frontmatter),
    metadata: Object.freeze({ title: 'Article', author: 'Demo Author', digest: '', cover: null, contentSourceUrl: '' }),
    selectedThemeId: 'native', sourceHash: 'article-source',
  });
}

function workflow(frontmatter: Record<string, unknown>) {
  const settings = {
    defaultStyle: DEFAULT_ARTICLE_STYLE,
    recentStyles: {},
    get: () => settings,
    async update() {},
  };
  return new StyleWorkflow(
    new StyleResolver(),
    settings,
    { get: id => BUILTIN_THEMES.find(theme => theme.manifest.id === id) },
    new StyleCompiler(new CodeThemeRegistry()),
    new StyleFrontmatterStore({ async processFrontmatter(_file, mutate) { mutate(frontmatter); } }),
  );
}

describe('style workbench parity', () => {
  it('uses one resolved style artifact for preview, copy payload, and publish payload', async () => {
    const frontmatter: Record<string, unknown> = {
      'wechat-style': serializeArticleStyle(DEFAULT_ARTICLE_STYLE),
    };
    const styles = workflow(frontmatter);
    const builder = new RenderArtifactBuilder();
    const current = snapshot(frontmatter);
    const resolved = styles.resolve(current);
    const artifact = await builder.build(current, styles.materialize(resolved), resolved.config);
    const previewHash = artifact.contentHash;
    const copyHash = publishPayloadHash(artifact);
    const publishHash = publishPayloadHash(artifact);

    expect(copyHash).toBe(publishHash);
    expect(artifact.theme.contentHash).toBe(styles.materialize(resolved).contentHash);
    expect(previewHash).toBe(artifact.contentHash);

    const changedFrontmatter: Record<string, unknown> = {
      'wechat-style': serializeArticleStyle(patchArticleStyle(DEFAULT_ARTICLE_STYLE, {
      primaryColor: '#009874',
      })),
    };
    const changed = snapshot(changedFrontmatter);
    const changedStyles = workflow(changedFrontmatter);
    const changedStyle = changedStyles.resolve(changed);
    const changedArtifact = await builder.build(changed, changedStyles.materialize(changedStyle), changedStyle.config);
    expect(changedArtifact.contentHash).not.toBe(artifact.contentHash);
    expect(changedArtifact.theme.contentHash).not.toBe(artifact.theme.contentHash);
  });
});
