import { describe, expect, it } from 'vitest';

import { STYLE_OPTIONS } from '../../../src/styles/style-options';

describe('style options', () => {
  it('matches the approved Doocs phase-one surface', () => {
    expect(STYLE_OPTIONS.themes.map(item => item.id)).toEqual([
      'doocs-classic', 'doocs-grace', 'doocs-simple',
    ]);
    expect(STYLE_OPTIONS.fonts.map(item => item.id)).toEqual([
      'sans-serif', 'serif', 'monospace',
    ]);
    expect(STYLE_OPTIONS.fontSizes).toEqual([14, 15, 16, 17, 18]);
    expect(STYLE_OPTIONS.colors).toHaveLength(11);
    expect(STYLE_OPTIONS.captionModes.map(item => item.id)).toEqual([
      'title-alt', 'alt-title', 'title', 'alt', 'filename', 'none',
    ]);
    expect(STYLE_OPTIONS.headingStyles.map(item => item.id)).toEqual([
      'default', 'color-only', 'border-bottom', 'border-left',
    ]);
  });
});
