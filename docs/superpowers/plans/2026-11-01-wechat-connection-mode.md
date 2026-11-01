# WeChat Connection Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the account-card proxy triad with a two-mode segmented control (`local` | `public_relay`), wire transport from `connectionMode` + bundled public-relay constants (zero user AK/SK), and add server-side IP+AppID rate limiting on the public relay.

**Architecture:** Persist only `connectionMode` in plugin `data.json`. At runtime a pure `resolveWeChatApiRelayConfig(mode, bundled)` maps mode → `WeChatApiRelayConfig`; `local` yields empty config (pass-through), `public_relay` yields the bundled base URL + headers. Settings UI mirrors the existing AI backend segmented control. Migration from schema ≤7 maps a stored public base URL to `public_relay`, everything else to `local`, then clears legacy user proxy fields / SecretStorage `wechatProxySecret`. Real Access Key / Secret stay out of the repo and are injected at build via esbuild `define` from `/tmp/aliyun-relay-secrets/wechat-proxy.env`.

**Tech Stack:** TypeScript, Obsidian Plugin API, Vitest, esbuild, existing `WeChatApiRelayTransport`, Aliyun host `121.196.229.165` (sshpass + nginx/relay).

## Global Constraints

- No commit / push / release / npm publish unless owner/审核官 explicitly approves later. Every commit step below is **OPTIONAL — skip by default**.
- Company/plugin code stays on Mac machineId `49645bf2-bcb2-462f-b2b9-42d575d46232`; do **not** clone this repo to the box.
- Two modes only: `local` | `public_relay`. UI layout **A + tip mock C**. No custom-relay UI. No user-facing AK/SK.
- Public relay base: `http://121.196.229.165:18080`. Bundled headers: `X-WeChat-Proxy-Key` / `X-WeChat-Proxy-Secret` (already named in `src/wechat/api-relay-transport.ts`).
- Real proxy Access Key / Secret must never appear in Notices, logs, error details, publish reports, test snapshots, or repo docs as “user-required” values. Tests use synthetic fixtures only.
- Embedded shared secret is extractable from `main.js`; rate limit + monitoring are the real defense — do not imply “private to you only” in UI copy.
- Follow-up docs (`AGENTS.md` / `SECURITY.md` / `PRIVACY.md`) are **out of scope** for this plan (spec Non-goals).
- Build / desktop validation vault remains `$HOME/workspace/Github/wechat-workbench-test-vault` only.
- Spec: `docs/superpowers/specs/2026-11-01-wechat-connection-mode-design.md`.

---

## File Structure

| Path | Responsibility |
| --- | --- |
| `src/settings/model.ts` | Add `WeChatConnectionMode`, `connectionMode` on `PluginSettings`, bump `schemaVersion` to `8`; drop user-writable `wechatApiBaseUrl` / `wechatProxyAccessKey` from the settings shape. |
| `src/settings/settings-store.ts` | Sanitize + migrate ≤7 → 8; derive `connectionMode` from legacy base URL; never re-persist user proxy triad. |
| `src/wechat/public-relay-constants.ts` | Public base URL + build-time-injected key/secret; honesty comment. |
| `src/wechat/resolve-api-relay-config.ts` | Pure `resolveWeChatApiRelayConfig(mode, bundled)`. |
| `src/wechat/api-relay-transport.ts` | Unchanged behavior; still driven by `WeChatApiRelayConfigPort`. |
| `src/settings/settings-tab.ts` | Segmented control + tip boxes; remove guidance paragraphs and proxy Settings; save `connectionMode`. |
| `styles.css` | Connection-mode segmented control + local/public tip boxes (reuse AI backend selector patterns). |
| `src/main.ts` | Relay config port calls `resolveWeChatApiRelayConfig`; one-time clear of SecretStorage `wechatProxySecret`. |
| `esbuild.config.mjs` | `define` injection from env / `/tmp/aliyun-relay-secrets/wechat-proxy.env`. |
| `tests/unit/settings/settings-store.test.ts` | Migration + default `connectionMode` cases. |
| `tests/unit/wechat/resolve-api-relay-config.test.ts` | New: local vs public_relay resolution. |
| `tests/unit/wechat/api-relay-transport.test.ts` | Keep existing transport contract tests (already cover rewrite/headers). |
| `tests/unit/settings/settings-tab.test.ts` | Segmented control, tip copy, no proxy fields, save persists mode. |
| Server (Aliyun `121.196.229.165`) | Validate Key/Secret; rate-limit by client IP + AppID (ops config). |

---

### Task 1: Data model + schema migration for `connectionMode`

**Files:**
- Modify: `src/settings/model.ts`
- Modify: `src/settings/settings-store.ts`
- Test: `tests/unit/settings/settings-store.test.ts`

**Interfaces:**
- Consumes: existing `sanitizeSettings` / `SettingsStore` patterns; raw legacy `wechatApiBaseUrl` only during load.
- Produces:
  - `export type WeChatConnectionMode = 'local' | 'public_relay'`
  - `PluginSettings.connectionMode: WeChatConnectionMode` (default `'local'`)
  - `PluginSettings.schemaVersion: 8` (literal)
  - `DEFAULT_SETTINGS.connectionMode === 'local'`
  - Migration helper behavior (inside store): missing/invalid mode → if normalized legacy base equals `http://121.196.229.165:18080` then `'public_relay'`, else `'local'`
  - After sanitize, settings **must not** retain user-filled `wechatApiBaseUrl` / `wechatProxyAccessKey` fields (removed from `PluginSettings`)

- [ ] **Step 1: Write the failing migration / default tests**

Append to `tests/unit/settings/settings-store.test.ts`:

```ts
import { PUBLIC_WECHAT_RELAY_BASE_URL } from '../../../src/wechat/public-relay-constants';

it('defaults connectionMode to local on empty data', async () => {
  const settings = await new SettingsStore(new MemoryPluginData()).load();
  expect(settings.schemaVersion).toBe(8);
  expect(settings.connectionMode).toBe('local');
  expect(settings).not.toHaveProperty('wechatApiBaseUrl');
  expect(settings).not.toHaveProperty('wechatProxyAccessKey');
});

it('respects an already-valid connectionMode', async () => {
  const settings = await new SettingsStore(new MemoryPluginData({
    schemaVersion: 8,
    connectionMode: 'public_relay',
  })).load();
  expect(settings.connectionMode).toBe('public_relay');
});

it('migrates legacy public relay base URL to public_relay', async () => {
  const settings = await new SettingsStore(new MemoryPluginData({
    schemaVersion: 7,
    wechatApiBaseUrl: `${PUBLIC_WECHAT_RELAY_BASE_URL}/`,
    wechatProxyAccessKey: 'wxp_legacy_user_key',
  })).load();
  expect(settings.schemaVersion).toBe(8);
  expect(settings.connectionMode).toBe('public_relay');
  expect(settings).not.toHaveProperty('wechatApiBaseUrl');
  expect(settings).not.toHaveProperty('wechatProxyAccessKey');
});

it('maps empty or custom legacy proxy URL to local (no silent public takeover)', async () => {
  const empty = await new SettingsStore(new MemoryPluginData({
    schemaVersion: 7,
    wechatApiBaseUrl: '',
  })).load();
  expect(empty.connectionMode).toBe('local');

  const custom = await new SettingsStore(new MemoryPluginData({
    schemaVersion: 7,
    wechatApiBaseUrl: 'http://203.0.113.9:18080',
  })).load();
  expect(custom.connectionMode).toBe('local');
});

it('rejects invalid connectionMode values and falls back via legacy URL rules', async () => {
  const settings = await new SettingsStore(new MemoryPluginData({
    schemaVersion: 8,
    connectionMode: 'custom',
    wechatApiBaseUrl: PUBLIC_WECHAT_RELAY_BASE_URL,
  })).load();
  // invalid mode ignored; legacy public URL still maps to public_relay
  expect(settings.connectionMode).toBe('public_relay');
});
```

Also update every existing assertion that expects `schemaVersion` `7` → `8` in this file (all `toBe(7)` / `toMatchObject({ schemaVersion: 7 })` cases).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/settings/settings-store.test.ts`

Expected: FAIL — `connectionMode` / `schemaVersion: 8` / missing `public-relay-constants` module / still has `wechatApiBaseUrl`.

- [ ] **Step 3: Minimal model + store implementation**

In `src/settings/model.ts`:

```ts
export type WeChatConnectionMode = 'local' | 'public_relay';

export interface PluginSettings {
  readonly schemaVersion: 8;
  appId: string;
  connectionMode: WeChatConnectionMode;
  // remove wechatApiBaseUrl + wechatProxyAccessKey
  defaultThemeId: string;
  // ...unchanged remainder...
}

export const DEFAULT_SETTINGS: Readonly<PluginSettings> = Object.freeze({
  schemaVersion: 8,
  appId: '',
  connectionMode: 'local',
  // ...rest unchanged; delete the two proxy fields...
});
```

In `src/settings/settings-store.ts` (keep reading raw legacy fields only inside sanitize):

```ts
import {
  PUBLIC_WECHAT_RELAY_BASE_URL,
} from '../wechat/public-relay-constants';
import type { WeChatConnectionMode } from './model';

function normalizeRelayBase(value: unknown): string {
  return sanitizedWechatApiBaseUrl(value); // existing helper stays private here
}

function connectionModeFromStored(stored: Record<string, unknown>): WeChatConnectionMode {
  const raw = stored.connectionMode;
  if (raw === 'local' || raw === 'public_relay') return raw;
  const legacy = normalizeRelayBase(stored.wechatApiBaseUrl);
  if (legacy.length > 0 && legacy === PUBLIC_WECHAT_RELAY_BASE_URL) return 'public_relay';
  return 'local';
}

function sanitizeSettings(value: unknown): PluginSettings {
  const schemaVersion = isRecord(value)
    && typeof value.schemaVersion === 'number'
    && Number.isInteger(value.schemaVersion)
    && value.schemaVersion >= 1
    && value.schemaVersion <= 8
    ? value.schemaVersion
    : 0;
  const stored = isRecord(value) && schemaVersion >= 1 ? value : {};
  return {
    schemaVersion: 8,
    appId: stringValue(stored.appId, DEFAULT_SETTINGS.appId),
    connectionMode: connectionModeFromStored(stored),
    // ...other fields unchanged; do not copy wechatApiBaseUrl / wechatProxyAccessKey...
  };
}
```

Keep `sanitizedWechatApiBaseUrl` as a private helper used only for migration comparison (or inline the normalize). Raise the accepted inbound schema ceiling only if needed (already `<= 8`).

Note: Task 1 temporarily imports `PUBLIC_WECHAT_RELAY_BASE_URL` from a module created in Task 2. Prefer creating the constants file stub in Step 3 of this task with **only** the public URL export (no secrets yet) so tests compile:

```ts
// src/wechat/public-relay-constants.ts (stub for Task 1)
/** Public fixed egress IP origin for the bundled relay. Safe to ship in source. */
export const PUBLIC_WECHAT_RELAY_BASE_URL = 'http://121.196.229.165:18080';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/settings/settings-store.test.ts`

Expected: PASS for new migration cases; fix any compile breaks from removed fields in other test harnesses that spread `DEFAULT_SETTINGS` (those should still typecheck).

- [ ] **Step 5: OPTIONAL commit (skip by default)**

```bash
git add src/settings/model.ts src/settings/settings-store.ts src/wechat/public-relay-constants.ts tests/unit/settings/settings-store.test.ts
git commit -m "feat(settings): add connectionMode and migrate legacy WeChat proxy URL"
```

Only if owner/审核官 explicitly approved commits for this work.

---

### Task 2: Bundled public relay constants + `resolveWeChatApiRelayConfig`

**Files:**
- Create / Modify: `src/wechat/public-relay-constants.ts`
- Create: `src/wechat/resolve-api-relay-config.ts`
- Modify: `esbuild.config.mjs`
- Test: `tests/unit/wechat/resolve-api-relay-config.test.ts`
- Keep: `tests/unit/wechat/api-relay-transport.test.ts` (regression)

**Interfaces:**
- Consumes: `WeChatConnectionMode` from Task 1; `WeChatApiRelayConfig` from `api-relay-transport.ts`.
- Produces:
  - `PUBLIC_WECHAT_RELAY_BASE_URL: string` (= `http://121.196.229.165:18080`)
  - `PUBLIC_WECHAT_RELAY_EGRESS_IP: string` (= `121.196.229.165`) for tip copy/copy button
  - `BundledPublicRelayCredentials` / `BUNDLED_PUBLIC_RELAY: Readonly<WeChatApiRelayConfig>`
  - `resolveWeChatApiRelayConfig(mode: WeChatConnectionMode, bundled: Readonly<WeChatApiRelayConfig>): Readonly<WeChatApiRelayConfig>`

- [ ] **Step 1: Write the failing resolver tests**

Create `tests/unit/wechat/resolve-api-relay-config.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { resolveWeChatApiRelayConfig } from '../../../src/wechat/resolve-api-relay-config';
import {
  WECHAT_PROXY_KEY_HEADER,
  WECHAT_PROXY_SECRET_HEADER,
  WeChatApiRelayTransport,
} from '../../../src/wechat/api-relay-transport';
import type { HttpRequest, HttpResponse, HttpTransport } from '../../../src/wechat/http-transport';

const FIXTURE_BUNDLED = Object.freeze({
  baseUrl: 'http://121.196.229.165:18080',
  accessKey: 'wxp_test_fixture',
  secret: 'secret-fixture-value',
});

class CaptureTransport implements HttpTransport {
  last: HttpRequest | null = null;
  async request(request: Readonly<HttpRequest>): Promise<Readonly<HttpResponse<unknown>>> {
    this.last = request;
    return Object.freeze({ status: 200, headers: Object.freeze({}), body: {} });
  }
}

describe('resolveWeChatApiRelayConfig', () => {
  it('returns empty config for local (no rewrite, no headers)', () => {
    expect(resolveWeChatApiRelayConfig('local', FIXTURE_BUNDLED)).toEqual({
      baseUrl: '',
      accessKey: '',
      secret: '',
    });
  });

  it('returns bundled constants for public_relay', () => {
    expect(resolveWeChatApiRelayConfig('public_relay', FIXTURE_BUNDLED)).toEqual(FIXTURE_BUNDLED);
  });

  it('local transport leaves api.weixin.qq.com untouched and omits proxy headers', async () => {
    const inner = new CaptureTransport();
    const cfg = resolveWeChatApiRelayConfig('local', FIXTURE_BUNDLED);
    const transport = new WeChatApiRelayTransport(inner, { get: () => cfg });
    await transport.request({ method: 'GET', url: 'https://api.weixin.qq.com/cgi-bin/token' });
    expect(inner.last?.url).toBe('https://api.weixin.qq.com/cgi-bin/token');
    expect(inner.last?.headers?.[WECHAT_PROXY_KEY_HEADER]).toBeUndefined();
    expect(inner.last?.headers?.[WECHAT_PROXY_SECRET_HEADER]).toBeUndefined();
  });

  it('public_relay transport rewrites origin and attaches bundled headers', async () => {
    const inner = new CaptureTransport();
    const cfg = resolveWeChatApiRelayConfig('public_relay', FIXTURE_BUNDLED);
    const transport = new WeChatApiRelayTransport(inner, { get: () => cfg });
    await transport.request({
      method: 'POST',
      url: 'https://api.weixin.qq.com/cgi-bin/stable_token',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(inner.last?.url).toBe('http://121.196.229.165:18080/cgi-bin/stable_token');
    expect(inner.last?.headers?.[WECHAT_PROXY_KEY_HEADER]).toBe('wxp_test_fixture');
    expect(inner.last?.headers?.[WECHAT_PROXY_SECRET_HEADER]).toBe('secret-fixture-value');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/wechat/resolve-api-relay-config.test.ts`

Expected: FAIL — module not found / `resolveWeChatApiRelayConfig` undefined.

- [ ] **Step 3: Implement constants + resolver + esbuild define**

`src/wechat/public-relay-constants.ts`:

```ts
import type { WeChatApiRelayConfig } from './api-relay-transport';

/** Public fixed egress IP origin. Safe in source / UI tip copy. */
export const PUBLIC_WECHAT_RELAY_BASE_URL = 'http://121.196.229.165:18080';
export const PUBLIC_WECHAT_RELAY_EGRESS_IP = '121.196.229.165';

/**
 * Bundled shared secret for public_relay.
 * Honesty: extractable from distributed main.js. Rate limit + monitoring are the real controls.
 * Real values are injected at production build via esbuild define; never commit real secrets.
 */
declare const __WECHAT_PUBLIC_RELAY_ACCESS_KEY__: string;
declare const __WECHAT_PUBLIC_RELAY_SECRET__: string;

function definedOrEmpty(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export const BUNDLED_PUBLIC_RELAY: Readonly<WeChatApiRelayConfig> = Object.freeze({
  baseUrl: PUBLIC_WECHAT_RELAY_BASE_URL,
  accessKey: definedOrEmpty(
    typeof __WECHAT_PUBLIC_RELAY_ACCESS_KEY__ === 'undefined'
      ? ''
      : __WECHAT_PUBLIC_RELAY_ACCESS_KEY__,
  ),
  secret: definedOrEmpty(
    typeof __WECHAT_PUBLIC_RELAY_SECRET__ === 'undefined'
      ? ''
      : __WECHAT_PUBLIC_RELAY_SECRET__,
  ),
});
```

`src/wechat/resolve-api-relay-config.ts`:

```ts
import type { WeChatConnectionMode } from '../settings/model';
import type { WeChatApiRelayConfig } from './api-relay-transport';

export function resolveWeChatApiRelayConfig(
  mode: WeChatConnectionMode,
  bundled: Readonly<WeChatApiRelayConfig>,
): Readonly<WeChatApiRelayConfig> {
  if (mode === 'public_relay') {
    return Object.freeze({
      baseUrl: bundled.baseUrl.trim(),
      accessKey: bundled.accessKey.trim(),
      secret: bundled.secret.trim(),
    });
  }
  return Object.freeze({ baseUrl: '', accessKey: '', secret: '' });
}
```

In `esbuild.config.mjs`, load env for production defines without printing secrets:

```js
import fs from 'node:fs';
import esbuild from 'esbuild';
import { builtinModules } from 'node:module';
import process from 'node:process';

function loadProxyEnv() {
  const fromProcess = {
    accessKey: process.env.WECHAT_PROXY_ACCESS_KEY ?? '',
    secret: process.env.WECHAT_PROXY_SECRET ?? '',
  };
  const envPath = '/tmp/aliyun-relay-secrets/wechat-proxy.env';
  if (!fs.existsSync(envPath)) return fromProcess;
  const parsed = Object.fromEntries(
    fs.readFileSync(envPath, 'utf8')
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#') && line.includes('='))
      .map(line => {
        const i = line.indexOf('=');
        return [line.slice(0, i), line.slice(i + 1)];
      }),
  );
  return {
    accessKey: fromProcess.accessKey || parsed.WECHAT_PROXY_ACCESS_KEY || '',
    secret: fromProcess.secret || parsed.WECHAT_PROXY_SECRET || '',
  };
}

const proxyEnv = loadProxyEnv();
const production = process.argv[2] === 'production';

const context = await esbuild.context({
  // ...existing options...
  define: {
    __WECHAT_PUBLIC_RELAY_ACCESS_KEY__: JSON.stringify(proxyEnv.accessKey),
    __WECHAT_PUBLIC_RELAY_SECRET__: JSON.stringify(proxyEnv.secret),
  },
});
```

Vitest does not need real secrets because resolver tests inject `FIXTURE_BUNDLED`. Production `npm run build` must see the env file or explicit env vars; if both empty, public_relay would send empty headers and the server must reject — acceptable fail-closed.

- [ ] **Step 4: Run resolver + existing transport tests**

Run: `npx vitest run tests/unit/wechat/resolve-api-relay-config.test.ts tests/unit/wechat/api-relay-transport.test.ts`

Expected: PASS.

- [ ] **Step 5: OPTIONAL commit (skip by default)**

```bash
git add src/wechat/public-relay-constants.ts src/wechat/resolve-api-relay-config.ts esbuild.config.mjs tests/unit/wechat/resolve-api-relay-config.test.ts
git commit -m "feat(wechat): resolve relay config from connectionMode and bundled constants"
```

---

### Task 3: Settings UI segmented control + tip boxes; remove proxy fields

**Files:**
- Modify: `src/settings/settings-tab.ts` (`renderAccountSection`, aliases, save handler)
- Modify: `styles.css`
- Test: `tests/unit/settings/settings-tab.test.ts`

**Interfaces:**
- Consumes: `settings.get().connectionMode`, `connection.snapshot().whitelistIp`, `PUBLIC_WECHAT_RELAY_EGRESS_IP`, `SettingsAccess.update({ connectionMode })`.
- Produces DOM contracts:
  - `[data-testid="connection-mode-local"]` / `[data-testid="connection-mode-public_relay"]` with `.is-active`
  - `[data-testid="connection-tip"]` (mode-specific copy)
  - `[data-testid="connection-tip-copy-ip"]` copy button
  - **Absence** of `[data-testid="wechat-api-base-url"]`, `wechat-proxy-access-key`, `wechat-proxy-secret`, `wechat-proxy-secret-toggle`
  - Save persists `connectionMode` via `settings.update`; no writes to `wechatProxySecret`

Known baseline gap to fix in the same task: current `settings-tab.test.ts` expects guidance string `点击下方验证按钮，将微信验证返回的本机出口 IP…` while `settings-tab.ts` still has the longer proxy guidance — replace both with the new tip-box assertions.

- [ ] **Step 1: Write the failing UI tests**

In `tests/unit/settings/settings-tab.test.ts` account section:

```ts
it('renders connection mode segmented control without proxy triad fields', () => {
  const { tab } = createHarness();
  document.body.append(tab.containerEl);
  tab.display();

  expect(button(tab.containerEl, 'connection-mode-local').classList.contains('is-active')).toBe(true);
  expect(button(tab.containerEl, 'connection-mode-public_relay')).not.toBeNull();
  expect(tab.containerEl.querySelector('[data-testid="wechat-api-base-url"]')).toBeNull();
  expect(tab.containerEl.querySelector('[data-testid="wechat-proxy-access-key"]')).toBeNull();
  expect(tab.containerEl.querySelector('[data-testid="wechat-proxy-secret"]')).toBeNull();
  expect(tab.containerEl.textContent).not.toContain('微信 API 代理地址');
  expect(tab.containerEl.textContent).not.toContain('代理 Access Key');
  expect(tab.containerEl.textContent).not.toContain('代理 Secret');
  expect(tab.containerEl.textContent).not.toContain('插件直接从本地连接公众号，安全可控。');
});

it('shows local tip placeholder before whitelist IP is known', () => {
  const { tab } = createHarness();
  document.body.append(tab.containerEl);
  tab.display();
  const tip = tab.containerEl.querySelector('[data-testid="connection-tip"]');
  expect(tip?.textContent).toContain('验证连接后显示出口 IP');
  expect(tip?.textContent).toContain('将此 IP 加入公众号平台 IP 白名单');
});

it('shows local egress IP + copy when whitelistIp is present', () => {
  const { tab, connection, copyIp } = createHarness();
  connection.snapshot.mockReturnValue({
    state: 'FAILED',
    verifiedAt: 1_755_000_000_000,
    errorCode: 'WECHAT_IP_NOT_IN_WHITELIST',
    errcode: 40164,
    whitelistIp: '203.0.113.4',
  });
  document.body.append(tab.containerEl);
  tab.display();
  expect(tab.containerEl.querySelector('[data-testid="connection-tip"]')?.textContent)
    .toContain('203.0.113.4');
  button(tab.containerEl, 'connection-tip-copy-ip').click();
  expect(copyIp).toHaveBeenCalledWith('203.0.113.4');
});

it('switches to public_relay tip with fixed IP and persists mode on save', async () => {
  const { tab, settings } = createHarness();
  document.body.append(tab.containerEl);
  tab.display();

  button(tab.containerEl, 'connection-mode-public_relay').click();
  const tip = tab.containerEl.querySelector('[data-testid="connection-tip"]');
  expect(tip?.classList.contains('wechat-workbench-settings__connection-tip--public')).toBe(true);
  expect(tip?.textContent).toContain('121.196.229.165');
  expect(tip?.textContent).not.toContain('X-WeChat-Proxy');
  expect(tip?.textContent).not.toContain('18080');

  button(tab.containerEl, 'account-save').click();
  await vi.waitFor(() => {
    expect(settings.update).toHaveBeenCalledWith(
      expect.objectContaining({ connectionMode: 'public_relay' }),
    );
  });
});
```

Update the existing compact-account test: delete expectations for the old long guidance paragraphs; assert segmented control + tip instead. Keep AppSecret eye-toggle / actions / status assertions.

- [ ] **Step 2: Run UI tests to verify they fail**

Run: `npx vitest run tests/unit/settings/settings-tab.test.ts`

Expected: FAIL — missing `connection-mode-*` testids; proxy fields still present; old guidance assertions fail.

- [ ] **Step 3: Implement UI + CSS**

Reorder `renderAccountSection` to match layout A + tip C:

1. Account card root
2. Connection-mode segmented control (pattern from `appendAiBackendPanel` / `wechat-workbench-settings__ai-backend-selector`)
3. Status block (move near top per spec mock; keep `renderAccountStatus`)
4. 公众号名称 / AppID / AppSecret (+ eye toggle) — unchanged controls
5. Tip box under fields
6. Actions: 保存账号配置 / 验证连接 / 断开连接 / 打开公众号后台

Segmented control sketch:

```ts
let connectionMode = current.connectionMode;
const modeSelector = createDiv('wechat-workbench-settings__connection-mode');
for (const item of [
  { id: 'local' as const, label: '本地直连' },
  { id: 'public_relay' as const, label: '公共中转' },
]) {
  const button = createEl('button', { text: item.label });
  button.type = 'button';
  button.dataset.testid = `connection-mode-${item.id}`;
  button.classList.toggle('is-active', connectionMode === item.id);
  button.addEventListener('click', () => {
    if (connectionMode === item.id) return;
    connectionMode = item.id;
    // re-render active classes + tip only (or full refreshSettings after save);
    renderConnectionTip();
    for (const child of Array.from(modeSelector.children)) {
      child.classList.toggle(
        'is-active',
        (child as HTMLElement).dataset.testid === `connection-mode-${item.id}`,
      );
    }
  });
  modeSelector.append(button);
}
accountCard.append(modeSelector);
```

Tip renderer:

```ts
function renderConnectionTip(): void {
  tip.replaceChildren();
  tip.className = 'wechat-workbench-settings__connection-tip';
  tip.dataset.testid = 'connection-tip';
  if (connectionMode === 'public_relay') {
    tip.classList.add('wechat-workbench-settings__connection-tip--public');
    tip.append(createSpan({
      text: `将 ${PUBLIC_WECHAT_RELAY_EGRESS_IP} 加入公众号平台 IP 白名单即可使用公共中转。`,
    }));
    const copy = createEl('button', { text: '复制 IP' });
    copy.type = 'button';
    copy.dataset.testid = 'connection-tip-copy-ip';
    copy.addEventListener('click', () => {
      this.copyText(PUBLIC_WECHAT_RELAY_EGRESS_IP);
      new Notice('IP 已复制');
    });
    tip.append(copy);
    return;
  }
  tip.classList.add('wechat-workbench-settings__connection-tip--local');
  const ip = status.whitelistIp;
  tip.append(createSpan({
    text: ip === null
      ? '验证连接后显示出口 IP。将此 IP 加入公众号平台 IP 白名单。'
      : `出口 IP ${ip}。将此 IP 加入公众号平台 IP 白名单。`,
  }));
  if (ip !== null) {
    const copy = createEl('button', { text: '复制 IP' });
    copy.type = 'button';
    copy.dataset.testid = 'connection-tip-copy-ip';
    copy.addEventListener('click', () => {
      this.copyText(ip);
      new Notice('IP 已复制');
    });
    tip.append(copy);
  }
}
```

Save handler changes — remove proxy reads/writes:

```ts
await this.connection.save({ displayName, appId, appSecret });
await this.settings.update({ connectionMode });
// do NOT set wechatApiBaseUrl / wechatProxyAccessKey / wechatProxySecret
this.refreshSettings();
```

Delete the entire guidance block and the three proxy `Setting` blocks. Update searchable aliases if useful (`连接模式`, `公共中转`, `本地直连`) without long wrapped Setting names.

CSS (mirror AI backend selector + green public tip):

```css
.wechat-workbench-settings__connection-mode {
  display: inline-grid;
  grid-template-columns: repeat(2, minmax(7.5rem, 1fr));
  gap: var(--size-4-1);
  width: min(100%, 22rem);
  margin: 0 0 var(--size-4-3);
  padding: var(--size-4-1);
  border-radius: var(--radius-m);
  background: var(--background-modifier-form-field);
}

.wechat-workbench-settings__connection-mode button.is-active {
  border-color: var(--interactive-accent);
  background: var(--background-primary);
  color: var(--interactive-accent);
}

.wechat-workbench-settings__connection-tip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--size-4-2);
  margin: var(--size-4-3) 0;
  padding: var(--size-4-3);
  border-radius: var(--radius-s);
  color: var(--text-normal);
  background: var(--background-primary-alt);
}

.wechat-workbench-settings__connection-tip--public {
  color: var(--text-normal);
  background: rgba(7, 193, 96, 0.16);
  border: 1px solid rgba(7, 193, 96, 0.45);
}
```

Remove unused `.wechat-workbench-settings__account-guidance*` rules only after no references remain (or leave harmless — prefer delete to avoid dead CSS).

- [ ] **Step 4: Run UI tests**

Run: `npx vitest run tests/unit/settings/settings-tab.test.ts`

Expected: PASS.

- [ ] **Step 5: OPTIONAL commit (skip by default)**

```bash
git add src/settings/settings-tab.ts styles.css tests/unit/settings/settings-tab.test.ts
git commit -m "feat(settings): connection mode segmented control and tip boxes"
```

---

### Task 4: Wire `main.ts` transport from `connectionMode` + clear legacy proxy secret

**Files:**
- Modify: `src/main.ts`
- Modify: `src/settings/secret-store.ts` only if needed (keep `wechatProxySecret` kind for `clear`)
- Test: extend `tests/unit/wechat/resolve-api-relay-config.test.ts` or add a thin wiring note covered by typecheck + existing store tests; optional small unit around a extracted `createWeChatRelayConfigPort` if you pull the closure out of `main.ts` for testability.

**Interfaces:**
- Consumes: `currentSettings().connectionMode`, `BUNDLED_PUBLIC_RELAY`, `resolveWeChatApiRelayConfig`.
- Produces: `WeChatApiRelayTransport` config port that always resolves from mode + bundled constants (never from user settings fields or SecretStorage).

- [ ] **Step 1: Write a failing wiring helper test (preferred extract)**

If extracting for TDD, create `src/wechat/create-relay-config-port.ts`:

```ts
import type { WeChatConnectionMode } from '../settings/model';
import type { WeChatApiRelayConfig, WeChatApiRelayConfigPort } from './api-relay-transport';
import { resolveWeChatApiRelayConfig } from './resolve-api-relay-config';

export function createWeChatRelayConfigPort(
  getMode: () => WeChatConnectionMode,
  bundled: Readonly<WeChatApiRelayConfig>,
): WeChatApiRelayConfigPort {
  return {
    get: () => resolveWeChatApiRelayConfig(getMode(), bundled),
  };
}
```

Test:

```ts
it('createWeChatRelayConfigPort tracks live mode changes', () => {
  let mode: 'local' | 'public_relay' = 'local';
  const port = createWeChatRelayConfigPort(() => mode, FIXTURE_BUNDLED);
  expect(port.get().baseUrl).toBe('');
  mode = 'public_relay';
  expect(port.get().baseUrl).toBe(FIXTURE_BUNDLED.baseUrl);
});
```

- [ ] **Step 2: Run the new test — expect FAIL before helper exists**

Run: `npx vitest run tests/unit/wechat/resolve-api-relay-config.test.ts`

- [ ] **Step 3: Implement helper + switch `main.ts`**

Replace the current relay port:

```ts
// before
new WeChatApiRelayTransport(new ObsidianHttpTransport(), {
  get: () => ({
    baseUrl: currentSettings().wechatApiBaseUrl,
    accessKey: currentSettings().wechatProxyAccessKey,
    secret: secretStore.get('wechatProxySecret') ?? '',
  }),
}),

// after
new WeChatApiRelayTransport(
  new ObsidianHttpTransport(),
  createWeChatRelayConfigPort(
    () => currentSettings().connectionMode,
    BUNDLED_PUBLIC_RELAY,
  ),
),
```

After settings load on plugin startup, clear legacy user proxy secret once:

```ts
if (secretStore.get('wechatProxySecret') !== null) {
  secretStore.clear('wechatProxySecret');
}
```

Do not Notice the secret value. Optional one-line Notice if you detected a custom legacy URL during migration is **not required** by acceptance; skip unless product asks.

Fix any remaining TypeScript references to removed `wechatApiBaseUrl` / `wechatProxyAccessKey` (`npm run typecheck`).

- [ ] **Step 4: Typecheck + targeted tests**

Run: `npx vitest run tests/unit/wechat/resolve-api-relay-config.test.ts tests/unit/settings/settings-store.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: OPTIONAL commit (skip by default)**

```bash
git add src/main.ts src/wechat/create-relay-config-port.ts tests/unit/wechat/resolve-api-relay-config.test.ts
git commit -m "feat(wechat): wire relay transport from connectionMode and clear legacy proxy secret"
```

---

### Task 5: Server-side rate limit on Aliyun public relay (IP + AppID)

**Files / hosts:**
- Remote: `121.196.229.165` (SSH). Auth: `sshpass -f /tmp/aliyun-relay-secrets/pass` (password file already on Mac). Credentials map: `/tmp/aliyun-relay-secrets/wechat-api-relay.credentials.map`. Env reference: `/tmp/aliyun-relay-secrets/wechat-proxy.env`.
- Local notes only if needed under `docs/verification/` (do **not** commit secrets). Plugin repo gets **no** server source tree in this task unless one already exists on the host.

**Interfaces:**
- Consumes: existing relay that already validates `X-WeChat-Proxy-Key` + `X-WeChat-Proxy-Secret`.
- Produces: rate limiting **by client IP** and **by AppID** (thresholds ops-configurable on server; no plugin UI). Fail closed on bad Key/Secret.

- [ ] **Step 1: Inspect the live relay stack (read-only)**

From Mac:

```bash
sshpass -f /tmp/aliyun-relay-secrets/pass ssh -o StrictHostKeyChecking=accept-new root@121.196.229.165 'uname -a; ss -lntp | grep 18080; systemctl list-units --type=service --state=running | head; ls /etc/nginx /etc/nginx/conf.d /opt 2>/dev/null; docker ps 2>/dev/null | head'
```

Record: process listening on `:18080`, config path, whether AppID is visible to the proxy (query/body of WeChat token calls typically include `appid`).

- [ ] **Step 2: Confirm Key/Secret rejection still works before changing limits**

```bash
# expect non-2xx without headers (exact status depends on stack)
curl -sS -o /dev/null -w '%{http_code}\n' http://121.196.229.165:18080/cgi-bin/token
```

Do not paste real Key/Secret into the plan, chat logs, or git. When validating success path, source env locally and avoid shell history if possible.

- [ ] **Step 3: Implement rate limits on the host**

Choose the mechanism that matches Step 1:

- **nginx / OpenResty in front of relay:** `limit_req_zone` keyed by `$binary_remote_addr` for IP; for AppID use `lua` / `auth_request` / mirror of request args (`appid` query or JSON body). Example nginx sketch (adjust paths/zone sizes after inspect):

```nginx
limit_req_zone $binary_remote_addr zone=wx_proxy_ip:10m rate=30r/m;
# AppID zone key must be derived by the relay app or lua — do not invent a fake $arg_appid
# if POST JSON body is the only carrier.

server {
  listen 18080;
  location / {
    limit_req zone=wx_proxy_ip burst=20 nodelay;
    # existing auth for X-WeChat-Proxy-Key / Secret stays first
    proxy_pass http://127.0.0.1:<relay-upstream>;
  }
}
```

- **If the relay is an application (Node/Go) already validating headers:** add middleware counters keyed by `clientIP` and parsed `appid`, return 429 on breach; keep auth failure as 401/403.

Exact numeric thresholds are ops-owned; start conservative (e.g. per-IP 30 req/min, per-AppID 60 req/min) and document the chosen values in the verification note — **not** in user-facing plugin copy.

- [ ] **Step 4: Verify limits**

```bash
# burst until 429 (synthetic; do not use a real production AppSecret)
# Example pattern only — adjust to the stack found in Step 1:
for i in $(seq 1 80); do
  curl -sS -o /dev/null -w '%{http_code}\n' http://121.196.229.165:18080/cgi-bin/token
done | sort | uniq -c
```

Expected: mostly auth failures or 429s; no unauthenticated upstream WeChat traffic.

Reload/restart the service safely (`nginx -t && systemctl reload nginx` or equivalent). Snapshot the final config path and rate numbers into `docs/verification/2026-11-01-wechat-public-relay-rate-limit.md` **without secrets**.

- [ ] **Step 5: OPTIONAL commit of verification note only (skip by default)**

```bash
git add docs/verification/2026-11-01-wechat-public-relay-rate-limit.md
git commit -m "docs(verification): public relay IP/AppID rate limit evidence"
```

---

### Task 6: Full unit regression + production build

**Files:**
- Touch only if Task 1–4 left compile/test fallout (e.g. secret-store status tests still mention `wechatProxySecret: false` — keep that; SecretKind remains for clear).
- Test: targeted suites below + typecheck + build.

**Interfaces:**
- Consumes: Tasks 1–4 complete.
- Produces: green targeted vitest + `npm run typecheck` + `npm run build` with env-injected defines.

- [ ] **Step 1: Run the connection-mode related unit suites**

```bash
npx vitest run \
  tests/unit/settings/settings-store.test.ts \
  tests/unit/settings/settings-tab.test.ts \
  tests/unit/settings/secret-store.test.ts \
  tests/unit/wechat/api-relay-transport.test.ts \
  tests/unit/wechat/resolve-api-relay-config.test.ts
```

Expected: PASS.

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: exit 0.

- [ ] **Step 3: Production build with secrets available on the Mac**

```bash
# env file must exist at /tmp/aliyun-relay-secrets/wechat-proxy.env
npm run build
```

Expected: `main.js` produced. Spot-check that user-facing strings in `main.js` do **not** invent UI copy requiring AK/SK paste. Do **not** paste extracted secret values into chat or docs. Confirm define substitution occurred (search for placeholder empty-string risk: if build machine lacked env, fail the task and fix env loading — do not ship empty public_relay credentials intentionally).

- [ ] **Step 4: Optional broader suite if time allows**

```bash
npm test
```

If unrelated baseline failures appear, record them as pre-existing; do not “fix” by claiming pass.

- [ ] **Step 5: OPTIONAL commit (skip by default)**

Only with explicit owner/审核官 approval, commit the full feature set in focused commits from Tasks 1–4 (prefer those per-task commits over one giant commit). **No push / release.**

---

## Self-Review (against spec)

| Spec requirement | Task coverage |
| --- | --- |
| Modes only `local` \| `public_relay`; default `local` | Task 1 |
| Layout A segmented control + tip mock C (green fixed IP + copy) | Task 3 |
| Remove proxy triad + long guidance; keep save/verify/status/console | Task 3 |
| Bundled URL + Key/Secret; no UI AK/SK; headers on public_relay | Task 2 + 4 |
| `local` empty config → transport pass-through | Task 2 |
| Migration: public URL → `public_relay`; else `local`; schema bump | Task 1 (lock `schemaVersion: 8`) |
| `resolveWeChatApiRelayConfig` single function + unit tests | Task 2 |
| Server Key/Secret check + IP + AppID rate limit | Task 5 |
| No commit/push/release in this work | Global Constraints + OPTIONAL commit steps |
| Honesty: extractable secret; no “only you” UI claim | Task 2 comment + Task 3 tip copy |
| Follow-up AGENTS/SECURITY/PRIVACY | Explicitly out of scope (spec Non-goals) |

**Placeholder scan:** none intentional — commands, snippets, and paths are concrete. Server AppID key extraction depends on inspect (Step 5.1) because the live stack is not in-repo; the plan requires choosing nginx-lua vs app middleware after that inspect rather than inventing a fake `$arg_appid`.

**Type consistency:** `WeChatConnectionMode`, `resolveWeChatApiRelayConfig(mode, bundled)`, `BUNDLED_PUBLIC_RELAY`, `PUBLIC_WECHAT_RELAY_BASE_URL`, `PUBLIC_WECHAT_RELAY_EGRESS_IP`, `createWeChatRelayConfigPort`, `schemaVersion: 8` are named consistently across tasks.

**Gaps / risks left for implementer:**
1. Pre-existing `settings-tab` guidance string mismatch vs test — fixed in Task 3, not before.
2. Removing `wechatApiBaseUrl` / `wechatProxyAccessKey` from `PluginSettings` may surface extra TS errors outside listed files; Task 4 typecheck is the gate.
3. Task 5 AppID rate-limit implementation is stack-dependent after SSH inspect; plugin work (Tasks 1–4, 6) can ship without Task 5, but acceptance “server rate limit” needs Task 5 before calling the public relay production-ready.
4. Production build without `/tmp/aliyun-relay-secrets/wechat-proxy.env` would embed empty credentials — Task 6 must fail closed and refuse to treat that as success.
5. Docs updates for AGENTS/SECURITY/PRIVACY remain a separate follow-up by design.

