import type { WorkbenchRenderState } from '../../src/ui/workbench-controller';

export const renderState: Readonly<WorkbenchRenderState> = Object.freeze({
  snapshot: Object.freeze({
    vaultPath: 'article.md',
    basename: 'article',
    modifiedAt: 1,
    markdown: '# Article',
    frontmatter: Object.freeze({}),
    metadata: Object.freeze({
      title: 'Article',
      author: 'Author',
      digest: '',
      cover: null,
      contentSourceUrl: '',
    }),
    selectedThemeId: 'native',
    sourceHash: 'source',
  }),
  artifact: Object.freeze({
    artifactVersion: '1',
    rendererVersion: '0.1.0',
    source: Object.freeze({ vaultPath: 'article.md', modifiedAt: 1, sourceHash: 'source' }),
    theme: Object.freeze({ id: 'native', version: '1.0.0', contentHash: 'theme' }),
    metadata: Object.freeze({
      title: 'Article',
      author: 'Author',
      digest: '',
      cover: null,
      contentSourceUrl: '',
    }),
    canonicalHtml: '<section class="wechat-article"><h1>Article</h1></section>',
    plainText: 'Article',
    assets: Object.freeze([]),
    diagnostics: Object.freeze([]),
    contentHash: 'content',
  }),
  preflight: Object.freeze({
    ok: true,
    blocking: Object.freeze([]),
    warnings: Object.freeze([Object.freeze({
      code: 'DIGEST_EMPTY',
      severity: 'WARNING',
      message: 'Digest is empty.',
      source: null,
    })]),
    info: Object.freeze([]),
  }),
  themes: Object.freeze([Object.freeze({
    manifest: Object.freeze({
      id: 'native',
      name: '原生简洁',
      version: '1.0.0',
      author: 'Test',
      description: '',
    }),
    css: '',
    contentHash: 'theme',
    source: 'builtin',
    previewPath: null,
  })]),
  selectedThemeId: 'native',
});
