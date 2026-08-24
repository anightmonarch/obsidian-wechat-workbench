# AI Candidate Adoption and Layout Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adopted title or digest candidates immediately disappear, and article-information content cannot create horizontal overflow.

**Architecture:** Keep candidate state inside `ArticleSettingsForm`. Candidate-click handlers will update the relevant field, clear only that field's candidate state, re-render that candidate container, then reuse the existing debounced `input` path. CSS changes stay scoped to the publish-settings form and preserve all content by allowing controls and candidate text to shrink or wrap.

**Tech Stack:** TypeScript, Obsidian DOM helpers, Vitest/JSDOM, scoped CSS.

## Global Constraints

- Preserve the existing explicit candidate-adoption model; generation must never overwrite a user field automatically.
- Preserve 500 ms debounced autosave and focus stability.
- Do not truncate title, digest, or candidate text to hide overflow.
- Validate the newest built plugin in `$HOME/workspace/Github/wechat-workbench-test-vault` after reload/restart of Obsidian.

---

### Task 1: Clear candidates after adoption

**Files:**
- Modify: `tests/unit/ui/workbench-publish-settings.test.ts`
- Modify: `src/ui/article-settings-form.ts`

**Interfaces:**
- Consumes: `ArticleSettingsForm.generateTitles()`, `ArticleSettingsForm.generateDigest()` and candidate button click handlers.
- Produces: candidate containers with no candidate buttons or regenerate button after a user adopts a value.

- [x] **Step 1: Write the failing test**

```ts
host.querySelector<HTMLButtonElement>('[data-title-candidate="标题二"]')?.click();
expect(host.querySelector<HTMLInputElement>('[data-testid="settings-title"]')?.value).toBe('标题二');
expect(host.querySelector('[data-testid="settings-title-candidates"]')?.textContent).toBe('');
```

Add the analogous digest assertion after selecting `[data-digest-candidate]`.

- [x] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- --run tests/unit/ui/workbench-publish-settings.test.ts`

Expected: FAIL because the selected candidate remains rendered.

- [x] **Step 3: Write the minimal implementation**

```ts
private adoptTitle(value: string): void {
  this.title.value = value;
  this.titleOptions = Object.freeze([]);
  this.renderTitleCandidates();
  this.title.dispatchEvent(new Event('input', { bubbles: true }));
}
```

Use the same sequence for `digestOption`: update field, set it to `null`, re-render only its candidate container, then dispatch the existing input event.

- [x] **Step 4: Run the focused test and verify it passes**

Run: `npm test -- --run tests/unit/ui/workbench-publish-settings.test.ts`

Expected: PASS; candidate replacement plus regeneration before adoption remain covered.

### Task 2: Prevent horizontal overflow in the article-information form

**Files:**
- Modify: `tests/unit/ui/workbench-publish-settings.test.ts`
- Modify: `styles.css`

**Interfaces:**
- Consumes: `.wechat-workbench__publish-settings`, `.wechat-workbench__settings-section`, `.wechat-workbench__setting-field`, and `.wechat-workbench__ai-candidates`.
- Produces: shrinkable controls and wrapping candidate text within the current workbench panel width.

- [x] **Step 1: Write the failing CSS contract test**

```ts
expect(styles).toContain('.wechat-workbench__setting-field {\n  min-width: 0;');
expect(styles).toContain('.wechat-workbench__setting-field input,\n.wechat-workbench__setting-field textarea {\n  box-sizing: border-box;\n  min-width: 0;\n  max-width: 100%;');
```

- [x] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- --run tests/unit/ui/workbench-publish-settings.test.ts`

Expected: FAIL because current CSS lacks the required shrink constraints.

- [x] **Step 3: Write the minimal scoped CSS**

```css
.wechat-workbench__setting-field { min-width: 0; max-width: 100%; }
.wechat-workbench__setting-field input,
.wechat-workbench__setting-field textarea {
  box-sizing: border-box;
  min-width: 0;
  max-width: 100%;
}
.wechat-workbench__ai-candidates { min-width: 0; max-width: 100%; }
```

Keep candidate buttons wrapping with `overflow-wrap: anywhere`; do not apply `overflow: hidden` to content.

- [x] **Step 4: Run focused tests and verify they pass**

Run: `npm test -- --run tests/unit/ui/workbench-publish-settings.test.ts`

Expected: PASS.

### Task 3: Full verification and runtime acceptance

**Files:**
- Modify: `docs/verification/full-e2e-acceptance.md`

- [x] **Step 1: Run quality gates**

Run: `npm test && npm run lint && npm run verify:release && npm run scan:secrets && git diff --check`

Expected: all tests and release/security checks pass; lint has no errors.

- [x] **Step 2: Build and reload the actual test runtime**

Run: `WECHAT_WORKBENCH_TEST_VAULT=$HOME/workspace/Github/wechat-workbench-test-vault npm run sync:test-vault`

Restart Obsidian, open `Workbench copy smoke`, and verify the loaded Vault identifies `wechat-workbench-test-vault`.

- [x] **Step 3: Verify real UI**

Generate title and digest candidates, adopt each, and verify the corresponding candidate container closes immediately without focus loss. Enter a long unbroken title/digest and verify the workbench has no horizontal scrollbar or panel-width growth.

- [x] **Step 4: Record evidence and commit**

Update `docs/verification/full-e2e-acceptance.md`, run a final sensitive-information scan, then commit only the focused source, test, CSS, plan, and verification files.
