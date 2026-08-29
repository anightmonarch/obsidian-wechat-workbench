# AI UI and Release Consistency Hotfix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair AI configuration feedback, title response compatibility, multiline candidate layout, style-panel opening state, and ship one immutable `0.1.1` artifact set.

**Architecture:** Keep provider parsing in `OpenAiTextGenerator`, presentation state in the publish-settings components, and release identity in manifest/version files. Every behavior change starts with one focused failing test, then a minimal implementation and a module-scoped commit. Real API and UI checks run only in the isolated test Vault.

**Tech Stack:** TypeScript 5.8, Vitest/jsdom, Obsidian 1.13.x desktop, esbuild, GitHub Releases.

---

### Task 1: Configuration feedback and candidate layout

**Files:**
- Modify: `src/ui/workbench-publish-settings.ts`
- Modify: `src/ui/workbench-view.ts`
- Modify: `styles.css`
- Test: `tests/unit/ui/workbench-publish-settings.test.ts`
- Test: `tests/visual/workbench-visual.test.ts`

- [ ] Add a failing UI test that passes `coverAiDisabledReason`, clicks `settings-cover-ai`, expects no generation callback, and expects `图片服务未配置完整，请到插件设置检查` inside `settings-cover-ai-status`.
- [ ] Add a failing visual test requiring `height: auto`, normal wrapping, visible overflow and content-driven candidate height.
- [ ] Run the two focused test files and verify the new assertions fail for the missing behavior.
- [ ] Pass the controller's `coverPickerModel().aiDisabledReason` through the view and render a safe inline cover status only after the invalid action.
- [ ] Add the minimal candidate CSS without fixed heights or internal scrolling.
- [ ] Run the focused tests, typecheck, lint and secret scan.
- [ ] Commit as `fix(ui): show ai configuration and multiline candidates`.

### Task 2: Provider-compatible title parsing

**Files:**
- Modify: `src/ai/openai-text-generator.ts`
- Test: `tests/unit/ai/openai-text-generator.test.ts`
- Modify: `docs/superpowers/specs/2026-08-23-ai-content-generation-design.md`

- [ ] Add failing tests for a three-string JSON array, three plain lines and a numbered three-line list.
- [ ] Add rejecting tests for prose plus titles, two/four items, empty items and duplicates.
- [ ] Run the focused test and verify the accepted-format cases fail with `AI_TEXT_PROVIDER_OUTPUT_INVALID`.
- [ ] Implement a bounded title parser that normalizes only the four approved formats, then reuse the existing cleaning/count/deduplication rules.
- [ ] Update the existing AI design's strict-title paragraph to reference the approved compatibility formats without weakening the three-title contract.
- [ ] Run the focused test, typecheck, lint and secret scan.
- [ ] Commit as `fix(ai): accept bounded title response formats`.

### Task 3: Style panel opening state

**Files:**
- Modify: `src/ui/style-workbench.ts`
- Test: `tests/unit/ui/style-workbench.test.ts`

- [ ] Add a failing test that simulates a stale body scroll position, destroys the panel, reopens it, and expects the new panel body to start at `scrollTop = 0` while ordinary `update()` preserves scroll.
- [ ] Set scroll position only when a new style panel root/body is created; do not modify `update()`.
- [ ] Run the focused test, typecheck, lint and secret scan.
- [ ] Commit as `fix(style): open the style panel at the top`.

### Task 4: Isolated runtime acceptance

**Files:**
- Modify: `docs/verification/ai-ui-release-hotfix-2026-08-29.md`

- [ ] Run `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run verify:release`, `npm audit --omit=dev`, and `npm run scan:secrets`.
- [ ] Run `npm run sync:test-vault`, reload `/Users/wangboshi/workspace/Github/wechat-workbench-test-vault`, and prove the loaded `main.js`/`styles.css` hashes equal the repository build.
- [ ] Verify: missing image Key produces inline cover feedback; three title candidates render; 120-character digest remains inside its background; each fresh style-panel opening begins with themes/fonts/sizes; the current configured image model returns either a preview or a specific safe failure reason.
- [ ] Record pass/fail/block evidence without secrets or raw provider output.
- [ ] Commit as `docs(verification): record ai ui hotfix acceptance`.

### Task 5: Adversarial review and release 0.1.1

**Files:**
- Modify: `manifest.json`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `versions.json`
- Modify: `docs/verification/release-candidate.md`

- [ ] Run an adversarial review for response-parser ambiguity, DOM overflow, stale build identity, credential leakage and release asset mismatch; fix confirmed blockers with their own failing tests and commits.
- [ ] Bump all version contracts to `0.1.1` and add `"0.1.1": "1.11.4"` to `versions.json`.
- [ ] Re-run every release gate and compute SHA-256 for `main.js`, `manifest.json`, and `styles.css`.
- [ ] Commit as `chore(release): prepare 0.1.1` after the required sensitive-information scan.
- [ ] Push `main`, create and push exact tag `0.1.1`, publish a non-draft/non-prerelease GitHub Release with the three verified assets, and download them again to prove the hashes match.
- [ ] Check `obsidianmd/obsidian-releases/community-plugins.json`; report directory/update availability separately from GitHub Release success.
