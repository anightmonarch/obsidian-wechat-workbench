# WeSight-Style Workbench UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current generic WeChat Workbench panel with a clean-room, high-fidelity WeSight-style publishing workbench while preserving the existing local rendering, copy, cover, draft, recovery, and security services.

**Architecture:** Keep `WorkbenchController` and all domain services unchanged. Split presentation responsibilities into compact preflight and publishing-settings modules, then rebuild `WeChatWorkbenchView` as the brand header → tabs → action bar → status row → preview/settings shell approved in the design. Use Obsidian components and CSS variables for the shell; keep article theme CSS isolated inside `.wechat-article`.

**Tech Stack:** TypeScript 5.8, Obsidian 1.13 API, DOM APIs, Vitest 4 + jsdom, CSS, esbuild.

---

## File map

- Create `src/ui/workbench-publish-settings.ts`: render the `文章信息`、`文章封面`、`发布状态` sections without exposing hashes or IDs.
- Modify `src/ui/render-preflight.ts`: derive the compact status line and render detailed diagnostics only on demand.
- Modify `src/ui/workbench-view.ts`: build the WeSight-style shell, wire actions, preserve the last stable preview while rendering, and manage transient publish status.
- Modify `src/ui/publish-dialog.ts`: keep the draft-only safety confirmation while removing default technical hashes and network destinations.
- Modify `src/main.ts`: provide the local account settings callback without adding a login gate.
- Modify `styles.css`: replace the current generic shell styles with the approved green, flat, WeSight-style layout; leave article themes untouched.
- Modify `tests/mocks/obsidian.ts`: support `Menu`, icons, menu items, and the new account/settings interaction in jsdom.
- Create `tests/fixtures/workbench-render-state.ts`: shared immutable UI fixture.
- Create `tests/unit/ui/render-preflight.test.ts`: compact status and detail behavior.
- Create `tests/unit/ui/workbench-publish-settings.test.ts`: publishing-settings information boundaries and cover action.
- Modify `tests/unit/ui/workbench-view.test.ts`: shell hierarchy, hidden account internals, actions, tabs, theme menu, loading stability, and diagnostics.
- Modify `tests/unit/ui/publish-dialog.test.ts`: draft-only compact confirmation.
- Modify `tests/visual/workbench-visual.test.ts`: structural and responsive CSS contract.
- Create `docs/verification/wesight-ui-redesign.md`: automated and real-Obsidian evidence.

## Task 1: Compact publication-check presentation

**Files:**
- Modify: `src/ui/render-preflight.ts`
- Create: `tests/unit/ui/render-preflight.test.ts`

- [ ] **Step 1: Write the failing presentation tests**

```ts
import { describe, expect, it } from 'vitest';
import { buildPreflightPresentation, renderPreflightDetails } from '../../../src/ui/render-preflight';

describe('compact preflight presentation', () => {
  it('hides non-blocking warning text from the default status line', () => {
    const view = buildPreflightPresentation({
      ok: true,
      blocking: [],
      warnings: [{ code: 'DIGEST_EMPTY', severity: 'WARNING', message: 'Digest is empty.', source: null }],
      info: [],
    });
    expect(view).toMatchObject({ label: '发布检查通过', tone: 'warning', detailCount: 1 });
    expect(view.label).not.toContain('Digest');
  });

  it('uses a blocking summary and renders detail rows only on demand', () => {
    const report = {
      ok: false,
      blocking: [{ code: 'TITLE_EMPTY', severity: 'BLOCKING' as const, message: 'Title is empty.', source: null }],
      warnings: [],
      info: [],
    };
    expect(buildPreflightPresentation(report).label).toBe('需要处理 · 1 项');
    const host = document.createElement('div');
    renderPreflightDetails(host, report);
    expect(host.textContent).toContain('Title is empty.');
    expect(host.querySelector('[data-code="TITLE_EMPTY"]')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx vitest run tests/unit/ui/render-preflight.test.ts`

Expected: FAIL because `buildPreflightPresentation` and `renderPreflightDetails` are not exported.

- [ ] **Step 3: Implement the compact model and detail renderer**

```ts
import { type App, Modal } from 'obsidian';
import type { PreflightReport } from '../preflight/preflight-engine';

export interface PreflightPresentation {
  label: string;
  tone: 'success' | 'warning' | 'blocking';
  detailCount: number;
}

export function buildPreflightPresentation(
  report: Readonly<PreflightReport>,
): Readonly<PreflightPresentation> {
  if (report.blocking.length > 0) {
    return Object.freeze({
      label: `需要处理 · ${report.blocking.length} 项`,
      tone: 'blocking',
      detailCount: report.blocking.length + report.warnings.length,
    });
  }
  return Object.freeze({
    label: '发布检查通过',
    tone: report.warnings.length > 0 ? 'warning' : 'success',
    detailCount: report.warnings.length,
  });
}

export function renderPreflightDetails(
  container: HTMLElement,
  report: Readonly<PreflightReport>,
): void {
  container.replaceChildren();
  const items = [...report.blocking, ...report.warnings];
  if (items.length === 0) {
    container.append(createEl('p', { text: '当前文章可以同步到公众号草稿箱。' }));
    return;
  }
  const list = createEl('ul', { cls: 'wechat-workbench__check-details' });
  for (const item of items) {
    const row = createEl('li');
    row.dataset.code = item.code;
    row.textContent = item.message;
    list.append(row);
  }
  container.append(list);
}

export class PreflightDetailsModal extends Modal {
  constructor(app: App, private readonly report: Readonly<PreflightReport>) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.textContent = this.report.blocking.length > 0 ? '发布前需要处理' : '发布检查详情';
    renderPreflightDetails(this.contentEl, this.report);
  }
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npx vitest run tests/unit/ui/render-preflight.test.ts`

Expected: 2 tests PASS.

- [ ] **Step 5: Commit the presentation model**

```bash
git add src/ui/render-preflight.ts tests/unit/ui/render-preflight.test.ts
git commit -m "feat(ui): add compact publication check presentation"
```

## Task 2: WeSight-style publishing settings sections

**Files:**
- Create: `src/ui/workbench-publish-settings.ts`
- Create: `tests/fixtures/workbench-render-state.ts`
- Create: `tests/unit/ui/workbench-publish-settings.test.ts`
- Modify: `tests/unit/ui/workbench-view.test.ts`

- [ ] **Step 1: Write the failing settings renderer test**

```ts
import { describe, expect, it, vi } from 'vitest';
import { renderPublishSettings } from '../../../src/ui/workbench-publish-settings';
import { renderState } from '../../fixtures/workbench-render-state';

describe('publish settings', () => {
  it('shows user-facing article, cover, and sync sections without internal identifiers', () => {
    const host = document.createElement('section');
    const chooseCover = vi.fn();
    renderPublishSettings(host, renderState, { chooseCover });

    expect(host.textContent).toContain('文章信息');
    expect(host.textContent).toContain('文章封面');
    expect(host.textContent).toContain('发布状态');
    expect(host.textContent).toContain('Article');
    expect(host.textContent).not.toMatch(/contentHash|taskId|mediaId|CONTENT_HASH/u);

    host.querySelector<HTMLButtonElement>('[data-testid="settings-cover"]')?.click();
    expect(chooseCover).toHaveBeenCalledOnce();
  });
});
```

Create the shared fixture with the complete state used by both suites:

```ts
import type { WorkbenchRenderState } from '../../src/ui/workbench-controller';

export const renderState: Readonly<WorkbenchRenderState> = Object.freeze({
  snapshot: Object.freeze({
    vaultPath: 'article.md', basename: 'article', modifiedAt: 1, markdown: '# Article',
    frontmatter: Object.freeze({}),
    metadata: Object.freeze({
      title: 'Article', author: 'Author', digest: '', cover: null, contentSourceUrl: '',
    }),
    selectedThemeId: 'native', sourceHash: 'source',
  }),
  artifact: Object.freeze({
    artifactVersion: '1', rendererVersion: '0.1.0',
    source: Object.freeze({ vaultPath: 'article.md', modifiedAt: 1, sourceHash: 'source' }),
    theme: Object.freeze({ id: 'native', version: '1.0.0', contentHash: 'theme' }),
    metadata: Object.freeze({
      title: 'Article', author: 'Author', digest: '', cover: null, contentSourceUrl: '',
    }),
    canonicalHtml: '<section class="wechat-article"><h1>Article</h1></section>',
    plainText: 'Article',
    assets: Object.freeze([]), diagnostics: Object.freeze([]), contentHash: 'content',
  }),
  preflight: Object.freeze({
    ok: true,
    blocking: Object.freeze([]),
    warnings: Object.freeze([Object.freeze({
      code: 'DIGEST_EMPTY', severity: 'WARNING', message: 'Digest is empty.', source: null,
    })]),
    info: Object.freeze([]),
  }),
  themes: Object.freeze([Object.freeze({
    manifest: Object.freeze({
      id: 'native', name: '原生简洁', version: '1.0.0', author: 'Test', description: '',
    }),
    css: '', contentHash: 'theme', source: 'builtin', previewPath: null,
  })]),
  selectedThemeId: 'native',
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npx vitest run tests/unit/ui/workbench-publish-settings.test.ts`

Expected: FAIL because the renderer and shared fixture do not exist.

- [ ] **Step 3: Implement the three settings sections**

```ts
import { WECHAT_FRONTMATTER_FIELDS } from '../publish/frontmatter-fields';
import type { WorkbenchRenderState } from './workbench-controller';

export interface PublishSettingsActions {
  chooseCover(): void;
}

export function renderPublishSettings(
  container: HTMLElement,
  state: Readonly<WorkbenchRenderState>,
  actions: Readonly<PublishSettingsActions>,
): void {
  container.replaceChildren();
  appendSection(container, '文章信息', [
    ['标题', state.artifact.metadata.title],
    ['作者', state.artifact.metadata.author || '未设置'],
    ['摘要', state.artifact.metadata.digest || '未设置'],
    ['原文链接', state.artifact.metadata.contentSourceUrl || '未设置'],
  ]);

  const cover = createEl('section', { cls: 'wechat-workbench__settings-section' });
  cover.append(createEl('h2', { text: '文章封面' }));
  cover.append(createEl('p', { text: state.artifact.metadata.cover ?? '尚未选择封面' }));
  const choose = createEl('button', { text: '更换封面' });
  choose.dataset.testid = 'settings-cover';
  choose.addEventListener('click', actions.chooseCover);
  cover.append(choose);
  container.append(cover);

  const draftId = state.snapshot.frontmatter[WECHAT_FRONTMATTER_FIELDS.draftId];
  const syncedAt = state.snapshot.frontmatter[WECHAT_FRONTMATTER_FIELDS.syncedAt];
  appendSection(container, '发布状态', [
    ['草稿关联', typeof draftId === 'string' && draftId.length > 0 ? '已关联' : '尚未关联'],
    ['最近同步', typeof syncedAt === 'string' && syncedAt.length > 0 ? syncedAt : '尚未同步'],
  ]);
}

function appendSection(
  container: HTMLElement,
  title: string,
  rows: ReadonlyArray<readonly [string, string]>,
): void {
  const block = createEl('section', { cls: 'wechat-workbench__settings-section' });
  block.append(createEl('h2', { text: title }));
  for (const [label, value] of rows) {
    const row = createDiv('wechat-workbench__setting-row');
    row.append(createEl('span', { text: label }), createEl('strong', { text: value }));
    block.append(row);
  }
  container.append(block);
}
```

- [ ] **Step 4: Run settings and workbench tests and verify GREEN**

Run: `npx vitest run tests/unit/ui/workbench-publish-settings.test.ts tests/unit/ui/workbench-view.test.ts`

Expected: all tests PASS after changing the workbench test to import the shared fixture.

- [ ] **Step 5: Commit the settings renderer**

```bash
git add src/ui/workbench-publish-settings.ts tests/fixtures/workbench-render-state.ts tests/unit/ui/workbench-publish-settings.test.ts tests/unit/ui/workbench-view.test.ts
git commit -m "feat(ui): add focused publishing settings sections"
```

## Task 3: Rebuild the workbench shell and interactions

**Files:**
- Modify: `src/ui/workbench-view.ts:1-355`
- Modify: `src/main.ts:1-240`
- Modify: `tests/mocks/obsidian.ts:1-55`
- Modify: `tests/unit/ui/workbench-view.test.ts`

- [ ] **Step 1: Extend the Obsidian test mock**

```ts
export class MenuItem {
  title = '';
  checked = false;
  callback: (() => void) | null = null;
  setTitle(title: string): this { this.title = title; return this; }
  setChecked(checked: boolean): this { this.checked = checked; return this; }
  setIcon(_icon: string): this { return this; }
  onClick(callback: () => void): this { this.callback = callback; return this; }
}

export class Menu {
  static last: Menu | null = null;
  readonly items: MenuItem[] = [];
  constructor() { Menu.last = this; }
  addItem(builder: (item: MenuItem) => void): this {
    const item = new MenuItem();
    builder(item);
    this.items.push(item);
    return this;
  }
  showAtMouseEvent(_event: MouseEvent): void {}
}

export function setIcon(target: HTMLElement, icon: string): void {
  target.dataset.icon = icon;
}
```

- [ ] **Step 2: Write failing shell tests**

Add this complete controller harness above the tests:

```ts
function readyView(selectTheme: (id: string) => void = () => undefined): WeChatWorkbenchView {
  const view = new WeChatWorkbenchView({} as never);
  view.setController({
    start: () => undefined,
    stop: () => undefined,
    rebuild: () => undefined,
    selectTheme,
    copyForWeChat: async () => undefined,
    copyHtmlSource: async () => undefined,
    preparePublish: async () => { throw new Error('not used'); },
    executePublish: async () => { throw new Error('not used'); },
    reconcilePublish: async () => { throw new Error('not used'); },
    repairLocalPublish: async () => { throw new Error('not used'); },
    prepareUnlinkAssociation: () => ({ path: 'article.md', basename: 'article', modifiedAt: 1 }),
    unlinkPublishAssociation: async () => undefined,
    coverPickerModel: () => ({ localOptions: [], aiEnabled: false, aiDisabledReason: 'not used' }),
    aiCoverDisclosure: () => { throw new Error('not used'); },
    prepareCover: async () => { throw new Error('not used'); },
    generateAiCover: async () => { throw new Error('not used'); },
    confirmCover: async () => undefined,
  });
  return view;
}
```

```ts
it('renders the WeSight-style shell without login or account internals', async () => {
  const openSettings = vi.fn();
  const view = new WeChatWorkbenchView({} as never, undefined, openSettings);
  await view.onOpen();
  expect([...view.contentEl.children].slice(0, 4).map(node => node.className)).toEqual([
    'wechat-workbench__brand-header',
    'wechat-workbench__tabs',
    'wechat-workbench__action-bar',
    'wechat-workbench__summary-row',
  ]);
  expect(view.contentEl.textContent).not.toContain('123456');
  expect(view.contentEl.textContent).not.toContain('登录');
  view.contentEl.querySelector<HTMLButtonElement>('[data-testid="account-settings"]')?.click();
  expect(openSettings).toHaveBeenCalledOnce();
});

it('keeps ordinary warnings behind the compact check button', async () => {
  const view = readyView();
  await view.onOpen();
  view.showArtifact(renderState);
  expect(view.contentEl.querySelector('[data-testid="preflight-status"]')?.textContent)
    .toBe('发布检查通过');
  expect(view.contentEl.textContent).not.toContain('Digest is empty.');
});

it('keeps the last stable preview visible while rebuilding', async () => {
  const view = readyView();
  await view.onOpen();
  view.showArtifact(renderState);
  view.showLoading('article.md');
  expect(view.contentEl.querySelector('.wechat-article h1')?.textContent).toBe('Article');
  expect(view.contentEl.querySelector('[data-testid="publish-state"]')?.textContent).toBe('正在排版');
});
```

Add the theme-menu test with the mock exported from `obsidian`:

```ts
it('opens a checked theme menu and forwards selection', async () => {
  // Add `import { Menu } from 'obsidian';` at the top of the test file.
  const selected: string[] = [];
  const view = readyView(id => selected.push(id));
  await view.onOpen();
  view.showArtifact(renderState);
  view.contentEl.querySelector<HTMLButtonElement>('[data-testid="theme-trigger"]')
    ?.dispatchEvent(new MouseEvent('click'));

  const option = Menu.last?.items.find(item => item.title === '原生简洁');
  expect(option?.checked).toBe(true);
  option?.callback?.();
  expect(selected).toEqual(['native']);
});
```

- [ ] **Step 3: Run the shell tests and verify RED**

Run: `npx vitest run tests/unit/ui/workbench-view.test.ts`

Expected: FAIL because the shell classes, account callback, theme trigger, compact status, and stable-loading behavior are absent.

- [ ] **Step 4: Rebuild the view around five stable regions**

Use this state and constructor contract:

```ts
private latestState: Readonly<WorkbenchRenderState> | null = null;
private previewTabActive = true;
private publishStateEl: HTMLElement | null = null;
private checkButton: HTMLButtonElement | null = null;

constructor(
  leaf: WorkspaceLeaf,
  previewAssets?: PreviewAssetResolver,
  private readonly openSettings: () => void = () => undefined,
) {
  super(leaf);
  this.previewRenderer = new ArticlePreviewRenderer(previewAssets);
}
```

`onOpen()` must append these direct children in order:

```ts
this.contentEl.append(
  this.buildBrandHeader(),
  this.buildTabs(),
  this.buildActionBar(),
  this.buildSummaryRow(),
  this.buildBody(),
);
```

Required labels and test IDs:

```ts
brand.textContent = 'WeChat Workbench';
previewTab.textContent = '公众号预览';
settingsTab.textContent = '发布设置';
publishButton.textContent = '发文章';
copyButton.textContent = '复制';
themeTrigger.dataset.testid = 'theme-trigger';
publishState.dataset.testid = 'publish-state';
checkButton.dataset.testid = 'preflight-status';
accountButton.dataset.testid = 'account-settings';
```

Use `setIcon(accountButton, 'circle-user-round')`, `setIcon(moreButton, 'ellipsis')`, and `setIcon(stateIcon, 'cloud-upload')`. Set the account button `aria-label` to the fixed user-facing text `管理本地公众号设置`; do not calculate or render any AppID suffix.

In `showArtifact`, set `latestState = state`, update the preview tab to `公众号预览（${state.snapshot.basename}）`, render the compact check presentation, refresh theme and publishing settings, then render the article. Bind the check button to `new PreflightDetailsModal(this.app, state.preflight).open()`. In `showLoading`, retain the current preview when `latestState` exists and set only the transient status to `正在排版` while disabling commit-sensitive actions.

Open themes with an Obsidian `Menu`:

```ts
private showThemeMenu(event: MouseEvent): void {
  const state = this.latestState;
  if (state === null) return;
  const menu = new Menu();
  for (const theme of state.themes) {
    menu.addItem(item => item
      .setTitle(theme.manifest.name)
      .setChecked(theme.manifest.id === state.selectedThemeId)
      .onClick(() => this.controller?.selectTheme(theme.manifest.id)));
  }
  menu.showAtMouseEvent(event);
}
```

The more menu exposes `复制 HTML 源码`、`重新检查`、`解除草稿关联`. The cover action appears only in publishing settings.

- [ ] **Step 5: Wire the account button without a login gate**

In `src/main.ts`, import `Notice`, remove the visible account-status callback, pass `openPluginSettings` as the third constructor argument, and use a guarded adapter:

```ts
interface SettingsNavigator {
  setting?: { open(): void; openTabById(id: string): void };
}

const openPluginSettings = (): void => {
  const settings = (this.app as typeof this.app & SettingsNavigator).setting;
  if (settings === undefined) {
    new Notice('请打开 Obsidian 设置 → WeChat Workbench 管理本地公众号账号。');
    return;
  }
  settings.open();
  settings.openTabById(this.manifest.id);
};
```

Do not inspect a login session and do not disable preview or copy when local credentials are absent.

- [ ] **Step 6: Run focused UI and integration tests**

Run: `npx vitest run tests/unit/ui/workbench-view.test.ts tests/integration/workbench.test.ts tests/integration/cover-ui.test.ts tests/integration/publish-ui.test.ts`

Expected: all focused tests PASS.

- [ ] **Step 7: Commit the shell rewrite**

```bash
git add src/ui/workbench-view.ts src/main.ts tests/mocks/obsidian.ts tests/unit/ui/workbench-view.test.ts
git commit -m "feat(ui): rebuild workbench in WeSight style"
```

## Task 4: Compact the publish confirmation

**Files:**
- Modify: `src/ui/publish-dialog.ts:1-85`
- Modify: `tests/unit/ui/publish-dialog.test.ts`

- [ ] **Step 1: Rewrite the dialog test around user-facing information**

```ts
it('shows a compact draft-only confirmation without hashes or network internals', () => {
  const model = buildPublishDialogModel(input);
  const modal = new PublishConfirmationModal({} as never, model, () => undefined);
  modal.open();

  expect(modal.titleEl.textContent).toBe('同步到公众号草稿箱');
  expect(modal.contentEl.textContent).toContain('Synthetic article');
  expect(modal.contentEl.textContent).toContain('2 张正文图片');
  expect(modal.contentEl.textContent).toContain('不会群发或公开发布');
  expect(modal.contentEl.textContent).not.toMatch(/CONTENT_HASH|THEME_HASH|COVER_HASH/u);
  expect(modal.contentEl.textContent).not.toMatch(/api\.weixin|mmbiz/u);
});
```

- [ ] **Step 2: Run the dialog test and verify RED**

Run: `npx vitest run tests/unit/ui/publish-dialog.test.ts`

Expected: FAIL because the current dialog exposes hashes, destinations, and the old title.

- [ ] **Step 3: Render only decision-relevant fields**

Keep model hashes and destinations available to transaction code, but do not render them. Replace `PublishConfirmationModal.onOpen()` rows with:

```ts
this.titleEl.textContent = '同步到公众号草稿箱';
const operation = this.model.action === 'CREATE'
  ? '创建新草稿'
  : this.model.action === 'UPDATE'
    ? '更新已关联草稿'
    : '内容无变化';
const rows: Array<[string, string]> = [
  ['操作', operation],
  ['标题', this.model.title],
  ['主题', this.model.theme.split('@')[0] ?? this.model.theme],
  ['正文图片', `${this.model.imageCount} 张正文图片`],
  ['封面', this.model.coverLabel],
];
```

Use the safety line `只会同步到公众号后台草稿箱，不会群发或公开发布。` and the primary button `确认同步`.

- [ ] **Step 4: Run dialog and publish workflow tests**

Run: `npx vitest run tests/unit/ui/publish-dialog.test.ts tests/unit/publish tests/integration/publish-ui.test.ts`

Expected: all tests PASS; ambiguous-create recovery actions remain unchanged.

- [ ] **Step 5: Commit the compact confirmation**

```bash
git add src/ui/publish-dialog.ts tests/unit/ui/publish-dialog.test.ts
git commit -m "feat(ui): simplify draft confirmation"
```

## Task 5: Replace the shell CSS and responsive contract

**Files:**
- Modify: `styles.css:1-255`
- Modify: `tests/visual/workbench-visual.test.ts`

- [ ] **Step 1: Write failing CSS contract assertions**

```ts
expect(css).toMatch(/wechat-workbench__brand-header[^}]*min-height:\s*56px/su);
expect(css).toMatch(/wechat-workbench__tabs[^}]*grid-template-columns:\s*1fr 1fr/su);
expect(css).toMatch(/wechat-workbench__tabs[^}]*--wechat-accent:\s*#07c160/su);
expect(css).toMatch(/wechat-workbench__action-bar[^}]*display:\s*grid/su);
expect(css).toMatch(/wechat-workbench__summary-row[^}]*justify-content:\s*space-between/su);
expect(css).toMatch(/wechat-workbench__preview-canvas[^}]*background:\s*var\(--background-secondary\)/su);
expect(css).toMatch(/wechat-workbench__preview-sheet[^}]*background:\s*#fff/su);
expect(css).toMatch(/@media\s*\(max-width:\s*420px\)/su);
expect(css).not.toMatch(/wechat-workbench__account-status/u);
```

- [ ] **Step 2: Run the visual contract and verify RED**

Run: `npx vitest run tests/visual/workbench-visual.test.ts`

Expected: FAIL because the approved shell selectors and responsive rules do not exist.

- [ ] **Step 3: Replace only the workbench shell CSS**

Implement original clean-room values:

```css
.wechat-workbench {
  --wechat-accent: #07c160;
  display: flex;
  flex-direction: column;
  min-width: 0;
  height: 100%;
  background: var(--background-primary);
}

.wechat-workbench__brand-header {
  display: flex;
  min-height: 56px;
  align-items: center;
  justify-content: space-between;
  padding: 0 18px;
  border-bottom: 1px solid var(--background-modifier-border);
}

.wechat-workbench__tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  --wechat-accent: #07c160;
  border-bottom: 1px solid var(--background-modifier-border);
}

.wechat-workbench__action-bar {
  display: grid;
  grid-template-columns: auto auto minmax(118px, 1fr) auto auto;
  gap: 10px;
  align-items: center;
  padding: 14px 12px;
  border-bottom: 1px solid var(--background-modifier-border);
}

.wechat-workbench__summary-row {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--background-modifier-border);
}

.wechat-workbench__preview-canvas {
  min-height: 100%;
  padding: 18px 12px 32px;
  background: var(--background-secondary);
}

.wechat-workbench__preview-sheet {
  box-sizing: border-box;
  width: 100%;
  max-width: 680px;
  min-height: 100%;
  margin: 0 auto;
  padding: clamp(24px, 5vw, 40px);
  background: #fff;
  color: #242424;
  border: 1px solid rgba(0, 0, 0, 0.08);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.06);
}

@media (max-width: 420px) {
  .wechat-workbench__action-bar {
    grid-template-columns: auto auto minmax(0, 1fr) auto;
  }
  .wechat-workbench__publish-state-label { display: none; }
  .wechat-workbench__theme-trigger-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
```

Style the active tab with green text and a 2px underline, the `发文章` button with the same green, secondary buttons as flat neutral controls, and account/more buttons as Obsidian `clickable-icon` controls. Remove `.wechat-workbench__account-status`, expanded `.wechat-workbench__preflight-list`, prominent warning card, and generic rounded-card toolbar rules. Preserve cover-modal, publish-report, article image, math, and placeholder styles below the shell section.

- [ ] **Step 4: Run visual and UI tests**

Run: `npx vitest run tests/visual/workbench-visual.test.ts tests/unit/ui/workbench-view.test.ts`

Expected: all tests PASS.

- [ ] **Step 5: Commit the style replacement**

```bash
git add styles.css tests/visual/workbench-visual.test.ts
git commit -m "style(ui): match WeSight workbench layout"
```

## Task 6: Regression verification and real Obsidian acceptance

**Files:**
- Create: `docs/verification/wesight-ui-redesign.md`
- Modify only files implicated by verified failures from Tasks 1–5.

- [ ] **Step 1: Run the full automated gate**

```bash
npm test
npm run lint
npm run typecheck
npm run build
npm audit --omit=dev
npm run scan:secrets
npm run verify:release
```

Expected: all test files pass; lint and TypeScript report zero errors; build produces `main.js`; audit reports zero production vulnerabilities; secret and release verifiers pass.

- [ ] **Step 2: Sync release files to the isolated Vault**

Run:

```bash
WECHAT_WORKBENCH_TEST_VAULT=$HOME/workspace/Github/wechat-workbench-test-vault npm run sync:test-vault
```

Expected: `manifest.json`, `main.js`, and `styles.css` update only under `$HOME/workspace/Github/wechat-workbench-test-vault/.obsidian/plugins/wechat-workbench/`.

- [ ] **Step 3: Validate the actual Obsidian UI at three widths**

In the isolated Vault, reload `WeChat Workbench`, open `Workbench rich smoke.md`, and verify:

1. Header shows only self-brand and the account/settings icon.
2. Tabs read `公众号预览（Workbench rich smoke）` and `发布设置`.
3. Toolbar order is `发文章`、`复制`、theme、short status、more.
4. Default UI does not show account suffixes, English warnings, hashes, task IDs, or media IDs.
5. The connection row shows the note on the left and compact check result on the right.
6. Theme switching updates the preview without clearing the previous canvas.
7. `发布设置` contains article, cover, and publishing-state sections.
8. At 520px, 640px, and 720px widths there is no horizontal overflow or hidden primary action.
9. The preview canvas uses a gray background and flat white article sheet matching the user-provided WeSight reference.

Do not operate in `$HOME/workspace/Github/commit_note`; the main Vault is out of scope for plugin development.

- [ ] **Step 4: Record evidence honestly**

Create `docs/verification/wesight-ui-redesign.md` with actual values using this final shape:

```md
# WeSight-style UI verification

- Commit: tested commit hash
- Obsidian: tested version
- Vault: isolated test Vault path

## Automated gates

| Gate | Result | Evidence |
| --- | --- | --- |
| Tests | observed result | exact command and summary |
| Lint/typecheck/build | observed result | exact command and summary |
| Audit/secrets/release | observed result | exact command and summary |

## Desktop UI

| Width | Result | Observation |
| --- | --- | --- |
| 520px | observed result | observed behavior |
| 640px | observed result | observed behavior |
| 720px | observed result | observed behavior |

## Remaining gaps

List only unverified or failing behavior. Do not convert environment blockers into PASS.
```

Do not commit literal phrases such as `tested commit hash` or `observed result`; replace them with the actual evidence from Steps 1–3.

- [ ] **Step 5: Run the final safety and status checks**

```bash
npm run scan:secrets
git diff --check
git status --short
```

Expected: secret scan passes, no whitespace errors, and only intended verification evidence remains uncommitted.

- [ ] **Step 6: Commit verification evidence**

```bash
git add docs/verification/wesight-ui-redesign.md
git commit -m "test(ui): verify WeSight-style workbench"
```

## Final acceptance gate

Implementation is complete only when:

- Tasks 1–6 are committed.
- The full automated gate passes.
- Isolated-Vault screenshots prove the approved hierarchy and information boundaries.
- The default workbench contains no expanded warning list, account suffix, login UI, technical hashes, or direct cover button.
- Existing copy, source copy, theme, cover, publish, recovery, and unlink tests remain green.
- AppSecret, Access Token, and image API keys continue to use Obsidian `SecretStorage`; the UI rewrite adds no alternate credential persistence.
- Any unverified real WeChat API behavior remains explicitly marked unverified; this UI redesign does not silently claim live draft acceptance.
