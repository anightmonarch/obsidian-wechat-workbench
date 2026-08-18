import { describe, expect, it } from 'vitest';

import type { RenderArtifact } from '../../../src/domain/artifact';
import { PREFLIGHT_CODES } from '../../../src/preflight/codes';
import { PreflightEngine, type PreflightContext } from '../../../src/preflight/preflight-engine';

function artifact(overrides: Partial<RenderArtifact> = {}): Readonly<RenderArtifact> {
  return Object.freeze({
    artifactVersion: '1',
    rendererVersion: '0.1.0',
    source: Object.freeze({ vaultPath: 'article.md', modifiedAt: 1, sourceHash: 'source' }),
    theme: Object.freeze({ id: 'native', version: '1.0.0', contentHash: 'theme' }),
    metadata: Object.freeze({
      title: 'Article', author: '', digest: 'Digest', cover: null, contentSourceUrl: '',
    }),
    canonicalHtml: '<section class="wechat-article"><p>Body</p></section>',
    plainText: 'Body',
    assets: Object.freeze([]),
    diagnostics: Object.freeze([]),
    contentHash: 'content',
    ...overrides,
  });
}

const copyContext: Readonly<PreflightContext> = Object.freeze({
  purpose: 'copy',
  themeValid: true,
});

describe('PreflightEngine', () => {
  it('blocks when there is no active Markdown artifact', () => {
    const report = new PreflightEngine().run(null, copyContext);

    expect(report.ok).toBe(false);
    expect(report.blocking.map(item => item.code)).toEqual([PREFLIGHT_CODES.ACTIVE_MARKDOWN_MISSING]);
  });

  it('blocks unresolved local assets and warns for an empty digest', () => {
    const input = artifact({
      metadata: Object.freeze({
        title: 'Article', author: '', digest: '   ', cover: null, contentSourceUrl: '',
      }),
      assets: Object.freeze([Object.freeze({
        id: 'asset:local', kind: 'local-image', source: 'missing.png', status: 'unresolved',
        contentHash: null, resolvedUrl: null,
      })]),
    });

    const report = new PreflightEngine().run(input, copyContext);

    expect(report.blocking.map(item => item.code)).toContain(PREFLIGHT_CODES.LOCAL_ASSET_UNRESOLVED);
    expect(report.warnings.map(item => item.code)).toContain(PREFLIGHT_CODES.DIGEST_EMPTY);
    expect(report.ok).toBe(false);
  });

  it('checks title, sanitized body, and active theme without requiring an account for copy', () => {
    const input = artifact({
      metadata: Object.freeze({ title: ' ', author: '', digest: '', cover: null, contentSourceUrl: '' }),
      canonicalHtml: '<section class="wechat-article"></section>',
      plainText: '',
    });

    const report = new PreflightEngine().run(input, { purpose: 'copy', themeValid: false });

    expect(report.blocking.map(item => item.code)).toEqual(expect.arrayContaining([
      PREFLIGHT_CODES.TITLE_EMPTY,
      PREFLIGHT_CODES.SANITIZED_BODY_EMPTY,
      PREFLIGHT_CODES.THEME_INVALID,
    ]));
    expect(report.blocking.map(item => item.code)).not.toContain('ACCOUNT_MISSING');
  });

  it('warns about non-HTTPS source URLs, unresolved remote images, and narrow content', () => {
    const input = artifact({
      metadata: Object.freeze({
        title: 'Article', author: '', digest: 'Digest', cover: null,
        contentSourceUrl: 'http://example.test/source',
      }),
      canonicalHtml: '<section class="wechat-article"><table><tbody><tr><td>x</td></tr></tbody></table></section>',
      assets: Object.freeze([Object.freeze({
        id: 'asset:remote', kind: 'remote-image', source: 'https://example.test/image.png',
        status: 'unresolved', contentHash: null, resolvedUrl: null,
      })]),
      diagnostics: Object.freeze([Object.freeze({
        code: 'RAW_HTML_REMOVED', severity: 'WARNING', message: 'Raw HTML was removed.', source: null,
      })]),
    });

    const report = new PreflightEngine().run(input, copyContext);
    const codes = report.warnings.map(item => item.code);

    expect(codes).toEqual(expect.arrayContaining([
      PREFLIGHT_CODES.CONTENT_SOURCE_NOT_HTTPS,
      PREFLIGHT_CODES.REMOTE_ASSET_UNRESOLVED,
      PREFLIGHT_CODES.NARROW_CONTENT_RISK,
      'RAW_HTML_REMOVED',
    ]));
    expect(report.ok).toBe(true);
  });

  it('does not mutate the artifact and returns a deeply frozen report', () => {
    const input = artifact();
    const before = JSON.stringify(input);

    const report = new PreflightEngine().run(input, copyContext);

    expect(JSON.stringify(input)).toBe(before);
    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.blocking)).toBe(true);
    expect(Object.isFrozen(report.warnings)).toBe(true);
    expect(Object.isFrozen(report.info)).toBe(true);
  });
});
