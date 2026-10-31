import { describe, expect, it } from 'vitest';

import { DEFAULT_ARTICLE_STYLE, patchArticleStyle, serializeArticleStyle } from '../../../src/styles/style-config';
import { StyleResolver } from '../../../src/styles/style-resolver';

describe('StyleResolver', () => {
  const resolver = new StyleResolver();
  const globalStyle = patchArticleStyle(DEFAULT_ARTICLE_STYLE, { primaryColor: '#009874' });

  it('resolves the global default style as the single rendering source', () => {
    const resolved = resolver.resolve({ defaultStyle: globalStyle });

    expect(resolved).toEqual({
      source: 'global',
      renderMode: 'compiled',
      themeId: globalStyle.themeId,
      config: globalStyle,
    });
  });

  it('ignores per-article style frontmatter entirely', () => {
    const stored = serializeArticleStyle(patchArticleStyle(DEFAULT_ARTICLE_STYLE, {
      themeId: 'native',
      primaryColor: '#FA5151',
    }));

    expect(stored).toMatchObject({ theme: 'native' });
    const resolved = resolver.resolve({ defaultStyle: globalStyle });
    expect(resolved.config).toBe(globalStyle);
    expect(resolved.themeId).toBe(globalStyle.themeId);
  });
});
