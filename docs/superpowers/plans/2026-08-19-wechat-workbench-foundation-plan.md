# WeChat Workbench Foundation and Local Development Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立符合 Obsidian 官方规范的插件骨架、设置与 SecretStorage 边界，并在独立测试 Vault 中完成无需社区审核的本地加载验证。

**Architecture:** 主插件只负责生命周期和依赖装配；设置模型、非敏感持久化、凭据存储和 UI 视图分离。构建产物通过显式脚本同步到用户提供的隔离测试 Vault，不把测试 Vault 或凭据写进仓库。

**Tech Stack:** Node.js 22、npm、TypeScript 5.8.3、Obsidian API 1.13.1、esbuild 0.25.5、Vitest 4.1.11、jsdom 30.0.1、ESLint 9.39.4。

## Global Constraints

- 插件 ID `wechat-workbench`，显示名 `WeChat Workbench`，最低 Obsidian `1.11.4`，仅桌面端。
- 只允许单账号 UI；AppSecret、Access Token、图片 API Key 只进入 `app.secretStorage`。
- 本阶段不加入 Markdown 渲染、微信网络调用、封面生成或发布逻辑。
- 测试 Vault 路径只能来自进程环境变量 `WECHAT_WORKBENCH_TEST_VAULT`，不得提交到仓库。
- 本地加载只同步 `manifest.json`、`main.js`、`styles.css`。
- 不在 `commit_note` 主 Vault 中加载插件。

---

## File Map

```text
manifest.json                         插件身份与兼容范围
versions.json                         插件版本到最低 Obsidian 版本映射
package.json                          构建和验证命令
tsconfig.json                         严格 TypeScript 规则
eslint.config.mjs                     官方 Obsidian lint 基线
esbuild.config.mjs                    main.js 构建与 watch
vitest.config.ts                      Node/jsdom 测试配置
styles.css                            插件外壳样式入口
src/main.ts                           插件生命周期与依赖装配
src/settings/model.ts                 非敏感设置类型和默认值
src/settings/settings-store.ts        data.json 读写与迁移
src/settings/secret-store.ts          SecretStorage 唯一访问入口
src/settings/settings-tab.ts          Obsidian 全局设置页
src/ui/workbench-view.ts              空工作台 ItemView
src/ui/open-workbench.ts              右侧视图复用与揭示
scripts/sync-test-vault.mjs            构建产物同步
scripts/verify-release.mjs             发布资产静态校验
scripts/scan-secrets.mjs               仓库敏感信息扫描
tests/unit/settings/*.test.ts          设置和凭据单元测试
tests/unit/ui/*.test.ts                视图打开策略测试
tests/integration/local-assets.test.ts 构建产物测试
tests/mocks/obsidian.ts                Node 测试用最小 Obsidian API
README.md                              当前阶段用途与本地开发入口
```

## Execution Bootstrap

Before Task 1, initialize version control with the already approved rules, design, and plans only:

```bash
rg -n -i '(BEGIN (RSA|OPENSSH|EC) PRIVATE KEY|authorization: *bearer|appsecret *=|access[_ -]?token *=|api[_ -]?key *=)' AGENTS.md docs
git init -b main
git add AGENTS.md docs
git commit -m "docs: define wechat workbench design"
git switch -c codex/foundation
```

Expected: the scan finds only explanatory field names, no credential-like values. Do not add a remote or push.

### Task 1: Official Plugin Skeleton and Test Harness

**Files:**
- Create: `package.json`
- Create: `package-lock.json`
- Create: `manifest.json`
- Create: `versions.json`
- Create: `tsconfig.json`
- Create: `eslint.config.mjs`
- Create: `esbuild.config.mjs`
- Create: `vitest.config.ts`
- Create: `styles.css`
- Create: `src/main.ts`
- Create: `tests/unit/manifest.test.ts`
- Create: `tests/mocks/obsidian.ts`

**Interfaces:**
- Produces: package scripts `dev`, `test`, `lint`, `typecheck`, `build`, `verify:release`, `scan:secrets`, `sync:test-vault`.
- Produces: `WeChatWorkbenchPlugin extends Plugin` as the root lifecycle class.

- [ ] **Step 1: Create build configuration and a failing manifest contract test**

Create `package.json` with exact baseline dependencies:

```json
{
  "name": "obsidian-wechat-workbench",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "main.js",
  "engines": { "node": ">=22" },
  "scripts": {
    "dev": "node esbuild.config.mjs",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "build": "npm run typecheck && node esbuild.config.mjs production",
    "verify:release": "node scripts/verify-release.mjs",
    "scan:secrets": "node scripts/scan-secrets.mjs",
    "sync:test-vault": "node scripts/sync-test-vault.mjs"
  },
  "license": "MIT",
  "devDependencies": {
    "@eslint/js": "9.39.4",
    "@types/node": "22.15.17",
    "esbuild": "0.25.5",
    "eslint": "9.39.4",
    "eslint-plugin-obsidianmd": "0.4.1",
    "globals": "17.6.0",
    "jsdom": "30.0.1",
    "obsidian": "1.13.1",
    "typescript": "5.8.3",
    "typescript-eslint": "8.59.1",
    "vitest": "4.1.11"
  }
}
```

Create `tests/unit/manifest.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('manifest', () => {
  it('uses the approved public identity and compatibility floor', () => {
    const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
    expect(manifest).toMatchObject({
      id: 'wechat-workbench',
      name: 'WeChat Workbench',
      minAppVersion: '1.11.4',
      isDesktopOnly: true,
    });
    expect(manifest.id).not.toContain('obsidian');
  });
});
```

Configure `vitest.config.ts` with `environment: 'jsdom'`, `clearMocks: true`, and an alias from `obsidian` to `tests/mocks/obsidian.ts`. The mock exports minimal `Plugin`, `ItemView`, `PluginSettingTab`, `Notice` and constructor-free interfaces used by tests; every unimplemented method throws so tests cannot pass by silent no-op.

- [ ] **Step 2: Install local dependencies and verify the test fails for the missing manifest**

Run:

```bash
npm install
npm test -- tests/unit/manifest.test.ts
```

Expected: FAIL with `ENOENT: no such file or directory, open 'manifest.json'`.

- [ ] **Step 3: Add the minimal official-compatible plugin files**

Create `manifest.json`:

```json
{
  "id": "wechat-workbench",
  "name": "WeChat Workbench",
  "version": "0.1.0",
  "minAppVersion": "1.11.4",
  "description": "A verifiable publishing workbench for WeChat Official Account drafts.",
  "author": "anightmonarch",
  "isDesktopOnly": true
}
```

Create `versions.json` as `{ "0.1.0": "1.11.4" }`. Copy the strict compiler and esbuild external-module settings from the current official sample plugin, changing only the entry point to `src/main.ts`. Create `src/main.ts`:

```ts
import { Plugin } from 'obsidian';

export default class WeChatWorkbenchPlugin extends Plugin {
  override async onload(): Promise<void> {
    // Lifecycle wiring is added in later tasks.
  }
}
```

The comment describes the current empty lifecycle and is removed when Task 3 wires the view.

- [ ] **Step 4: Run the complete scaffold checks**

Run:

```bash
npm test -- tests/unit/manifest.test.ts
npm run lint
npm run typecheck
npm run build
```

Expected: manifest test PASS; lint/typecheck/build exit 0; root `main.js` exists.

- [ ] **Step 5: Scan and commit the scaffold**

Before the scanner exists, run:

```bash
rg -n -i '(appid|appsecret|access[_ -]?token|api[_ -]?key|authorization:|bearer )' . --glob '!package-lock.json' --glob '!docs/**'
```

Expected: only approved identifiers in tests or source, no credential-like values. Then commit on `codex/foundation`:

```bash
git add package.json package-lock.json manifest.json versions.json tsconfig.json eslint.config.mjs esbuild.config.mjs vitest.config.ts styles.css src/main.ts tests/unit/manifest.test.ts tests/mocks/obsidian.ts
git commit -m "chore: scaffold wechat workbench plugin"
```

### Task 2: Settings Model and SecretStorage Boundary

**Files:**
- Create: `src/settings/model.ts`
- Create: `src/settings/settings-store.ts`
- Create: `src/settings/secret-store.ts`
- Create: `tests/unit/settings/settings-store.test.ts`
- Create: `tests/unit/settings/secret-store.test.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Produces: `PluginSettings`, `DEFAULT_SETTINGS`, `SettingsStore.load()`, `SettingsStore.save(next)`.
- Produces: `SecretStore.set(kind, value)`, `get(kind)`, `clear(kind)`, `status()`.
- Secret IDs: `wechat-workbench-app-secret`, `wechat-workbench-access-token`, `wechat-workbench-image-api-key`.

- [ ] **Step 1: Write failing settings and secret boundary tests**

Create tests with an in-memory adapter:

```ts
it('never serializes secret fields into plugin data', async () => {
  const adapter = new MemoryPluginData();
  const store = new SettingsStore(adapter);
  await store.save({ ...DEFAULT_SETTINGS, appId: 'wx-public-id' });
  expect(adapter.saved).toEqual(expect.objectContaining({ appId: 'wx-public-id' }));
  expect(JSON.stringify(adapter.saved)).not.toMatch(/appSecret|accessToken|apiKey/i);
});

it('uses fixed lowercase SecretStorage ids', () => {
  const storage = new MemorySecretStorage();
  const secrets = new SecretStore(storage);
  secrets.set('appSecret', 'secret-value');
  expect(storage.values.get('wechat-workbench-app-secret')).toBe('secret-value');
});
```

- [ ] **Step 2: Run tests and verify missing types fail**

Run:

```bash
npm test -- tests/unit/settings
```

Expected: FAIL because `SettingsStore` and `SecretStore` do not exist.

- [ ] **Step 3: Implement exact non-secret settings and secret wrappers**

Define:

```ts
export interface PluginSettings {
  schemaVersion: 1;
  appId: string;
  defaultThemeId: string;
  customThemeDirectory: string;
  defaultAuthor: string;
  defaultSourceUrl: string;
  defaultCoverStrategy: 'article' | 'first-image' | 'global-default';
  imageApiBaseUrl: string;
  imageApiModel: string;
  accessTokenExpiresAt: number | null;
  accountHash: string | null;
}
```

`SettingsStore.load()` must merge stored known fields onto `DEFAULT_SETTINGS`, reject non-object data, migrate only through explicit schema functions, and never accept secret-shaped keys. `SecretStore` receives only `{ setSecret, getSecret }` rather than the whole `App` so tests cannot accidentally access unrelated state. Clearing a secret calls `setSecret(id, '')` because Obsidian 1.11.4 exposes no delete method.

- [ ] **Step 4: Run focused and global checks**

Run:

```bash
npm test -- tests/unit/settings
npm run typecheck
npm run lint
```

Expected: all PASS.

- [ ] **Step 5: Scan and commit settings storage**

Run the temporary `rg` scan from Task 1. Confirm test values are synthetic, then:

```bash
git add src/settings src/main.ts tests/unit/settings
git commit -m "feat: add local settings and secret storage"
```

### Task 3: Empty Workbench View and Global Settings Tab

**Files:**
- Create: `src/ui/workbench-view.ts`
- Create: `src/ui/open-workbench.ts`
- Create: `src/settings/settings-tab.ts`
- Create: `tests/unit/ui/open-workbench.test.ts`
- Create: `tests/unit/settings/settings-tab.test.ts`
- Modify: `src/main.ts`
- Modify: `styles.css`

**Interfaces:**
- Produces: `WORKBENCH_VIEW_TYPE = 'wechat-workbench-view'`.
- Produces: `openWorkbench(workspace: Workspace): Promise<void>`.
- Produces: `WeChatWorkbenchView extends ItemView` and `WeChatWorkbenchSettingTab extends PluginSettingTab`.

- [ ] **Step 1: Write failing right-leaf reuse tests**

Test the orchestration through a narrow workspace port:

```ts
it('reveals the existing workbench leaf instead of creating a duplicate', async () => {
  const workspace = fakeWorkspace({ existing: true });
  await openWorkbench(workspace);
  expect(workspace.getRightLeaf).not.toHaveBeenCalled();
  expect(workspace.revealLeaf).toHaveBeenCalledTimes(1);
});

it('creates one right leaf when no workbench view exists', async () => {
  const workspace = fakeWorkspace({ existing: false });
  await openWorkbench(workspace);
  expect(workspace.getRightLeaf).toHaveBeenCalledWith(false);
  expect(workspace.setViewState).toHaveBeenCalledWith({
    type: WORKBENCH_VIEW_TYPE,
    active: true,
  });
});
```

- [ ] **Step 2: Run the UI tests and verify failure**

Run:

```bash
npm test -- tests/unit/ui/open-workbench.test.ts tests/unit/settings/settings-tab.test.ts
```

Expected: FAIL because the view and setting tab are missing.

- [ ] **Step 3: Register the view, command, ribbon, and setting controls**

Wire `src/main.ts` in this order:

```ts
this.registerView(WORKBENCH_VIEW_TYPE, leaf => new WeChatWorkbenchView(leaf));
this.addRibbonIcon('newspaper', 'Open WeChat Workbench', () => void openWorkbench(this.app.workspace));
this.addCommand({ id: 'open-wechat-workbench', name: 'Open workbench', callback: () => void openWorkbench(this.app.workspace) });
this.addSettingTab(new WeChatWorkbenchSettingTab(this.app, this, settingsStore, secretStore));
```

The empty view renders only product name, tabs `预览`/`文章设置`, disabled actions, and the message “打开一篇 Markdown 笔记开始预览”. Use DOM creation APIs, not `innerHTML`. Settings controls show AppID as text and secrets as password inputs that never prefill existing values; display only “已配置/未配置”.

- [ ] **Step 4: Verify lifecycle and build**

Run:

```bash
npm test -- tests/unit/ui tests/unit/settings
npm run lint
npm run typecheck
npm run build
```

Expected: all PASS; build contains no unresolved `obsidian` bundle.

- [ ] **Step 5: Scan and commit the native shell UI**

Run the temporary secret scan, then:

```bash
git add src/main.ts src/ui src/settings/settings-tab.ts styles.css tests/unit/ui tests/unit/settings/settings-tab.test.ts
git commit -m "feat: add native workbench shell"
```

### Task 4: Local Test Vault Synchronization and Release Verification

**Files:**
- Create: `scripts/sync-test-vault.mjs`
- Create: `scripts/verify-release.mjs`
- Create: `scripts/scan-secrets.mjs`
- Create: `tests/integration/local-assets.test.ts`
- Create: `.gitignore`
- Modify: `package.json`

**Interfaces:**
- Produces: `npm run sync:test-vault` using `WECHAT_WORKBENCH_TEST_VAULT`.
- Produces: `npm run verify:release` and `npm run scan:secrets` with non-zero failure exits.

- [ ] **Step 1: Write failing script-level integration tests**

Use a temporary directory and child process:

```ts
it('copies only Obsidian runtime assets into the plugin folder', async () => {
  const vault = await makeTempVault();
  const result = await runNode('scripts/sync-test-vault.mjs', {
    WECHAT_WORKBENCH_TEST_VAULT: vault,
  });
  expect(result.exitCode).toBe(0);
  expect(await listPluginFiles(vault)).toEqual(['main.js', 'manifest.json', 'styles.css']);
});

it('refuses the known primary vault path', async () => {
  const result = await runNode('scripts/sync-test-vault.mjs', {
    WECHAT_WORKBENCH_TEST_VAULT: '$HOME/workspace/Github/commit_note',
  });
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain('Refusing to use the primary vault');
});
```

- [ ] **Step 2: Run the integration test and verify scripts are missing**

Run:

```bash
npm test -- tests/integration/local-assets.test.ts
```

Expected: FAIL because the scripts do not exist.

- [ ] **Step 3: Implement fail-closed scripts**

`sync-test-vault.mjs` must:

```js
const vault = process.env.WECHAT_WORKBENCH_TEST_VAULT;
if (!vault) throw new Error('WECHAT_WORKBENCH_TEST_VAULT is required');
if (resolve(vault) === '$HOME/workspace/Github/commit_note') {
  throw new Error('Refusing to use the primary vault');
}
const destination = join(vault, '.obsidian', 'plugins', 'wechat-workbench');
```

It verifies the vault directory and `.obsidian` exist, creates only the plugin destination, and copies exactly three runtime files. `verify-release.mjs` parses the manifest and checks identity/version plus non-empty `main.js`. `scan-secrets.mjs` recursively scans tracked source/document/config text while excluding `.git`, `node_modules`, `main.js`, fixtures explicitly marked synthetic, and lockfiles; patterns include private keys, JWTs, common API key prefixes, `Authorization: Bearer`, and suspicious assignments to secret names.

- [ ] **Step 4: Run script tests and a temporary-vault sync**

Run:

```bash
npm test -- tests/integration/local-assets.test.ts
npm run build
npm run verify:release
npm run scan:secrets
```

Then set a real isolated Vault path only in the shell and run:

```bash
WECHAT_WORKBENCH_TEST_VAULT=/absolute/path/to/wechat-workbench-test-vault npm run sync:test-vault
```

Expected: only three runtime assets appear under `.obsidian/plugins/wechat-workbench/`.

- [ ] **Step 5: Commit local development tooling**

```bash
git add .gitignore package.json package-lock.json scripts tests/integration/local-assets.test.ts
git commit -m "chore: add isolated vault development workflow"
```

### Task 5: Real Obsidian Foundation Smoke Test

**Files:**
- Create: `docs/verification/foundation-local-smoke.md`
- Create: `README.md`

**Interfaces:**
- Produces: a reproducible local receipt for installation, enablement, view reuse, settings, restart, and workspace restore.

- [ ] **Step 1: Write the smoke-test checklist before executing it**

Create `README.md` with the current product scope, desktop-only status, local build commands, isolated Vault requirement, runtime asset directory and an explicit statement that local testing does not require community review. Create a verification table with these exact checks and empty result cells: runtime files present; plugin appears under installed plugins; enable succeeds; ribbon opens right view; command reuses same leaf; view moves/resizes/closes; workspace restore; AppID persists; secret status persists without value display; manifest change requires restart.

- [ ] **Step 2: Build and sync into the isolated Vault**

Run:

```bash
npm run build
npm run verify:release
npm run scan:secrets
WECHAT_WORKBENCH_TEST_VAULT=/absolute/path/to/wechat-workbench-test-vault npm run sync:test-vault
```

Expected: all commands exit 0.

- [ ] **Step 3: Execute the checklist in Obsidian 1.11.4 or the available minimum-version fixture**

For each row record: app version, OS, timestamp, observed result, PASS/FAIL/BLOCKED, and screenshot filename. Do not mark a check PASS from code inspection alone.

- [ ] **Step 4: Execute the same core checks on the latest stable Obsidian**

Verify enablement, open/reuse, settings, close/reopen, and workspace restore. Run all automated checks afterward:

```bash
npm test
npm run lint
npm run typecheck
npm run build
npm run verify:release
npm run scan:secrets
```

- [ ] **Step 5: Commit only if the receipt contains no credentials or machine-private paths**

Replace the local Vault root with `<TEST_VAULT>` in the receipt, run the scanner, then:

```bash
git add README.md docs/verification/foundation-local-smoke.md
git commit -m "docs: verify local obsidian loading"
```

## Phase Acceptance

- Plugin builds from a clean `npm ci` checkout.
- Automated checks pass.
- Runtime assets load in an isolated Vault without GitHub Release or community review.
- The right `ItemView`, command, ribbon and settings work in real Obsidian.
- Secrets persist only through `app.secretStorage` and never display their values.
- No rendering, network or publishing code has leaked into the foundation phase.
