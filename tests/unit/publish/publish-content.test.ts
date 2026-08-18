import { describe, expect, it } from 'vitest';

import type { RenderArtifact } from '../../../src/domain/artifact';
import { publishPayloadHash } from '../../../src/publish/publish-content';

const artifact: Readonly<RenderArtifact> = Object.freeze({
  artifactVersion: '1', rendererVersion: '0.1.0',
  source: Object.freeze({ vaultPath: 'article.md', modifiedAt: 1, sourceHash: 'SOURCE_HASH' }),
  theme: Object.freeze({ id: 'native', version: '1.0.0', contentHash: 'THEME_HASH' }),
  metadata: Object.freeze({ title: 'Title A', author: 'Author', digest: 'Digest', cover: null, contentSourceUrl: '' }),
  canonicalHtml: '<section class="wechat-article"><p>Body</p></section>', plainText: 'Body',
  assets: Object.freeze([]), diagnostics: Object.freeze([]), contentHash: 'CONTENT_HASH',
});

describe('publishPayloadHash', () => {
  it.each([
    ['title', { title: 'Title B' }],
    ['author', { author: 'Other' }],
    ['digest', { digest: 'Other digest' }],
    ['source URL', { contentSourceUrl: 'https://example.test/source' }],
  ])('changes when %s changes without body edits', (_label, metadata) => {
    const changed = { ...artifact, metadata: Object.freeze({ ...artifact.metadata, ...metadata }) };

    expect(publishPayloadHash(changed)).not.toBe(publishPayloadHash(artifact));
  });
});
