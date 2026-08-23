# Doocs Style Workbench Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current simplified style panel with an Obsidian-native reproduction of the Doocs screenshot controls, and make every visible setting affect preview, rich copy, and WeChat draft artifacts.

**Architecture:** Keep the existing `ItemView → WorkbenchController → StyleWorkflow → RenderArtifactBuilder` pipeline. Upgrade the article style schema to v2, add deterministic DOM projections for external-link citations and reading statistics, and rebuild the panel with Obsidian public UI components while keeping its DOM mounted during live updates. Do not import Vue or create a second renderer.

**Tech Stack:** TypeScript 5.8, Obsidian API 1.13.1 (`ItemView`, `ButtonComponent`, `DropdownComponent`, `ToggleComponent`, `ColorComponent`, `Modal`), Vitest 4, jsdom, unified/rehype, highlight.js, juice, scoped CSS.

## Global Constraints

- Follow `docs/superpowers/specs/2026-08-21-doocs-style-workbench-parity-design.md`.
- Desktop only; preserve `manifest.json` ID `wechat-workbench` and `isDesktopOnly: true`.
- Do not add Vue, Pinia, Tailwind, shadcn-vue, Reka UI, CodeMirror, or a remote code-theme CDN.
- Do not implement “探索更多主题”, theme marketplace, arbitrary CSS, or custom heading CSS.
- Do not remove Vault custom-theme registration, global-style persistence, copy, cover, or publishing behavior.
- Style panel host UI must use Obsidian public APIs, DOM helpers, and CSS variables; article CSS stays scoped to `.wechat-article`.
- Never use `innerHTML`, `outerHTML`, or `insertAdjacentHTML` for UI or generated citation/statistics content.
- Keep the style panel root mounted during ordinary setting changes; no flicker, scroll reset, or “正在保存样式” UI.
- Preview, clipboard, and draft publishing must consume the same immutable `RenderArtifact`.
- Preserve unrelated dirty-worktree changes. Before each commit run `npm run scan:secrets`; do not push or publish.
- Real Obsidian testing must use `/tmp/wechat-workbench-checkpoint-1`, never the `commit_note` Vault.

---

## File Structure

**Create**

- `src/render/reading-time.ts` — deterministic Doocs-compatible CJK/Latin word and reading-time calculation.
- `src/ui/style-reset-modal.ts` — Obsidian `Modal` used only for destructive reset confirmation.
- `tests/unit/render/reading-time.test.ts` — fixed reading-time examples.
- `tests/unit/ui/style-reset-modal.test.ts` — destructive reset confirmation behavior.
- `tests/integration/doocs-style-panel-artifact.test.ts` — verifies all new fields flow into a shared artifact.
- `docs/verification/doocs-style-workbench-parity.md` — manual Obsidian, image, copy, and draft evidence.

**Modify**

- `src/domain/style.ts` — style schema v2 and parse result versions.
- `src/styles/style-config.ts` — v1 migration, v2 normalization, serialization, defaults, and patching.
- `src/settings/model.ts` — v2 default style fields.
- `src/styles/style-options.ts` — exact visible option order and labels.
- `src/render/style-projections.ts` — external-link citation and reading-summary DOM projections.
- `src/render/artifact-builder.ts` — invoke new projections in a deterministic order.
- `src/styles/style-compiler.ts` — styles for generated summary/citation blocks and spacing parity.
- `src/ui/style-workbench.ts` — Obsidian-native panel controls and in-place updates.
- `src/ui/workbench-view.ts` — pass `App`, remove global-default panel action, and open reset modal through the panel.
- `styles.css` — Doocs grid/spacing/overlay parity without global selectors.
- Unit, integration, golden, and visual tests listed in the tasks below.

## Batch 1: Style schema and render semantics

### Task 1: Upgrade `ArticleStyleConfig` to v2 with safe v1 migration

**Files:**

- Modify: `src/domain/style.ts`
- Modify: `src/styles/style-config.ts`
- Modify: `src/settings/model.ts`
- Modify: `tests/unit/styles/style-config.test.ts`
- Modify: `tests/unit/settings/settings-store.test.ts`
- Modify: `tests/fixtures/workbench-render-state.ts`

**Interfaces:**

- Produces: `ArticleStyleConfig` with `version: 2`, `externalLinkCitation: boolean`, and `wordCount: boolean`.
- Produces: `parseArticleStyle(value, fallback)` accepting persisted v1 and v2, returning normalized v2.
- Preserves: `patchArticleStyle`, `defaultStyleForTheme`, and `serializeArticleStyle` call sites.

- [ ] **Step 1: Write failing v1 migration and v2 serialization tests**

Add these cases:

```ts
it('migrates v1 to v2 without enabling new projections', () => {
  const result = parseArticleStyle({
    version: 1,
    theme: 'doocs-classic',
    'font-size': 16,
  });
  expect(result.status).toBe('valid');
  if (result.status !== 'valid') return;
  expect(result.config).toMatchObject({
    version: 2,
    externalLinkCitation: false,
    wordCount: false,
  });
  expect(result.version).toBe(1);
});

it('serializes v2 projection settings with stable frontmatter keys', () => {
  const updated = patchArticleStyle(DEFAULT_ARTICLE_STYLE, {
    externalLinkCitation: true,
    wordCount: true,
  });
  expect(serializeArticleStyle(updated)).toMatchObject({
    version: 2,
    'external-link-citation': true,
    'word-count': true,
  });
});

it('rejects a future v3 schema', () => {
  expect(parseArticleStyle({ version: 3, theme: 'future' }))
    .toEqual({ status: 'unsupported', config: null, version: 3 });
});
```

Update the existing future-schema test from v2 to v3.

- [ ] **Step 2: Run the focused tests and confirm they fail for missing v2 fields**

Run:

```bash
npx vitest run tests/unit/styles/style-config.test.ts tests/unit/settings/settings-store.test.ts
```

Expected: FAIL because `version` is still `1` and the two new fields are absent.

- [ ] **Step 3: Define the v2 type and migration contract**

Change the domain shape to:

```ts
export interface ArticleStyleConfig {
  version: 2;
  themeId: string;
  fontFamily: FontFamilyId;
  fontSize: FontSize;
  primaryColor: string;
  headingStyles: Readonly<Partial<Record<HeadingLevel, HeadingStyle>>>;
  codeThemeId: string;
  showCodeLineNumbers: boolean;
  macCodeBlock: boolean;
  imageCaption: ImageCaptionMode;
  externalLinkCitation: boolean;
  paragraphIndent: boolean;
  textJustify: boolean;
  wordCount: boolean;
}

export type StyleParseResult =
  | Readonly<{ status: 'missing'; config: null; version: null }>
  | Readonly<{ status: 'valid'; config: Readonly<ArticleStyleConfig>; version: 1 | 2 }>
  | Readonly<{ status: 'unsupported'; config: null; version: number }>;
```

In `style-config.ts`, normalize both typed and Frontmatter keys:

```ts
externalLinkCitation: booleanValue(
  first(value, 'externalLinkCitation', 'external-link-citation'),
  fallback.externalLinkCitation,
),
wordCount: booleanValue(
  first(value, 'wordCount', 'word-count'),
  fallback.wordCount,
),
```

Return `version: 2` in every in-memory config, but preserve the detected source version in `StyleParseResult.version`.

- [ ] **Step 4: Update defaults and settings sanitization fixtures**

Set both fields to `false` in `BASE_DEFAULTS` and `DEFAULT_SETTINGS.defaultStyle`. Ensure `SettingsStore.load()` migrates saved v1 defaults/recent styles in memory without writing until the next explicit save.

- [ ] **Step 5: Run focused tests and typecheck**

Run:

```bash
npx vitest run tests/unit/styles/style-config.test.ts tests/unit/settings/settings-store.test.ts tests/unit/styles/style-resolver.test.ts tests/unit/styles/style-frontmatter-store.test.ts
npm run typecheck
```

Expected: all PASS.

- [ ] **Step 6: Scan and commit Task 1**

```bash
npm run scan:secrets
git add src/domain/style.ts src/styles/style-config.ts src/settings/model.ts \
  tests/unit/styles/style-config.test.ts tests/unit/settings/settings-store.test.ts \
  tests/fixtures/workbench-render-state.ts
git commit -m "feat(style): add v2 projection settings"
```

### Task 2: Add Doocs-compatible reading-time calculation

**Files:**

- Create: `src/render/reading-time.ts`
- Create: `tests/unit/render/reading-time.test.ts`

**Interfaces:**

- Produces: `readingTime(text: string, wordsPerMinute?: number): Readonly<ReadingTimeResult>`.
- Produces type:

```ts
export interface ReadingTimeResult {
  text: string;
  time: number;
  words: number;
  minutes: number;
}
```

- [ ] **Step 1: Write fixed CJK, Latin, punctuation, and empty-input tests**

```ts
it.each([
  ['', { text: '0 min read', words: 0, minutes: 0, time: 0 }],
  ['hello world', { text: '1 min read', words: 2, minutes: 0.01, time: 600 }],
  ['你好，世界！', { text: '1 min read', words: 4, minutes: 0.02, time: 1200 }],
  ['Hello 微信 editor', { text: '1 min read', words: 4, minutes: 0.02, time: 1200 }],
])('counts %j deterministically', (text, expected) => {
  expect(readingTime(text)).toMatchObject(expected);
});
```

Add a test that `Math.ceil(result.minutes)` is `1` for non-empty short content.

- [ ] **Step 2: Run the new test and confirm the module is missing**

```bash
npx vitest run tests/unit/render/reading-time.test.ts
```

Expected: FAIL because `src/render/reading-time.ts` does not exist.

- [ ] **Step 3: Implement the fixed algorithm**

Port the small pure algorithm from Doocs `packages/shared/src/utils/readingTime.ts` as a local deterministic function:

```ts
const WORDS_PER_MINUTE = 200;
// Match Doocs packages/shared/src/utils/readingTime.ts at the researched commit.
// Keep this local to avoid importing the Doocs editor runtime.
const CJK_RANGES: readonly (readonly [number, number])[] = [
  [0x3040, 0x309F], [0x4E00, 0x9FFF], [0xAC00, 0xD7A3], [0x20000, 0x2EBE0],
];
const PUNCTUATION_RANGES: readonly (readonly [number, number])[] = [
  [0x21, 0x2F], [0x3A, 0x40], [0x5B, 0x60], [0x7B, 0x7E], [0x3000, 0x303F], [0xFF00, 0xFFEF],
];

function inRanges(char: string | undefined, ranges: typeof CJK_RANGES): boolean {
  const code = char?.charCodeAt(0);
  return code !== undefined && ranges.some(([start, end]) => start <= code && code <= end);
}

function isWordBoundary(char: string | undefined): boolean {
  return typeof char === 'string' && ` \n\r\t`.includes(char);
}

function isPunctuation(char: string | undefined): boolean {
  return inRanges(char, PUNCTUATION_RANGES);
}

export function readingTime(text: string, wordsPerMinute = WORDS_PER_MINUTE): Readonly<ReadingTimeResult> {
  let words = 0;
  let start = 0;
  let end = text.length - 1;
  while (isWordBoundary(text[start])) start += 1;
  while (isWordBoundary(text[end])) end -= 1;
  const normalizedText = `${text}\n`;
  for (let index = start; index <= end; index += 1) {
    const current = normalizedText[index];
    const next = normalizedText[index + 1];
    if (inRanges(current, CJK_RANGES)
      || (!isWordBoundary(current) && (isWordBoundary(next) || inRanges(next, CJK_RANGES)))) {
      words += 1;
    }
    if (inRanges(current, CJK_RANGES)) {
      while (index <= end && (isPunctuation(normalizedText[index + 1]) || isWordBoundary(normalizedText[index + 1]))) {
        index += 1;
      }
    }
  }
  const minutes = words / (wordsPerMinute || WORDS_PER_MINUTE);
  return Object.freeze({
    text: `${Math.ceil(Number(minutes.toFixed(2)))} min read`,
    time: Math.round(minutes * 60 * 1000),
    words,
    minutes,
  });
}
```

Add a source comment linking to the fixed Doocs commit and note the WTFPL provenance. Do not add an npm dependency.

- [ ] **Step 4: Run the focused test**

```bash
npx vitest run tests/unit/render/reading-time.test.ts
```

Expected: PASS.

- [ ] **Step 5: Scan and commit Task 2**

```bash
npm run scan:secrets
git add src/render/reading-time.ts tests/unit/render/reading-time.test.ts
git commit -m "feat(render): add deterministic reading time"
```

### Task 3: Project reading summary and external-link citations into the artifact

**Files:**

- Modify: `src/render/style-projections.ts`
- Modify: `src/render/artifact-builder.ts`
- Modify: `src/styles/style-compiler.ts`
- Modify: `tests/unit/render/style-projections.test.ts`
- Modify: `tests/unit/render/rich-elements.test.ts`
- Modify: `tests/unit/styles/style-compiler.test.ts`

**Interfaces:**

- Consumes: `readingTime()` from Task 2.
- Produces:

```ts
export function applyReadingSummary(
  root: Element,
  markdown: string,
  enabled: boolean,
): void;

export function applyExternalLinkCitations(
  root: Element,
  enabled: boolean,
): void;
```

- [ ] **Step 1: Write failing projection tests**

Add the following primary tests, then add separate tests for disabled mode, bare URL text, stable first-appearance ordering, non-HTTP links, and escaped titles:

```ts
it('prepends a reading summary only when enabled', () => {
  const root = article('<p>你好 world</p>');
  applyReadingSummary(root, '你好 world', true);
  expect(root.firstElementChild?.classList.contains('reading-summary')).toBe(true);
  expect(root.firstElementChild?.textContent)
    .toBe('字数 3，阅读大约需 1 分钟');
});

it('deduplicates external links and excludes WeChat links', () => {
  const root = article([
    '<p><a href="https://example.com/a">A</a></p>',
    '<p><a href="https://example.com/a">Again</a></p>',
    '<p><a href="https://mp.weixin.qq.com/s/id">WeChat</a></p>',
  ].join(''));
  applyExternalLinkCitations(root, true);
  expect(root.querySelectorAll('sup')).toHaveLength(2);
  expect(root.querySelectorAll('.external-link-references li')).toHaveLength(1);
  expect(root.textContent).toContain('引用链接');
});
```

Also test disabled mode, bare URL text, stable first-appearance ordering, unsafe/non-HTTP protocols already removed by the Markdown sanitizer, and escaping of link titles.

- [ ] **Step 2: Run the focused projection tests**

```bash
npx vitest run tests/unit/render/style-projections.test.ts
```

Expected: FAIL because the projection functions do not exist.

- [ ] **Step 3: Implement projections exclusively with DOM APIs**

Use `ownerDocument.createElementNS()` and `textContent`. Implement the projections with this structure:

```ts
const WECHAT_HOST = 'mp.weixin.qq.com';

export function applyExternalLinkCitations(root: Element, enabled: boolean): void {
  if (!enabled) return;
  const references = new Map<string, { index: number; label: string; href: string }>();
  for (const anchor of root.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    const href = anchor.getAttribute('href')?.trim() ?? '';
    let url: URL;
    try {
      url = new URL(href);
    } catch {
      continue;
    }
    if (!['http:', 'https:'].includes(url.protocol)
      || url.hostname === WECHAT_HOST
      || anchor.textContent?.trim() === href) continue;
    let reference = references.get(url.href);
    if (reference === undefined) {
      reference = {
        index: references.size + 1,
        label: anchor.getAttribute('title')?.trim() || anchor.textContent?.trim() || url.href,
        href: url.href,
      };
      references.set(url.href, reference);
    }
    const sup = createHtmlElement(root.ownerDocument, 'sup');
    sup.className = 'external-link-reference';
    sup.textContent = `[${reference.index}]`;
    anchor.append(sup);
  }
  if (references.size === 0) return;
  const section = createHtmlElement(root.ownerDocument, 'section');
  section.className = 'external-link-references';
  section.append(createHtmlElement(root.ownerDocument, 'h4'));
  section.firstElementChild!.textContent = '引用链接';
  const list = createHtmlElement(root.ownerDocument, 'ol');
  for (const reference of references.values()) {
    const item = createHtmlElement(root.ownerDocument, 'li');
    const link = createHtmlElement(root.ownerDocument, 'a');
    link.setAttribute('href', reference.href);
    link.textContent = reference.label;
    item.append(link);
    list.append(item);
  }
  section.append(list);
  root.append(section);
}

export function applyReadingSummary(root: Element, markdown: string, enabled: boolean): void {
  if (!enabled) return;
  const result = readingTime(markdown);
  if (result.words === 0) return;
  const blockquote = createHtmlElement(root.ownerDocument, 'blockquote');
  blockquote.className = 'reading-summary';
  const paragraph = createHtmlElement(root.ownerDocument, 'p');
  paragraph.textContent = `字数 ${result.words}，阅读大约需 ${Math.ceil(result.minutes)} 分钟`;
  blockquote.append(paragraph);
  root.prepend(blockquote);
}
```

Do not mutate `plainText`; `RenderArtifactBuilder` must compute the original plain text before applying generated projections.

- [ ] **Step 4: Wire the fixed processing order into `RenderArtifactBuilder`**

After `plainText(structuralRoot)` and before image extraction:

```ts
if (style !== null) {
  applyReadingSummary(structuralRoot, snapshot.markdown, style.wordCount);
  applyExternalLinkCitations(structuralRoot, style.externalLinkCitation);
  applyImageCaptions(structuralRoot, style.imageCaption);
}
```

Add scoped CSS from `StyleCompiler` for `.reading-summary`, `.external-link-references`, its list, links, and superscripts. Use `primaryColor` and no external resources.

- [ ] **Step 5: Verify artifact determinism and disabled-mode compatibility**

```bash
npx vitest run \
  tests/unit/render/style-projections.test.ts \
  tests/unit/render/rich-elements.test.ts \
  tests/unit/render/determinism.test.ts \
  tests/unit/styles/style-compiler.test.ts
```

Expected: all PASS; with both new flags `false`, existing canonical HTML remains unchanged except for intentional compiler CSS updates reflected in goldens.

- [ ] **Step 6: Scan and commit Task 3**

```bash
npm run scan:secrets
git add src/render/style-projections.ts src/render/artifact-builder.ts \
  src/styles/style-compiler.ts tests/unit/render/style-projections.test.ts \
  tests/unit/render/rich-elements.test.ts tests/unit/styles/style-compiler.test.ts
git commit -m "feat(render): add Doocs content projections"
```

### Batch 1 Checkpoint

Run:

```bash
npm run typecheck
npx vitest run tests/unit/styles tests/unit/render
```

Review gate:

- v1 style data loads as v2 without automatic writeback.
- v3 remains protected.
- external citations and reading summary are deterministic.
- image, math, Mermaid, and code tests remain green.

Do not start Batch 2 until this checkpoint passes.

## Batch 2: Obsidian-native Doocs panel

### Task 4: Add the reset confirmation modal

**Files:**

- Create: `src/ui/style-reset-modal.ts`
- Create: `tests/unit/ui/style-reset-modal.test.ts`

**Interfaces:**

- Produces:

```ts
export class StyleResetModal extends Modal {
  constructor(app: App, onConfirm: () => void);
}
```

- [x] **Step 1: Write the modal behavior tests**

Assert that the modal title and body explain current-article reset, cancel performs no action, and confirm calls the callback exactly once.

```ts
expect(modal.titleEl.textContent).toBe('重置文章样式');
expect(modal.contentEl.textContent).toContain('恢复当前文章的默认样式');
confirm.click();
expect(onConfirm).toHaveBeenCalledOnce();
```

- [x] **Step 2: Run the focused test and confirm failure**

```bash
npx vitest run tests/unit/ui/style-reset-modal.test.ts
```

Expected: FAIL because the modal does not exist.

- [x] **Step 3: Implement with Obsidian `Modal` and public DOM helpers**

Use `setTitle()`, `contentEl.createEl()`, a normal cancel button, and `setWarning()` for confirm. Do not inject HTML strings.

- [x] **Step 4: Run the focused test**

```bash
npx vitest run tests/unit/ui/style-reset-modal.test.ts
```

Expected: PASS.

- [x] **Step 5: Scan Task 4**

```bash
npm run scan:secrets
git add src/ui/style-reset-modal.ts tests/unit/ui/style-reset-modal.test.ts
git commit -m "feat(ui): confirm article style reset"
```

### Task 5: Replace the panel controls and preserve DOM identity

**Files:**

- Modify: `src/ui/style-workbench.ts`
- Modify: `src/ui/workbench-view.ts`
- Modify: `src/styles/style-options.ts`
- Modify: `tests/unit/ui/style-workbench.test.ts`
- Modify: `tests/unit/ui/workbench-view.test.ts`

**Interfaces:**

- Consumes: `App`, `WorkbenchRenderState`, Obsidian public DOM helpers, and `StyleResetModal`.
- Updates constructor to:

```ts
constructor(
  app: App,
  container: HTMLElement,
  actions: StyleWorkbenchActions,
)
```

- Keeps `StyleWorkbenchActions` to:

```ts
export interface StyleWorkbenchActions {
  patch(patch: StylePatch): void;
  selectTheme(themeId: string): void;
  reset(): void;
  close(): void;
}
```

- [x] **Step 1: Replace old UI assertions with the screenshot contract**

Tests must assert:

```ts
expect(container.querySelectorAll('[data-style-theme]')).toHaveLength(3);
expect(container.querySelectorAll('[data-style-font]')).toHaveLength(3);
expect(container.querySelectorAll('[data-style-size]')).toHaveLength(5);
expect(container.querySelectorAll('[data-style-color]')).toHaveLength(11);
expect(container.querySelector('[data-testid="style-custom-color"]')).not.toBeNull();
expect(container.querySelectorAll('[data-style-heading-level]')).toHaveLength(1);
expect(container.querySelectorAll('[data-style-heading-style]')).toHaveLength(1);
expect(container.querySelectorAll('[data-style-caption]')).toHaveLength(6);
expect(container.querySelectorAll('[data-style-switch]')).toHaveLength(6);
expect(container.textContent).toContain('外链转引用');
expect(container.textContent).toContain('字数统计');
expect(container.textContent).not.toContain('设为全局默认');
expect(container.textContent).not.toContain('探索更多主题');
expect(container.textContent).not.toContain('自定义主题');
```

Add a DOM-identity test that stores the root, body, heading dropdown, color component input, and `scrollTop`, calls `update()` 20 times, and verifies every node and scroll offset is unchanged.

- [x] **Step 2: Add failing interaction tests**

Cover:

- five font-size buttons stay in one logical grid.
- custom color emits normalized uppercase `#RRGGBB`.
- heading-level change alone emits no patch.
- heading-style change patches only the selected level.
- code-theme dropdown patches `codeThemeId`.
- six toggles map to exact fields in exact order.
- reset opens the modal; cancel does nothing; confirm calls `reset()`.
- Escape closes once and listeners are not duplicated after updates.

- [x] **Step 3: Run the UI tests and capture expected failures**

```bash
npx vitest run tests/unit/ui/style-workbench.test.ts tests/unit/ui/workbench-view.test.ts
```

Expected: FAIL because the current panel has six heading selects, four switches, a caption select, and a global-default action.

- [x] **Step 4: Rebuild `StyleWorkbench` with Obsidian public DOM helpers**

Use persistent fields:

```ts
private selectedHeadingLevel: HeadingLevel = 'h2';
private readonly themeButtons = new Map<string, HTMLButtonElement>();
private readonly fontButtons = new Map<string, HTMLButtonElement>();
private readonly sizeButtons = new Map<number, HTMLButtonElement>();
private readonly colorButtons = new Map<string, HTMLButtonElement>();
private readonly captionButtons = new Map<ImageCaptionMode, HTMLButtonElement>();
private headingLevelDropdown: SelectControl | null = null;
private headingStyleDropdown: SelectControl | null = null;
private codeThemeDropdown: SelectControl | null = null;
private customColor: HTMLInputElement | null = null;
private readonly toggles = new Map<keyof ArticleStyleConfig, HTMLButtonElement>();
```

Build controls once in `render()`. `update()` may only call setters and toggle selected classes. The custom listbox is built with `createEl/createDiv` because the native select rendering caused the repeated clipping bug in the target Obsidian layout. Avoid setter feedback loops with an `updating` boolean:

```ts
private updating = false;

private updateFromState(state: Readonly<WorkbenchRenderState>): void {
  this.updating = true;
  try {
    this.headingStyleDropdown?.setValue(
      state.style.config.headingStyles[this.selectedHeadingLevel] ?? 'default',
    );
  } finally {
    this.updating = false;
  }
}
```

Every `onChange` returns immediately when `updating` is true.

- [x] **Step 5: Implement the exact visible order**

The DOM order must be:

```ts
const ORDER = [
  '主题', '字体', '字号', '主题色', '自定义色',
  '标题', '代码主题', '图注',
  'Mac 样式', '行号', '外链转引用', '首行缩进', '两端对齐', '字数统计',
  '操作',
] as const;
```

Use left-label/right-control rows with accessible `role="switch"` buttons. Use a color input for the custom swatch. Use custom accessible listboxes for title level, title style, and code theme. Keep caption as two-column buttons.

- [x] **Step 6: Wire `App` and remove the panel global-default action**

Change `WorkbenchView.toggleStylePanel()` to:

```ts
this.styleWorkbench = new StyleWorkbench(this.app, this.styleHost, {
  patch: patch => this.controller?.updateStyle?.(patch),
  selectTheme: themeId => this.controller?.selectStyleTheme?.(themeId),
  reset: () => this.controller?.resetStyle?.(),
  close: () => this.closeStylePanel(),
});
```

Do not delete `WorkbenchController.setStyleAsDefault()` or `StyleWorkflow.setGlobalDefault()`; they remain domain capabilities outside this panel.

- [x] **Step 7: Run focused UI tests**

```bash
npx vitest run tests/unit/ui/style-reset-modal.test.ts tests/unit/ui/style-workbench.test.ts tests/unit/ui/workbench-view.test.ts
```

Expected: all PASS.

- [x] **Step 8: Scan Task 5**

```bash
npm run scan:secrets
git add src/ui/style-workbench.ts src/ui/workbench-view.ts src/styles/style-options.ts \
  tests/unit/ui/style-workbench.test.ts tests/unit/ui/workbench-view.test.ts
git commit -m "feat(ui): reproduce Doocs style controls"
```

### Task 6: Reproduce panel layout with isolated CSS

**Files:**

- Modify: `styles.css`
- Modify: `tests/visual/workbench-visual.test.ts`

**Interfaces:**

- Consumes the stable class names and `data-*` hooks created in Task 5.
- Produces no TypeScript API.

- [x] **Step 1: Replace outdated CSS contract assertions**

Remove assertions tied to the old six-row native `<select>`, gray full-row button switches, sticky two-button footer, and scroll snap. Add assertions for:

```ts
expect(css).toMatch(/wechat-workbench__style-sizes[^}]*grid-template-columns:\s*repeat\(5,/su);
expect(css).toMatch(/wechat-workbench__style-options[^}]*grid-template-columns:\s*repeat\(3,/su);
expect(css).toMatch(/wechat-workbench__style-captions[^}]*grid-template-columns:\s*repeat\(2,/su);
expect(css).toMatch(/wechat-workbench__style-toggle-row[^}]*justify-content:\s*space-between/su);
expect(css).toMatch(/wechat-workbench__style-body[^}]*overflow-y:\s*auto/su);
expect(css).toMatch(/wechat-workbench__style-panel[^}]*width:\s*clamp\(/su);
expect(css).not.toMatch(/wechat-workbench__style-select-label select/u);
expect(css).not.toMatch(/(?:^|\n)\s*(?:button|input|select|h1|p)\s*\{/mu);
```

- [x] **Step 2: Run the visual contract test and confirm failure**

```bash
npx vitest run tests/visual/workbench-visual.test.ts
```

Expected: FAIL against the old CSS structure.

- [x] **Step 3: Implement the scoped Doocs grid and spacing system**

Use these layout rules in `styles.css`:

```css
.wechat-workbench__style-panel {
  width: clamp(22rem, 58%, 30rem);
  max-width: 100%;
}

.wechat-workbench__style-body {
  min-height: 0;
  overflow-y: auto;
  padding: var(--size-4-4);
}

.wechat-workbench__style-options,
.wechat-workbench__style-fonts {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--size-4-2);
}

.wechat-workbench__style-sizes {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: var(--size-4-1);
}

.wechat-workbench__style-captions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--size-4-2);
}

.wechat-workbench__style-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--size-4-3);
}
```

Style only plugin classes and Obsidian control elements nested under them. Set dropdown `min-height`, padding, and `line-height: normal`; do not recreate the clipping-prone fixed line-height rule.

- [x] **Step 4: Ensure panel overlay does not resize preview**

Keep `.wechat-workbench__style-host` absolutely positioned over the preview stage and keep `.wechat-workbench__preview-canvas` width unchanged. Verify the panel header is fixed within the panel while only `.wechat-workbench__style-body` scrolls.

- [x] **Step 5: Run visual and UI contract tests**

```bash
npx vitest run tests/visual/workbench-visual.test.ts tests/unit/ui/style-workbench.test.ts tests/unit/ui/workbench-view.test.ts
```

Expected: all PASS.

- [x] **Step 6: Scan Task 6**

```bash
npm run scan:secrets
git add styles.css tests/visual/workbench-visual.test.ts
git commit -m "style(ui): match Doocs panel layout"
```

### Batch 2 Checkpoint

Status: PASS. The panel uses Obsidian public DOM helpers and a scoped accessible listbox instead of native `select` controls; this avoids the clipping behavior observed in the previous panel while keeping the plugin free of Vue components.

Run:

```bash
npm run typecheck
npm run lint
npx vitest run tests/unit/ui tests/visual/workbench-visual.test.ts
```

Manual jsdom inspection:

- exactly 3 theme, 3 font, 5 size, 11 preset-color, 6 caption, and 6 toggle controls.
- exactly 2 heading dropdowns and 1 code-theme dropdown.
- no marketplace, custom-theme group, global-default button, save indicator, or article name.
- root node and scroll offset remain stable after 20 updates.

Do not start Batch 3 until this checkpoint passes.

## Batch 3: Artifact parity and real-user verification

### Task 7: Verify preview, copy, and publishing use every visible setting

**Files:**

- Create: `tests/integration/doocs-style-panel-artifact.test.ts`
- Modify: `tests/integration/style-workbench.test.ts`
- Modify: `tests/unit/clipboard/clipboard-service.test.ts`
- Modify: `tests/unit/publish/publish-workflow.test.ts`
- Modify: `tests/unit/render/doocs-style-golden.test.ts`
- Modify: `tests/golden/doocs-classic.html`
- Modify: `tests/golden/doocs-grace.html`
- Modify: `tests/golden/doocs-simple.html`

**Interfaces:**

- Consumes: style v2, `StyleWorkflow`, `RenderArtifactBuilder`, `ClipboardService`, and publish preparation.
- Produces verification only; no new production API.

- [ ] **Step 1: Add an integration fixture containing every affected content type**

Use Markdown with:

````md
# 一级标题

## 二级标题

普通段落和 [外部链接](https://example.com/docs)。

![本地测试图](assets/local.png "本地图标题")

![远程测试图](https://example.com/remote.png "远程图标题")

```ts
const first = 1;
const second = 2;
```
````

Include an inline code span, ordered list, blockquote, table, formula, and Mermaid block so the projection order cannot regress existing extensions.

- [ ] **Step 2: Write a shared-artifact assertion**

Build with all new fields enabled and assert:

```ts
expect(artifact.canonicalHtml).toContain('reading-summary');
expect(artifact.canonicalHtml).toContain('external-link-references');
expect(artifact.canonicalHtml).toContain('image-caption');
expect(artifact.canonicalHtml).toContain('code-window-dots');

await clipboard.copyForWeChat(artifact);
expect(clipboardWrite.html).toBe(resolvedArtifactHtml);
expect(preparedPublish.artifact.contentHash).toBe(artifact.contentHash);
```

Also build with all flags disabled and assert generated summary/reference structures are absent.

- [ ] **Step 3: Run the integration test and fix only parity-related failures**

```bash
npx vitest run tests/integration/doocs-style-panel-artifact.test.ts tests/integration/style-workbench.test.ts
```

Expected: PASS after Tasks 1–6. If existing unrelated tests fail, report them separately; do not modify unrelated production code.

- [ ] **Step 4: Regenerate and inspect three golden files**

Run the existing golden update mechanism used by `tests/unit/render/doocs-style-golden.test.ts`, then inspect the diff manually for:

- no remote stylesheet references.
- no unexpected blank heading margins.
- code line height and Mac dot spacing are stable.
- generated citation/statistics CSS is scoped.
- canonical HTML ordering is deterministic.

Do not accept snapshots blindly.

- [ ] **Step 5: Run the full automated gate**

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run verify:release
npm run scan:secrets
```

Expected: every command exits `0`.

- [ ] **Step 6: Scan and commit Task 7**

```bash
npm run scan:secrets
git add tests/integration/doocs-style-panel-artifact.test.ts \
  tests/integration/style-workbench.test.ts \
  tests/unit/clipboard/clipboard-service.test.ts \
  tests/unit/publish/publish-workflow.test.ts \
  tests/unit/render/doocs-style-golden.test.ts \
  tests/golden/doocs-classic.html tests/golden/doocs-grace.html tests/golden/doocs-simple.html
git commit -m "test(style): verify Doocs artifact parity"
```

### Task 8: Perform real Obsidian visual and image acceptance

**Files:**

- Create: `docs/verification/doocs-style-workbench-parity.md`
- Modify only if required by verified defects: files from Tasks 1–7

**Interfaces:**

- Produces evidence, screenshots, and an explicit pass/fail ledger.
- Does not publish or push code.

- [ ] **Step 1: Sync the built plugin into the isolated Vault**

```bash
npm run build
npm run sync:test-vault
```

Verify the target is `/tmp/wechat-workbench-checkpoint-1/.obsidian/plugins/wechat-workbench/` before opening Obsidian.

- [ ] **Step 2: Reload the plugin and verify the top half**

In real Obsidian, capture evidence for:

- 3-column theme and font rows.
- 5-column font-size row.
- 11 preset colors and custom color swatch.
- custom color immediately changing preview.
- no panel disappearance or flicker during 20 rapid clicks.

- [ ] **Step 3: Verify title, code, caption, and switches**

Capture evidence for:

- title level and title style as two complete, vertically centered dropdowns.
- code theme as one complete full-width dropdown.
- caption as six two-column buttons.
- six left-label/right-toggle rows in exact order.
- panel remains fixed while preview scrolls; panel body scrolls independently.

- [ ] **Step 4: Verify content with images and code**

Use local PNG, local JPEG, remote HTTPS image, missing alt/title image, one-line code, two-line code, long code, H1 followed by H2, external links, and Chinese/English mixed text. Record:

- image preview and caption results for all six modes.
- remote images remain passive placeholders until an explicit network action.
- no extra heading gap.
- code lines have regular spacing and safe top padding below Mac dots.
- external references and reading statistics are visually coherent.

- [ ] **Step 5: Verify rich copy in the real WeChat editor**

Click “复制”, paste into the dedicated WeChat editor test page, and compare title, color, code, image, caption, reference, and statistics with the frozen preview artifact. Record the artifact hash and screenshots.

- [ ] **Step 6: Verify the draft box with the authorized test account**

Use the existing local AppID/AppSecret and whitelist configuration. Create or update one test draft, then inspect the WeChat backend draft visually. Do not mass-send or publicly publish.

- [ ] **Step 7: Write the verification ledger**

`docs/verification/doocs-style-workbench-parity.md` must separate:

```text
Automated checks
Real Obsidian checks
Image compatibility
Rich-copy verification
Draft-box verification
Known limitations
Failures/blockers
```

Every item includes date, environment, result, and evidence path. Do not mark unexecuted checks as passed.

- [ ] **Step 8: Final scan and commit verification evidence**

```bash
npm run scan:secrets
git add docs/verification/doocs-style-workbench-parity.md
git commit -m "docs(style): record Doocs parity verification"
```

### Batch 3 Checkpoint

The feature is complete only when:

- all automated commands pass.
- the real Obsidian panel matches the approved screenshot scope.
- text is never clipped in any dropdown.
- rapid interactions do not remount or flash the panel.
- PNG, JPEG, remote-image placeholder, code, titles, citations, and reading statistics are verified.
- rich copy and test-account draft use the same frozen artifact semantics.
- no credential or sensitive value appears in logs, screenshots committed to Git, Frontmatter fixtures, or verification documents.

## Final Review Checklist

- [ ] The implementation contains no Vue-related package or runtime code.
- [ ] Only the three screenshot themes are visible in the panel.
- [ ] Theme marketplace and custom CSS are absent.
- [ ] Vault custom-theme registry capability still exists.
- [ ] `ArticleStyleConfig` v1 migrates safely and v3 is protected.
- [ ] UI controls use Obsidian public components or documented DOM helpers.
- [ ] No global CSS selector was added.
- [ ] No `innerHTML`, `outerHTML`, or `insertAdjacentHTML` was added.
- [ ] Panel root identity and scroll position survive repeated updates.
- [ ] Preview, copy, and draft share the immutable artifact.
- [ ] Image and code compatibility have real evidence, not only text fixtures.
- [ ] Secrets scan passes immediately before every commit.
- [ ] No push, npm publish, community submission, or public article publication occurred.

## Execution Handoff

Execute in this current session by batches with a review checkpoint after Batch 1, Batch 2, and Batch 3. Use `superpowers:executing-plans`; do not skip a checkpoint after an apparently successful test run.
