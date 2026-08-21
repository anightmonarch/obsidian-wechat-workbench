import juice from 'juice';

import type { NoteSnapshot } from '../domain/article';
import type { AssetSlot, Diagnostic, RenderArtifact } from '../domain/artifact';
import type { BinaryFilePort } from '../domain/ports';
import type { ArticleStyleConfig } from '../domain/style';
import type { ThemeDefinition } from '../domain/theme';
import { extractImageAssets } from './assets';
import { canonicalizeHtml, hashContent, parseArticleRoot } from './canonicalize';
import { highlightCodeBlocks } from './extensions/code';
import { renderMathExpressions } from './extensions/math';
import { extractMermaidAssets } from './extensions/mermaid';
import { markdownToSafeHtml } from './markdown-pipeline';
import { applyImageCaptions } from './style-projections';

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

function diagnosticsFor(markdown: string): Diagnostic[] {
  if (!/<\/?[a-z][^>]*>/iu.test(markdown)) return [];
  return [{
    code: 'RAW_HTML_REMOVED',
    severity: 'WARNING' as const,
    message: 'Raw HTML was removed from the article.',
    source: null,
  }];
}

function freezeArtifact(artifact: RenderArtifact): Readonly<RenderArtifact> {
  Object.freeze(artifact.source);
  Object.freeze(artifact.theme);
  for (const asset of artifact.assets) Object.freeze(asset);
  for (const diagnostic of artifact.diagnostics) Object.freeze(diagnostic);
  Object.freeze(artifact.assets);
  Object.freeze(artifact.diagnostics);
  return Object.freeze(artifact);
}

function assetsInDocumentOrder(root: Element, candidates: readonly AssetSlot[]): AssetSlot[] {
  const byId = new Map(candidates.map(asset => [asset.id, asset]));
  const emitted = new Set<string>();
  const ordered: AssetSlot[] = [];
  for (const element of root.querySelectorAll('[data-asset-id]')) {
    const id = element.getAttribute('data-asset-id');
    if (id === null || emitted.has(id)) continue;
    const asset = byId.get(id);
    if (asset === undefined) continue;
    ordered.push(asset);
    emitted.add(id);
  }
  return ordered;
}

export class RenderArtifactBuilder {
  constructor(private readonly binaryFiles?: BinaryFilePort) {}

  async build(
    snapshot: Readonly<NoteSnapshot>,
    theme: Readonly<ThemeDefinition>,
    style: Readonly<ArticleStyleConfig> | null = null,
  ): Promise<Readonly<RenderArtifact>> {
    const safeBody = await markdownToSafeHtml(snapshot.markdown);
    const structuralRoot = parseArticleRoot(`<section class="wechat-article">${safeBody}</section>`);
    transformCallouts(structuralRoot);
    const text = plainText(structuralRoot);
    if (style !== null) applyImageCaptions(structuralRoot, style.imageCaption);
    const images = await extractImageAssets(structuralRoot, snapshot.vaultPath, this.binaryFiles);
    const math = renderMathExpressions(structuralRoot);
    const diagrams = extractMermaidAssets(structuralRoot);
    highlightCodeBlocks(structuralRoot, style === null ? undefined : {
      showLineNumbers: style.showCodeLineNumbers,
      macWindow: style.macCodeBlock,
    });
    const assets = assetsInDocumentOrder(structuralRoot, [
      ...images.assets,
      ...math.assets,
      ...diagrams,
    ]);
    const diagnostics = [
      ...diagnosticsFor(snapshot.markdown),
      ...images.diagnostics,
      ...math.diagnostics,
    ];
    const themed = juice.inlineContent(structuralRoot.outerHTML, theme.css, {
      applyHeightAttributes: false,
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
      assets,
      diagnostics,
      contentHash: hashContent(canonicalHtml),
    });
  }
}
