import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import type { NoteSnapshot } from '../../../src/domain/article';
import { RenderArtifactBuilder } from '../../../src/render/artifact-builder';
import { DEFAULT_ARTICLE_STYLE, patchArticleStyle } from '../../../src/styles/style-config';
import { BUILTIN_THEMES } from '../../../src/themes/builtin';

function snapshot(markdown: string): Readonly<NoteSnapshot> {
  return Object.freeze({
    vaultPath: 'fixtures/article.md',
    basename: 'article',
    modifiedAt: 100,
    markdown,
    frontmatter: Object.freeze({}),
    metadata: Object.freeze({
      title: 'Fixture article',
      author: 'Test author',
      digest: 'Fixture digest',
      cover: null,
      contentSourceUrl: 'https://example.test/source',
    }),
    selectedThemeId: 'native',
    sourceHash: 'source-hash',
  });
}

const nativeTheme = BUILTIN_THEMES.find(theme => theme.manifest.id === 'native');
if (nativeTheme === undefined) throw new Error('Native theme fixture is missing.');
const doocsGraceTheme = BUILTIN_THEMES.find(theme => theme.manifest.id === 'doocs-grace');
if (doocsGraceTheme === undefined) throw new Error('Doocs Grace theme fixture is missing.');

describe('RenderArtifactBuilder', () => {
  it('removes scripts, raw images, event handlers, and javascript URLs', async () => {
    const builder = new RenderArtifactBuilder();
    const artifact = await builder.build(snapshot([
      '<script>globalThis.compromised = true;</script>',
      '<img src="x" onerror="globalThis.compromised = true">',
      '[unsafe](javascript:alert(1))',
    ].join('\n\n')), nativeTheme);

    expect(artifact.canonicalHtml).not.toMatch(/script|onerror|javascript:|compromised/iu);
  });

  it('renders supported structures, callouts, code, and inline theme styles', async () => {
    const markdown = await readFile('tests/fixtures/articles/core-elements.md', 'utf8');
    const artifact = await new RenderArtifactBuilder().build(snapshot(markdown), nativeTheme);
    const golden = await readFile('tests/golden/core-elements.html', 'utf8');

    expect(artifact.canonicalHtml).toContain('<section class="wechat-article"');
    expect(artifact.canonicalHtml).toContain('<table');
    expect(artifact.canonicalHtml).toContain('callout-note');
    expect(artifact.canonicalHtml).toContain('class="hljs-');
    expect(artifact.canonicalHtml).toMatch(/style="[^"]*line-height/iu);
    expect(artifact.plainText).toContain('系统组件');
    expect(artifact.assets).toEqual([]);
    expect(artifact.canonicalHtml).toBe(golden.trimEnd());
  });

  it('projects configured captions and code structure into the artifact', async () => {
    const style = patchArticleStyle(DEFAULT_ARTICLE_STYLE, {
      imageCaption: 'alt',
      showCodeLineNumbers: true,
      macCodeBlock: true,
    });
    const artifact = await new RenderArtifactBuilder().build(
      snapshot('![Preview](https://example.test/preview.png)\n\n```ts\nconst answer = 42;\nreturn answer;\n```'),
      nativeTheme,
      style,
    );

    expect(artifact.canonicalHtml).toContain('<figure class="image-figure"');
    expect(artifact.canonicalHtml).toContain('<figcaption class="image-caption"');
    expect(artifact.canonicalHtml).toContain('Preview');
    expect(artifact.canonicalHtml).toContain('code-window-dots');
    expect(artifact.canonicalHtml).toContain('code-line-number');
    expect(artifact.canonicalHtml).toContain('code-line-content');
  });

  it('removes invisible C0 controls without adding paragraph indentation', async () => {
    const artifact = await new RenderArtifactBuilder().build(
      snapshot('\u0008\u0008不知道是不是今天用户多了起来。'),
      nativeTheme,
    );
    const document = new DOMParser().parseFromString(artifact.canonicalHtml, 'text/html');

    expect(document.querySelector('p')?.textContent).toBe('不知道是不是今天用户多了起来。');
    expect(artifact.canonicalHtml).not.toContain('\u0008');
  });

  it('separates callout icon, title, and body without a green tip background', async () => {
    const artifact = await new RenderArtifactBuilder().build(
      snapshot('> [!tip] 一份内容，多处复用\n> 预览、复制和草稿同步使用同一份渲染结果。'),
      doocsGraceTheme,
    );
    const document = new DOMParser().parseFromString(artifact.canonicalHtml, 'text/html');
    const callout = document.querySelector<HTMLElement>('.callout-tip');

    expect(callout?.querySelector('.callout-icon')?.textContent).toBe('✦');
    expect(callout?.querySelector('.callout-title-text')?.textContent).toBe('一份内容，多处复用');
    expect(callout?.querySelector('.callout-body')?.textContent)
      .toBe('预览、复制和草稿同步使用同一份渲染结果。');
    expect(callout?.querySelector('.callout-title')?.nextElementSibling)
      .toBe(callout?.querySelector('.callout-body'));
    expect(callout?.getAttribute('style')).toContain('background: #eef8f9');
    expect(callout?.getAttribute('style')).not.toContain('#eff9f0');
  });

  it('strikes only completed task-list items in the publish artifact', async () => {
    const artifact = await new RenderArtifactBuilder().build(
      snapshot('- [x] 已完成\n- [ ] 待确认'),
      doocsGraceTheme,
    );
    const document = new DOMParser().parseFromString(artifact.canonicalHtml, 'text/html');
    const items = [...document.querySelectorAll<HTMLElement>('li.task-list-item')];

    expect(items).toHaveLength(2);
    expect(items[0]?.style.textDecoration).toBe('line-through');
    expect(items[1]?.style.textDecoration).not.toBe('line-through');
  });
});
