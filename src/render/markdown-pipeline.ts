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
