import rehypeSanitize from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';

import { ARTICLE_HTML_SCHEMA } from './html-schema';

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: false })
  .use(rehypeSanitize, ARTICLE_HTML_SCHEMA)
  .use(rehypeStringify);

export async function markdownToSafeHtml(markdown: string): Promise<string> {
  return String(await processor.process(markdown));
}
