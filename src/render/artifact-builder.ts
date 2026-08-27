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
import {
  applyExternalLinkCitations,
  applyImageCaptions,
  applyReadingSummary,
} from './style-projections';

const ARTIFACT_VERSION = '1';
const RENDERER_VERSION = '0.1.0';
const CALLOUT_PATTERN = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(.*)$/iu;
const CALLOUT_PRESENTATION = Object.freeze({
  note: Object.freeze({ icon: '✎', title: '备注' }),
  tip: Object.freeze({ icon: '✦', title: '提示' }),
  important: Object.freeze({ icon: '◆', title: '重要' }),
  warning: Object.freeze({ icon: '⚠', title: '警告' }),
  caution: Object.freeze({ icon: '!', title: '注意' }),
});
const SEMANTIC_CSS = `.wechat-article .callout-title { display: flex; align-items: center; gap: 0.4em; margin: 0 0 0.45em; font-style: normal; font-weight: 600; text-indent: 0; }
.wechat-article .callout-icon { flex: 0 0 auto; font-style: normal; line-height: 1; }
.wechat-article .callout-body { margin: 0; font-style: normal; text-indent: 0; }
.wechat-article .task-list-item--checked { text-decoration: line-through; }`;

function createHtmlElement(document: Document, tagName: string): HTMLElement {
  return document.createElementNS('http://www.w3.org/1999/xhtml', tagName);
}

function transformCallouts(root: Element): void {
  for (const blockquote of root.querySelectorAll('blockquote')) {
    const firstParagraph = blockquote.firstElementChild;
    if (firstParagraph?.tagName !== 'P') continue;
    const text = firstParagraph.textContent ?? '';
    const [markerLine = '', ...remainingLines] = text.split('\n');
    const match = CALLOUT_PATTERN.exec(markerLine);
    if (match === null) continue;

    const kind = (match[1]?.toLowerCase() ?? 'note') as keyof typeof CALLOUT_PRESENTATION;
    const presentation = CALLOUT_PRESENTATION[kind];
    const titleText = match[2]?.trim() || presentation.title;
    const bodyText = remainingLines.join('\n').trim();
    const title = createHtmlElement(blockquote.ownerDocument, 'div');
    title.className = 'callout-title';
    const icon = createHtmlElement(blockquote.ownerDocument, 'span');
    icon.className = 'callout-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = presentation.icon;
    const titleLabel = createHtmlElement(blockquote.ownerDocument, 'span');
    titleLabel.className = 'callout-title-text';
    titleLabel.textContent = titleText;
    title.append(icon, titleLabel);
    blockquote.classList.add('callout', `callout-${kind}`);
    if (bodyText.length === 0) {
      firstParagraph.replaceWith(title);
      continue;
    }
    const body = createHtmlElement(blockquote.ownerDocument, 'p');
    body.className = 'callout-body';
    body.textContent = bodyText;
    firstParagraph.replaceWith(title, body);
  }
}

function projectTaskListState(root: Element): void {
  for (const item of root.querySelectorAll('li.task-list-item')) {
    if (item.querySelector(':scope > input[type="checkbox"][checked]') !== null) {
      item.classList.add('task-list-item--checked');
    }
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
    projectTaskListState(structuralRoot);
    const text = plainText(structuralRoot);
    if (style !== null) {
      applyReadingSummary(structuralRoot, snapshot.markdown, style.wordCount);
      applyExternalLinkCitations(structuralRoot, style.externalLinkCitation);
      applyImageCaptions(structuralRoot, style.imageCaption);
    }
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
    const themed = juice.inlineContent(structuralRoot.outerHTML, `${theme.css}\n${SEMANTIC_CSS}`, {
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
