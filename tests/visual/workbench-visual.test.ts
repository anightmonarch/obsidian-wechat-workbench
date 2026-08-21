import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('workbench narrow-layout contract', () => {
  it('keeps toolbar, article, tables, images, long errors, and cover previews bounded', async () => {
    const css = await readFile('styles.css', 'utf8');

    expect(css).toMatch(/wechat-workbench__brand-header\s*\{[^}]*min-height:\s*56px/su);
    expect(css).toMatch(/wechat-workbench__tabs\s*\{[^}]*grid-template-columns:\s*repeat\(2,/su);
    expect(css).toMatch(/wechat-workbench__action-bar\s*\{[^}]*min-height:/su);
    expect(css).toMatch(/wechat-workbench__preview-canvas\s*\{[^}]*background:\s*var\(--background-secondary\)/su);
    expect(css).toMatch(/wechat-workbench__preview-sheet\s*\{[^}]*max-width:\s*42rem/su);
    expect(css).toMatch(/wechat-workbench__preview-sheet\s+img[^}]*max-width:\s*100%/su);
    expect(css).toMatch(/wechat-workbench__cover-preview[^}]*aspect-ratio:\s*2\.35\s*\/\s*1/su);
    expect(css).toMatch(/overflow-wrap:\s*anywhere/gu);
    expect(css).toMatch(/wechat-workbench__preview-stage\s*\{[^}]*container-type:\s*inline-size/su);
    expect(css).toMatch(/wechat-workbench__preview-stage\s*\{[^}]*grid-template-columns:\s*minmax\(20rem,\s*1fr\)\s+minmax\(16rem,\s*19rem\)/su);
    expect(css).toMatch(/@container\s*\(max-width:\s*56rem\)[\s\S]*wechat-workbench__style-host\s*\{[^}]*position:\s*absolute/su);
    expect(css).toMatch(/wechat-workbench__style-body\s*\{[^}]*overflow:\s*auto/su);
    expect(css).toMatch(/wechat-workbench__style-footer\s*\{[^}]*position:\s*sticky/su);
    expect(css).not.toMatch(/(?:^|\n)\s*(?:button|input|select|h1|p)\s*\{/mu);
    expect(css).not.toMatch(/wechat-workbench__account-status/u);
  });
});
