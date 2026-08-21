import { describe, expect, it } from 'vitest';

import {
  CodeThemeRegistry,
  DEFAULT_CODE_THEME_ID,
  DOOCS_CODE_THEME_IDS,
} from '../../../src/styles/code-theme-registry';

describe('CodeThemeRegistry', () => {
  it('bundles every approved Doocs code theme without remote resources', () => {
    const registry = new CodeThemeRegistry();

    for (const id of DOOCS_CODE_THEME_IDS) {
      const css = registry.get(id);
      expect(css, id).toMatch(/\.hljs/u);
      expect(css, id).not.toMatch(/@import|url\s*\(/iu);
    }
    expect(registry.get('not-a-theme')).toBe(registry.get(DEFAULT_CODE_THEME_ID));
  });
});
