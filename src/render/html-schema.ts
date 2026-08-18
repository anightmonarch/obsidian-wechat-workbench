import { defaultSchema, type Options as Schema } from 'rehype-sanitize';

type AttributeMap = NonNullable<Schema['attributes']>;
type PropertyDefinition = AttributeMap[string][number];

function values(
  values: readonly PropertyDefinition[] | undefined,
  additions: readonly PropertyDefinition[],
): PropertyDefinition[] {
  return [...(values ?? []), ...additions];
}

export const ARTICLE_HTML_SCHEMA: Schema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), 'section'],
  attributes: {
    ...defaultSchema.attributes,
    '*': values(defaultSchema.attributes?.['*'], ['className']),
    a: values(defaultSchema.attributes?.a, ['target', 'rel']),
    code: [
      ['className', /^language-./u, 'math-inline', 'math-display'],
    ],
    img: values(defaultSchema.attributes?.img, ['dataAssetSource']),
    section: ['className'],
    table: values(defaultSchema.attributes?.table, ['className']),
  },
  protocols: {
    ...defaultSchema.protocols,
    href: ['http', 'https', 'mailto'],
    src: ['https'],
  },
};
