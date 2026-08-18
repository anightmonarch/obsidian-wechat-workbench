import juice from 'juice';

import type { NoteSnapshot } from '../domain/article';
import type { Diagnostic, RenderArtifact } from '../domain/artifact';
import type { ThemeDefinition } from '../domain/theme';
import { canonicalizeHtml, hashContent, parseArticleRoot } from './canonicalize';
import { highlightCodeBlocks } from './extensions/code';
import { markdownToSafeHtml } from './markdown-pipeline';

const ARTIFACT_VERSION = '1';
const RENDERER_VERSION = '0.1.0';
const CALLOUT_PATTERN = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(.*)$/iu;

function transformCallouts(root: Element): void {
  for (const blockquote of root.querySelectorAll('blockquote')) {
    const firstParagraph = blockquote.firstElementChild;
    if (firstParagraph?.tagName !== 'P') continue;
    const text = firstParagraph.textContent ?? '';
    const [markerLine = '', ...remainingLines] = text.split('\n');
    const match = CALLOUT_PATTERN.exec(markerLine);
    if (match === null) continue;

    const kind = match[1]?.toLowerCase() ?? 'note';
    const body = [match[2] ?? '', ...remainingLines].join('\n').trim();
    blockquote.classList.add('callout', `callout-${kind}`);
    firstParagraph.textContent = body.length > 0 ? body : kind;
  }
}

function plainText(root: Element): string {
  return (root.textContent ?? '').replace(/\s+/gu, ' ').trim();
}

function diagnosticsFor(markdown: string): readonly Diagnostic[] {
  if (!/<\/?[a-z][^>]*>/iu.test(markdown)) return Object.freeze([]);
  return Object.freeze([Object.freeze({
    code: 'RAW_HTML_REMOVED',
    severity: 'WARNING' as const,
    message: 'Raw HTML was removed from the article.',
    source: null,
  })]);
}

function freezeArtifact(artifact: RenderArtifact): Readonly<RenderArtifact> {
  Object.freeze(artifact.source);
  Object.freeze(artifact.theme);
  Object.freeze(artifact.assets);
  Object.freeze(artifact.diagnostics);
  return Object.freeze(artifact);
}

export class RenderArtifactBuilder {
  async build(
    snapshot: Readonly<NoteSnapshot>,
    theme: Readonly<ThemeDefinition>,
  ): Promise<Readonly<RenderArtifact>> {
    const safeBody = await markdownToSafeHtml(snapshot.markdown);
    const structuralRoot = parseArticleRoot(`<section class="wechat-article">${safeBody}</section>`);
    transformCallouts(structuralRoot);
    highlightCodeBlocks(structuralRoot);
    const text = plainText(structuralRoot);
    const themed = juice.inlineContent(structuralRoot.outerHTML, theme.css, {
      applyStyleTags: false,
      removeStyleTags: true,
      preserveMediaQueries: false,
      xmlMode: false,
    });
    const canonicalHtml = canonicalizeHtml(themed);

    return freezeArtifact({
      artifactVersion: ARTIFACT_VERSION,
      rendererVersion: RENDERER_VERSION,
      source: {
        vaultPath: snapshot.vaultPath,
        modifiedAt: snapshot.modifiedAt,
        sourceHash: snapshot.sourceHash,
      },
      theme: {
        id: theme.manifest.id,
        version: theme.manifest.version,
        contentHash: theme.contentHash,
      },
      metadata: snapshot.metadata,
      canonicalHtml,
      plainText: text,
      assets: [],
      diagnostics: diagnosticsFor(snapshot.markdown),
      contentHash: hashContent(canonicalHtml),
    });
  }
}
