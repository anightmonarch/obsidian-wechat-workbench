import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('workbench narrow-layout contract', () => {
  it('keeps toolbar, article, tables, images, long errors, and cover previews bounded', async () => {
    const css = await readFile('styles.css', 'utf8');

    expect(css).toMatch(/wechat-workbench__toolbar\s*\{[^}]*flex-wrap:\s*wrap/su);
    expect(css).toMatch(/wechat-workbench__preview\s*>\s*\.wechat-article[^}]*max-width:/su);
    expect(css).toMatch(/wechat-workbench__preview\s+img[^}]*max-width:\s*100%/su);
    expect(css).toMatch(/wechat-workbench__cover-preview[^}]*aspect-ratio:\s*2\.35\s*\/\s*1/su);
    expect(css).toMatch(/overflow-wrap:\s*anywhere/gu);
  });
});
