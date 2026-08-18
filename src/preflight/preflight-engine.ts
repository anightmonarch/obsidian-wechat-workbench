import type { Diagnostic, RenderArtifact } from '../domain/artifact';
import { WECHAT_ARTICLE_LIMITS } from '../wechat/wechat-types';
import { PREFLIGHT_CODES } from './codes';

export type PreflightPurpose = 'copy' | 'publish';

export interface PreflightContext {
  purpose: PreflightPurpose;
  themeValid: boolean;
  accountConfigured?: boolean;
  coverReady?: boolean;
  associationAccountMatches?: boolean;
}

export interface PreflightReport {
  ok: boolean;
  blocking: readonly Diagnostic[];
  warnings: readonly Diagnostic[];
  info: readonly Diagnostic[];
}

function diagnostic(
  code: string,
  severity: Diagnostic['severity'],
  message: string,
  source: string | null = null,
): Diagnostic {
  return { code, severity, message, source };
}

function emptySanitizedBody(artifact: Readonly<RenderArtifact>): boolean {
  const rootMatch = /^<section\b[^>]*>([\s\S]*)<\/section>$/iu.exec(artifact.canonicalHtml.trim());
  return (rootMatch?.[1] ?? '').trim().length === 0;
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function narrowContentRisk(artifact: Readonly<RenderArtifact>): boolean {
  return /<(?:pre|table)\b|data-asset-kind="generated-math"/iu.test(artifact.canonicalHtml);
}

function length(value: string): number {
  return [...value].length;
}

function evaluateArtifact(
  artifact: Readonly<RenderArtifact>,
  context: Readonly<PreflightContext>,
): Diagnostic[] {
  const items: Diagnostic[] = [];

  if (artifact.metadata.title.trim().length === 0) {
    items.push(diagnostic(PREFLIGHT_CODES.TITLE_EMPTY, 'BLOCKING', 'Article title is empty.'));
  }
  if (emptySanitizedBody(artifact)) {
    items.push(diagnostic(
      PREFLIGHT_CODES.SANITIZED_BODY_EMPTY,
      'BLOCKING',
      'Article body is empty after sanitization.',
    ));
  }
  if (!context.themeValid) {
    items.push(diagnostic(
      PREFLIGHT_CODES.THEME_INVALID,
      'BLOCKING',
      'The selected theme has no valid active version.',
      artifact.theme.id,
    ));
  }
  if (context.purpose === 'publish') {
    if (context.accountConfigured === false) {
      items.push(diagnostic(PREFLIGHT_CODES.ACCOUNT_MISSING, 'BLOCKING', 'WeChat account is not configured.'));
    }
    if (context.coverReady === false) {
      items.push(diagnostic(PREFLIGHT_CODES.COVER_MISSING, 'BLOCKING', 'Article cover is missing or unreadable.'));
    }
    if (context.associationAccountMatches === false) {
      items.push(diagnostic(
        PREFLIGHT_CODES.DRAFT_ACCOUNT_MISMATCH,
        'BLOCKING',
        'The existing draft association belongs to a different account.',
      ));
    }
    if (length(artifact.metadata.title) > WECHAT_ARTICLE_LIMITS.title) {
      items.push(diagnostic(PREFLIGHT_CODES.TITLE_TOO_LONG, 'BLOCKING', 'Article title exceeds 64 characters.'));
    }
    if (length(artifact.metadata.author) > WECHAT_ARTICLE_LIMITS.author) {
      items.push(diagnostic(PREFLIGHT_CODES.AUTHOR_TOO_LONG, 'BLOCKING', 'Article author exceeds 8 characters.'));
    }
    if (length(artifact.metadata.digest) > WECHAT_ARTICLE_LIMITS.digest) {
      items.push(diagnostic(PREFLIGHT_CODES.DIGEST_TOO_LONG, 'BLOCKING', 'Article digest exceeds 120 characters.'));
    }
  }

  for (const asset of artifact.assets) {
    if (asset.status === 'resolved') continue;
    if (asset.kind === 'local-image') {
      items.push(diagnostic(
        PREFLIGHT_CODES.LOCAL_ASSET_UNRESOLVED,
        'BLOCKING',
        `Local image could not be resolved: ${asset.source}`,
        asset.source,
      ));
    } else if (asset.kind === 'remote-image') {
      items.push(diagnostic(
        PREFLIGHT_CODES.REMOTE_ASSET_UNRESOLVED,
        'WARNING',
        'Remote image has not been explicitly loaded.',
        asset.source,
      ));
    } else {
      items.push(diagnostic(
        PREFLIGHT_CODES.ASSET_RESOLUTION_PENDING,
        'INFO',
        'Generated content will be resolved when the user requests copy or publish.',
        asset.id,
      ));
    }
  }

  if (artifact.metadata.digest.trim().length === 0) {
    items.push(diagnostic(
      PREFLIGHT_CODES.DIGEST_EMPTY,
      'WARNING',
      'Digest is empty; a safe fallback will be required.',
    ));
  }
  const sourceUrl = artifact.metadata.contentSourceUrl.trim();
  if (sourceUrl.length > 0 && !isHttpsUrl(sourceUrl)) {
    items.push(diagnostic(
      PREFLIGHT_CODES.CONTENT_SOURCE_NOT_HTTPS,
      context.purpose === 'publish' ? 'BLOCKING' : 'WARNING',
      'Content source URL is not HTTPS.',
      sourceUrl,
    ));
  }
  if (narrowContentRisk(artifact)) {
    items.push(diagnostic(
      PREFLIGHT_CODES.NARROW_CONTENT_RISK,
      'WARNING',
      'Tables, code, or formulas may wrap on narrow screens.',
    ));
  }

  items.push(...artifact.diagnostics);
  return items;
}

function freezeReport(items: readonly Diagnostic[]): Readonly<PreflightReport> {
  const unique = new Map<string, Readonly<Diagnostic>>();
  for (const item of items) {
    const key = `${item.code}\0${item.source ?? ''}`;
    if (!unique.has(key)) unique.set(key, Object.freeze({ ...item }));
  }
  const diagnostics = [...unique.values()];
  const blocking = Object.freeze(diagnostics.filter(item => item.severity === 'BLOCKING'));
  const warnings = Object.freeze(diagnostics.filter(item => item.severity === 'WARNING'));
  const info = Object.freeze(diagnostics.filter(item => item.severity === 'INFO'));
  return Object.freeze({ ok: blocking.length === 0, blocking, warnings, info });
}

export class PreflightEngine {
  run(
    artifact: Readonly<RenderArtifact> | null,
    context: Readonly<PreflightContext>,
  ): Readonly<PreflightReport> {
    if (artifact === null) {
      return freezeReport([diagnostic(
        PREFLIGHT_CODES.ACTIVE_MARKDOWN_MISSING,
        'BLOCKING',
        'No active Markdown file is available.',
      )]);
    }
    return freezeReport(evaluateArtifact(artifact, context));
  }
}
