import type { Root as HastRoot } from 'hast';
import type { Root as MdastRoot } from 'mdast';
import rehypeSanitize from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { type Plugin, unified } from 'unified';
import { visit } from 'unist-util-visit';

import { expandObsidianImageEmbeds } from './assets';
import { ARTICLE_HTML_SCHEMA } from './html-schema';

interface MathNode {
  type: 'math' | 'inlineMath';
  value: string;
  data?: {
    hChildren?: Array<{ type: 'text'; value: string }>;
    hName?: string;
    hProperties?: Record<string, unknown>;
  };
}

const remarkMathMarkers: Plugin<[], MdastRoot> = () => tree => {
  for (const type of ['math', 'inlineMath'] as const) {
    visit(tree, type, node => {
      const math = node as MathNode;
      math.data = {
        ...math.data,
        hChildren: [{ type: 'text', value: math.value }],
        hName: 'code',
        hProperties: {
          ...math.data?.hProperties,
          className: [type === 'math' ? 'math-display' : 'math-inline'],
        },
      };
    });
  }
};


/** Obsidian `==highlight==` → `<mark>` (phrasing). Same-line, non-empty. */
const HIGHLIGHT_PATTERN = /==([^\n]+?)==/gu;

interface HighlightMdastNode {
  type: 'mark';
  data: {
    hName: 'mark';
    hProperties: { className: string[] };
  };
  children: Array<{ type: 'text'; value: string }>;
}

const remarkObsidianHighlights: Plugin<[], MdastRoot> = () => tree => {
  visit(tree, 'text', (node, index, parent) => {
    if (parent === undefined || index === undefined) return;
    const value = node.value;
    if (!value.includes('==')) return;
    HIGHLIGHT_PATTERN.lastIndex = 0;
    if (!HIGHLIGHT_PATTERN.test(value)) return;
    HIGHLIGHT_PATTERN.lastIndex = 0;
    const replacements: Array<{ type: 'text'; value: string } | HighlightMdastNode> = [];
    let last = 0;
    let match: RegExpExecArray | null;
    while ((match = HIGHLIGHT_PATTERN.exec(value)) !== null) {
      if (match.index > last) {
        replacements.push({ type: 'text', value: value.slice(last, match.index) });
      }
      replacements.push({
        type: 'mark',
        data: {
          hName: 'mark',
          hProperties: { className: ['obsidian-highlight'] },
        },
        children: [{ type: 'text', value: match[1] ?? '' }],
      });
      last = match.index + match[0].length;
    }
    if (last < value.length) {
      replacements.push({ type: 'text', value: value.slice(last) });
    }
    if (replacements.length === 0) return;
    parent.children.splice(index, 1, ...(replacements as unknown as typeof parent.children));
    return index + replacements.length;
  });
};

const rehypeInertImages: Plugin<[], HastRoot> = () => tree => {
  visit(tree, 'element', node => {
    if (node.tagName !== 'img') return;
    const source = node.properties.src;
    if (typeof source === 'string') node.properties.dataAssetSource = source;
    delete node.properties.src;
  });
};

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkMathMarkers)
  .use(remarkObsidianHighlights)
  .use(remarkRehype, { allowDangerousHtml: false })
  .use(rehypeInertImages)
  .use(rehypeSanitize, ARTICLE_HTML_SCHEMA)
  .use(rehypeStringify);

function removeInvisibleControlCharacters(markdown: string): string {
  return [...markdown].filter(character => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint === 9 || codePoint === 10 || codePoint === 13
      || codePoint >= 32 && codePoint !== 127;
  }).join('');
}

export async function markdownToSafeHtml(markdown: string): Promise<string> {
  const normalized = removeInvisibleControlCharacters(markdown);
  return String(await processor.process(expandObsidianImageEmbeds(normalized)));
}
