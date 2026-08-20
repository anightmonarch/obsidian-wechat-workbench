# Preview And Theme Labels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify the preview tab label and show the four built-in theme names in Chinese without changing theme IDs or custom-theme names.

**Architecture:** Keep display names in the existing built-in theme manifests so every UI consumer receives the same Chinese label. Keep the preview tab static in `WeChatWorkbenchView` and remove the active-note basename update.

**Tech Stack:** TypeScript, Obsidian ItemView/Menu API, Vitest, jsdom.

## Global Constraints

- Preview tab text is exactly `文章预览` and never includes the note name.
- Built-in IDs remain `editorial`, `native`, `technical`, and `verdant`.
- Built-in display names are `编辑精选`, `原生简约`, `技术文档`, and `苍绿`.
- Custom theme names are unchanged.

---

### Task 1: Localized labels

**Files:**
- Modify: `src/ui/workbench-view.ts`
- Modify: `src/themes/builtin/editorial.ts`
- Modify: `src/themes/builtin/native.ts`
- Modify: `src/themes/builtin/technical.ts`
- Modify: `src/themes/builtin/verdant.ts`
- Test: `tests/unit/ui/workbench-view.test.ts`
- Test: `tests/unit/themes/theme-registry.test.ts`

**Interfaces:**
- Consumes: `ThemeManifest.name` and the existing workbench tab/theme-menu rendering.
- Produces: stable Chinese labels while retaining existing theme IDs and selection behavior.

- [ ] **Step 1: Write failing UI and registry expectations**

Assert that the rendered preview tab is exactly `文章预览`, excludes the note basename, and the built-in registry returns the four approved Chinese names for the unchanged IDs.

- [ ] **Step 2: Run focused tests and verify the expected failures**

Run: `npm test -- --run tests/unit/ui/workbench-view.test.ts tests/unit/themes/theme-registry.test.ts`

Expected: failures showing the old `公众号预览（...）` tab and English built-in names.

- [ ] **Step 3: Implement minimal label changes**

Set the static preview label in `WeChatWorkbenchView`, remove the basename interpolation, and replace only the four built-in manifest `name` values.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- --run tests/unit/ui/workbench-view.test.ts tests/unit/themes/theme-registry.test.ts`

Expected: both files pass.

- [ ] **Step 5: Build, sync and verify in Obsidian**

Run `npm run build`, sync three runtime files to the isolated Vault, reload Obsidian 1.13.7, and verify `文章预览`, the four Chinese menu items, and Chinese current-theme text.

- [ ] **Step 6: Run repository gates and commit**

Run the full test suite, lint, release verification, production audit, sensitive-information scan and `git diff --check`, then include this task in the existing local feature commit without pushing.
