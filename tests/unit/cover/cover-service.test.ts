import { describe, expect, it } from 'vitest';

import type { NoteSnapshot } from '../../../src/domain/article';
import type { RenderArtifact } from '../../../src/domain/artifact';
import { CoverService } from '../../../src/cover/cover-service';

const snapshot: Readonly<NoteSnapshot> = Object.freeze({
  vaultPath: '01-公众号/My Article.md',
  basename: 'My Article',
  modifiedAt: 1,
  markdown: '# Article',
  frontmatter: Object.freeze({ cover: 'assets/frontmatter.png' }),
  metadata: Object.freeze({
    title: 'Article', author: '', digest: '', cover: 'assets/frontmatter.png', contentSourceUrl: '',
  }),
  selectedThemeId: 'native',
  sourceHash: 'SOURCE_HASH',
});

const artifact: Readonly<RenderArtifact> = Object.freeze({
  artifactVersion: '1', rendererVersion: '0.1.0',
  source: Object.freeze({ vaultPath: snapshot.vaultPath, modifiedAt: 1, sourceHash: 'SOURCE_HASH' }),
  theme: Object.freeze({ id: 'native', version: '1.0.0', contentHash: 'THEME_HASH' }),
  metadata: snapshot.metadata,
  canonicalHtml: '<section class="wechat-article"><p>Body</p></section>',
  plainText: 'Body',
  assets: Object.freeze([
    Object.freeze({
      id: 'asset:remote', kind: 'remote-image' as const, source: 'https://example.test/remote.png',
      status: 'unresolved' as const, contentHash: null, resolvedUrl: null,
    }),
    Object.freeze({
      id: 'asset:local', kind: 'local-image' as const, source: 'assets/first.png',
      status: 'resolved' as const, contentHash: 'IMAGE_HASH', resolvedUrl: null,
    }),
  ]),
  diagnostics: Object.freeze([]), contentHash: 'CONTENT_HASH',
});

describe('CoverService', () => {
  it('chooses the first ordinary local or remote image in artifact order', () => {
    const service = new CoverService();
    const generatedFirst: Readonly<RenderArtifact> = Object.freeze({
      ...artifact,
      assets: Object.freeze([
        Object.freeze({
          id: 'asset:math', kind: 'generated-math' as const,
          source: 'math.svg', status: 'resolved' as const, contentHash: 'MATH', resolvedUrl: null,
        }),
        ...artifact.assets,
      ]),
    });

    expect(service.firstImage(generatedFirst)).toEqual({
      source: 'first-remote-image',
      vaultPath: 'https://example.test/remote.png',
    });
    expect(service.firstImage(Object.freeze({ assets: [] }))).toBeNull();
  });

  it.each([
    ['article', 'frontmatter-cover', 'assets/frontmatter.png'],
    ['first-image', 'first-local-image', 'assets/first.png'],
    ['global-default', 'configured-default', 'assets/default.png'],
  ] as const)('resolves %s strategy', async (strategy, expectedSource, expectedPath) => {
    const service = new CoverService();

    const candidate = service.resolve(
      { strategy },
      { snapshot, artifact, globalDefaultPath: 'assets/default.png' },
    );

    expect(candidate).toEqual({ source: expectedSource, vaultPath: expectedPath });
    expect(Object.isFrozen(candidate)).toBe(true);
  });

  it('does not silently substitute another source when the requested source is missing', () => {
    const service = new CoverService();
    const noCover = Object.freeze({
      ...snapshot,
      metadata: Object.freeze({ ...snapshot.metadata, cover: null }),
    });

    expect(() => service.resolve(
      { strategy: 'article' },
      { snapshot: noCover, artifact: { ...artifact, metadata: noCover.metadata }, globalDefaultPath: null },
    )).toThrow(/article cover/i);
  });
});
