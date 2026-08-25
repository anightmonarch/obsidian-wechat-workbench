# Settings UI Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep account and AI configuration changes local to the plugin settings page while presenting the complete WeChat account flow in one compact card.

**Architecture:** Settings persistence remains the only side effect of account and AI actions. The settings tab receives a non-rendering settings access port; it must not reload themes or request a Workbench rebuild. The account guidance, fields, actions, and status share one card container; AI field labels remain, but repeated helper copy is removed.

**Tech Stack:** TypeScript, Obsidian `PluginSettingTab`/`Setting`, Vitest, scoped plugin CSS.

## Global Constraints

- Do not read, log, move, or rewrite AppSecret or API Key values.
- Preserve account save, verification, disconnect, SecretStorage, and IP-whitelist behaviour.
- Account and AI settings actions must not trigger `WorkbenchController.rebuild()` or replace a ready workbench with `正在排版…`.
- Keep all controls keyboard-accessible and retain visible input labels.
- Build, synchronize, reload the isolated test Vault, and verify the real Obsidian UI before completion.

---

### Task 1: Isolate non-rendering settings persistence

**Files:**
- Modify: `src/main.ts:101-114`
- Create: `src/settings/non-rendering-settings-access.ts`
- Test: `tests/unit/settings/non-rendering-settings-access.test.ts`

**Interfaces:**
- Consumes: `SettingsAccess` with `get(): Readonly<PluginSettings>` and `update(patch): Promise<Readonly<PluginSettings>>`.
- Produces: `createNonRenderingSettingsAccess(get, update)` and account/AI settings services that persist through `updateSettings` without any workbench-refresh dependency.

- [x] **Step 1: Write the failing regression test**

Add a test that creates the settings access boundary from a getter and an update spy, persists an account or AI patch, and verifies the boundary invokes only the supplied persistence function.

```ts
const update = vi.fn(async patch => ({ ...DEFAULT_SETTINGS, ...patch }));
const access = createNonRenderingSettingsAccess(() => DEFAULT_SETTINGS, update);
await access.update({ accountDisplayName: 'Commit 日记' });
expect(update).toHaveBeenCalledWith({ accountDisplayName: 'Commit 日记' });
```

- [x] **Step 2: Run the focused test and verify it fails**

Run: `npx vitest run tests/unit/settings/non-rendering-settings-access.test.ts`

Expected: failure because `createNonRenderingSettingsAccess` does not exist.

- [x] **Step 3: Implement the minimal boundary change**

Create a two-method `SettingsAccess` adapter that only reads from `this.pluginSettings` and forwards patches to serialized `updateSettings`. Replace the settings-tab adapter with it, then remove the unconditional theme reload and workbench rebuild loop.

```ts
export function createNonRenderingSettingsAccess(
  get: () => Readonly<PluginSettings>,
  update: (patch: Partial<PluginSettings>) => Promise<Readonly<PluginSettings>>,
): SettingsAccess {
  return Object.freeze({ get, update });
}
```

- [x] **Step 4: Run the focused test and verify it passes**

Run: `npx vitest run tests/unit/settings/non-rendering-settings-access.test.ts`

Expected: PASS; the settings-tab dependency has no API capable of requesting a workbench rebuild.

### Task 2: Group account controls and remove redundant AI field copy

**Files:**
- Modify: `src/settings/settings-tab.ts:131-256`
- Modify: `styles.css`
- Test: `tests/unit/settings/settings-tab.test.ts`

**Interfaces:**
- Consumes: existing account input and action test IDs, `AccountConnectionService.snapshot()`, and `AiServiceSettingsService`.
- Produces: one `.wechat-workbench-settings__account-card` containing guidance, all three account fields, actions, and status; AI settings retain labels with no field descriptions.

- [x] **Step 1: Write the failing DOM tests**

Assert all account test IDs are descendants of one account card, status is in the same card, and endpoint/key/model descriptions do not occur.

```ts
expect(container.querySelector('[data-testid="account-card"] [data-testid="account-save"]')).not.toBeNull();
expect(container.querySelector('[data-testid="account-card"] [data-testid="account-status"]')).not.toBeNull();
expect(container.textContent).not.toContain('请填写包含接口路径的完整 HTTPS 地址。');
```

- [x] **Step 2: Run the focused test and verify it fails**

Run: `npx vitest run tests/unit/settings/settings-tab.test.ts`

Expected: failure because account controls are siblings and AI descriptions remain.

- [x] **Step 3: Implement the compact layout**

Create the account card before guidance, append guidance, the three `Setting` rows, actions, and status into it. Use `gap: 8px` and `flex-wrap: wrap` for action buttons. Keep the outer card as the sole account grouping border; status uses an internal top separator rather than another floating card. Remove `setDesc()` only from AI Endpoint URL, API Key, and model-name rows.

- [x] **Step 4: Run focused tests and verify they pass**

Run: `npx vitest run tests/unit/settings/settings-tab.test.ts tests/unit/settings/non-rendering-settings-access.test.ts`

Expected: PASS; existing save/verify/disconnect and AI-save tests remain green.

### Task 3: Verify running artifact and UI path

**Files:**
- Modify: `docs/verification/full-e2e-acceptance.md`

- [x] **Step 1: Run repository gates**

Run: `npm test && npm run lint && npm run build && npm run verify:release && npm run scan:secrets`

Expected: all commands exit 0; record pre-existing warnings accurately if any.

- [x] **Step 2: Synchronize the isolated Vault and verify asset parity**

Run: `WECHAT_WORKBENCH_TEST_VAULT=$HOME/workspace/Github/wechat-workbench-test-vault npm run sync:test-vault`

Then compare repository and Vault `main.js` with `cmp -s` and restart/reload Obsidian.

- [ ] **Step 3: Perform real UI verification**

With a ready article preview open, click `保存账号配置`, `重新验证`, and `断开连接` one at a time. Verify the preview and publish-settings DOM stay visible, no `正在排版…` placeholder appears, buttons show visible separation, the account block has one outer frame, and redundant AI field copy is absent.

- [x] **Step 4: Update acceptance evidence**

Record the exact build/Vault hash and the three-action UI result. Mark only observed behaviour as PASS.

### Task 4: Surface account-verification failures and align settings controls

**Files:**
- Modify: `src/settings/settings-tab.ts:89-334`
- Modify: `styles.css:361-460`
- Test: `tests/unit/settings/settings-tab.test.ts`
- Test: `tests/visual/workbench-visual.test.ts`

**Interfaces:**
- Consumes: `AccountConnectionService.verify(): Promise<AccountConnectionSnapshot>` and its `PublicError` failures.
- Produces: immediate `验证中…` feedback, a safe inline failure message, zero left inset for section/card headings, and AI setting inputs that consume the available card width.

- [x] **Step 1: Write failing tests**

Cover a rejected `WECHAT_ACCOUNT_NOT_CONFIGURED` verification: the setting page must re-enable its actions and show `请先填写并保存 AppSecret，再验证连接。`. Add visual assertions for the zero-inset headings and wide AI controls.

```ts
connection.verify.mockRejectedValue(new PublicError({
  code: 'WECHAT_ACCOUNT_NOT_CONFIGURED', stage: 'TOKEN', errcode: null,
  errmsg: '微信公众号账号尚未配置完整。', rid: null,
  remoteEffect: 'NONE', retryable: false, nextAction: '配置账号',
}));
button(host, 'account-verify').click();
await vi.waitFor(() => expect(host.textContent).toContain('请先填写并保存 AppSecret，再验证连接。'));
expect(button(host, 'account-verify').disabled).toBe(false);
```

- [x] **Step 2: Run focused tests and verify failure**

Run: `npx vitest run tests/unit/settings/settings-tab.test.ts tests/visual/workbench-visual.test.ts`

Expected: failure because verify rejection is unhandled and heading/input CSS does not declare the requested layout.

- [x] **Step 3: Implement minimal behaviour and layout changes**

During verification, set the button text to `验证中…`, disable account actions, and replace the status contents with `连接状态：验证中…`. Catch only safe `PublicError` data; show the specific missing-secret action or a generic `验证失败，请检查网络或公众号配置后重试。`, then restore actions. Add a `.wechat-workbench-settings__section-title` class with zero left margin/padding. Keep AI card headings left-aligned to their card padding. Do not add AI-row layout or input-width overrides: the cards must use the same Obsidian-native setting rows as the public-account fields; only the two service cards collapse to one column below 900px.

- [x] **Step 4: Run focused tests and verify pass**

Run: `npx vitest run tests/unit/settings/settings-tab.test.ts tests/visual/workbench-visual.test.ts`

Expected: PASS; no raw error, no unresponsive verification state, and the layout contract holds.

### Task 5: Simplify cover-source actions and generation consent

**Files:**
- Modify: `src/ui/workbench-publish-settings.ts`, `src/ui/ai-cover-confirmation.ts`, `src/ui/workbench-view.ts`
- Modify: `src/ui/workbench-controller.ts`, `src/cover/cover-workflow.ts`, `src/cover/openai-image-generator.ts`, `styles.css`
- Test: `tests/unit/ui/ai-cover-confirmation.test.ts`, `tests/unit/ui/workbench-publish-settings.test.ts`, `tests/unit/cover/cover-workflow.test.ts`

- [x] Remove the explanatory copy beside the current-cover preview and replace the single source chooser with the horizontal `文章首图`、`本地上传`、`智能生成` buttons. The first two actions now directly adopt the first article image or selected local file; no article image clears the explicit cover and shows a friendly empty state.
- [x] Make `智能生成` open the consent modal directly, then generate and adopt the result without reopening the intermediate source picker. Remove service, article-content, and cost-warning text from that modal while retaining the optional supplemental-requirements textarea.
- [x] Add checked-by-default title and digest checkboxes. Pass the selected values through the controller and cover workflow so unchecked content is omitted from the image-generation prompt.
- [x] Cover the controls and content omission with focused tests, then run the full repository gates and sync the isolated Vault.
