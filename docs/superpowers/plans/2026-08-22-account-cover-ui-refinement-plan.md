# WeChat Workbench Account, Cover, and UI Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved account connection, custom AI provider/model discovery, external WeChat backend link, simplified publish settings, three-source cover workflow, and Obsidian-native visual treatment without weakening existing publish safety.

**Architecture:** Keep UI rendering thin and move account mutations, AI service configuration, model discovery, cover preparation, and external-browser behavior behind narrow ports. Reuse `TokenService`, `PinnedNodeHttpTransport`, `NetworkPolicy`, `RemoteImageFetcher`, immutable `RenderArtifact`, and the existing publish state machine; replace duplicated cover-path resolution with one `PublishCoverResolverPort` implemented by `CoverWorkflow`.

**Tech Stack:** TypeScript 5.8, Obsidian 1.13 API with minimum supported version 1.11.4, Electron desktop APIs, Vitest 4 + jsdom, esbuild, ESLint, existing Node HTTP/DNS security adapters.

## Global Constraints

- Desktop only; `manifest.json` keeps `isDesktopOnly: true` and `minAppVersion >= 1.11.4`.
- All plugin installation, manual testing, and real WeChat verification use `$HOME/workspace/Github/wechat-workbench-test-vault`; never load the development plugin into `$HOME/workspace/Github/commit_note`.
- AppSecret, Access Token, and AI service API Key stay in Obsidian `SecretStorage`; never place values in `data.json`, Frontmatter, logs, errors, snapshots, fixtures, verification evidence, or Git history.
- Passive preview, setting-tab display, and field input do not initiate network requests. WeChat verification, model discovery, remote-cover loading, AI generation, and draft synchronization require explicit user actions.
- Model discovery accepts public HTTPS endpoints only and continues through `PinnedNodeHttpTransport` plus `NetworkPolicy`; localhost, loopback, private, link-local, credential-bearing, query-bearing, and fragment-bearing provider URLs remain blocked.
- Anthropic support means custom endpoint/authentication, model discovery, and accurate `PROMPT_PLANNING_ONLY` diagnosis. Do not represent Anthropic text or SVG output as a generated cover image.
- Preview, clipboard output, and draft synchronization continue to consume one immutable `RenderArtifact`; no task may fork a second article-rendering path.
- Draft synchronization creates or updates drafts only. Do not add mass-send, public-publish, deployment, or author-hosted proxy behavior.
- Keep version 1 and 2 settings readable. Retain legacy `defaultCoverStrategy`, `globalDefaultCoverPath`, `defaultSourceUrl`, `content_source_url`, and `AccountSettingsModal` compatibility data/file; stop wiring obsolete UI but do not delete files or data.
- The interactive prototype's scene, appearance, and accent controls are review-only and must not enter production code.
- Preserve unrelated dirty-worktree changes. Each commit stages only the files listed by its task after `npm run scan:secrets` passes.

## File and Responsibility Map

### New production files

- `src/settings/account-connection-service.ts` — account save/verify/disconnect transaction and derived status.
- `src/settings/ai-service-settings.ts` — atomic AI provider configuration, stored-key host isolation, and model refresh orchestration.
- `src/cover/ai-provider.ts` — provider protocol types, validated endpoint joining, authentication headers, and model option types.
- `src/cover/ai-model-catalog.ts` — bounded OpenAI-compatible and Anthropic model-list parsing.
- `src/ui/account-disconnect-modal.ts` — destructive local-disconnect confirmation only.
- `src/ui/external-browser.ts` — fixed WeChat backend URL and Electron adapter.
- `docs/verification/account-cover-ui-refinement.md` — automatic, desktop, and real-WeChat evidence ledger.

### Existing production files to modify

- `src/settings/model.ts`, `src/settings/settings-store.ts`, `src/settings/secret-store.ts` — schema v3 and secret status.
- `src/settings/settings-tab.ts`, `src/main.ts` — approved settings UI and dependency wiring.
- `src/ui/workbench-view.ts`, `src/ui/workbench-publish-settings.ts`, `src/domain/article.ts`, `src/settings/article-settings.ts` — external link, source-link removal, and preserved metadata.
- `src/cover/cover-types.ts`, `src/cover/cover-service.ts`, `src/cover/cover-workflow.ts`, `src/cover/cover-generator.ts`, `src/cover/openai-image-generator.ts` — three-source preparation and provider capability gating.
- `src/ui/cover-picker-modal.ts`, `src/ui/ai-cover-confirmation.ts` — native upload, three choices, preview, and disclosure.
- `src/publish/publish-workflow.ts`, `src/publish/publish-types.ts` — consume one frozen prepared cover.
- `styles.css` — Obsidian accent variables, larger tabs/headings, compact settings, cover modal, and narrow layouts.

### Tests to create or extend

- Settings: `tests/unit/settings/settings-store.test.ts`, `secret-store.test.ts`, `settings-tab.test.ts`, plus new `account-connection-service.test.ts` and `ai-service-settings.test.ts`.
- Cover: new `tests/unit/cover/ai-model-catalog.test.ts`; extend `cover-service.test.ts`, `cover-workflow.test.ts`, `openai-image-generator.test.ts`, `electron-image-port.test.ts`.
- UI: new `tests/unit/ui/account-disconnect-modal.test.ts`, `external-browser.test.ts`; extend `workbench-view.test.ts`, `workbench-publish-settings.test.ts`, `cover-ui.test.ts`, `ai-cover-confirmation.test.ts`.
- Publish/security: extend `tests/unit/publish/publish-workflow.test.ts`, `tests/adversarial/network-assets.test.ts`, `tests/integration/cover-provider.test.ts`, `cover-ui.test.ts`, `workbench.test.ts`, and `tests/visual/workbench-visual.test.ts`.
- Test host: extend `tests/mocks/obsidian.ts` only with the exact Obsidian component methods used by production UI.

---

### Task 1: Migrate settings to schema v3 without exposing credentials

**Files:**
- Modify: `src/settings/model.ts`
- Modify: `src/settings/settings-store.ts`
- Modify: `src/settings/secret-store.ts`
- Test: `tests/unit/settings/settings-store.test.ts`
- Test: `tests/unit/settings/secret-store.test.ts`

**Interfaces:**
- Consumes: existing `ArticleStyleConfig`, `MediaCacheRecord`, `RecoveryReceiptRecord`, and fixed SecretStorage IDs.
- Produces: `AiProviderProtocol`, `AccountVerificationRecord`, schema-v3 `PluginSettings`, and `SecretStatus` used by Tasks 2–6.

- [ ] **Step 1: Write failing schema-v3 migration and sanitization tests**

```ts
it('migrates v2 account and image settings into schema v3', async () => {
  const settings = await new SettingsStore(new MemoryPluginData({
    schemaVersion: 2,
    appId: 'wx-public-id',
    imageApiBaseUrl: 'https://images.example.test/v1',
    imageApiModel: 'image-model',
  })).load();
  expect(settings).toMatchObject({
    schemaVersion: 3,
    accountDisplayName: '',
    accountVerification: null,
    imageApiProtocol: 'openai-compatible',
    imageApiBaseUrl: 'https://images.example.test/v1',
    imageApiModel: 'image-model',
  });
});

it('drops malformed verification records and unsupported protocols', async () => {
  const settings = await new SettingsStore(new MemoryPluginData({
    schemaVersion: 3,
    imageApiProtocol: 'unknown',
    accountVerification: { accountHash: 'x', outcome: 'SUCCESS', verifiedAt: 'now' },
  })).load();
  expect(settings.imageApiProtocol).toBe('openai-compatible');
  expect(settings.accountVerification).toBeNull();
});
```

- [ ] **Step 2: Run the focused tests and confirm the old schema fails**

Run: `npx vitest run tests/unit/settings/settings-store.test.ts tests/unit/settings/secret-store.test.ts`

Expected: FAIL because `schemaVersion` is `2` and the new fields do not exist.

- [ ] **Step 3: Add exact schema-v3 domain types and defaults**

```ts
export type AiProviderProtocol = 'openai-compatible' | 'anthropic';

export interface AccountVerificationRecord {
  accountHash: string;
  outcome: 'SUCCESS' | 'FAILURE';
  verifiedAt: number;
  errorCode: string | null;
  errcode: number | null;
}

export interface PluginSettings {
  schemaVersion: 3;
  appId: string;
  defaultThemeId: string;
  defaultStyle: Readonly<ArticleStyleConfig>;
  recentStyles: Readonly<Record<string, Readonly<ArticleStyleConfig>>>;
  customThemeDirectory: string;
  defaultAuthor: string;
  defaultSourceUrl: string;
  defaultCoverStrategy: DefaultCoverStrategy;
  globalDefaultCoverPath: string;
  accountDisplayName: string;
  accountVerification: Readonly<AccountVerificationRecord> | null;
  imageApiProtocol: AiProviderProtocol;
  imageApiBaseUrl: string;
  imageApiModel: string;
  accessTokenExpiresAt: number | null;
  accountHash: string | null;
  mediaCache: readonly Readonly<MediaCacheRecord>[];
  recoveryReceipts: readonly Readonly<RecoveryReceiptRecord>[];
}
```

Implement `verificationRecord(value)` with exact type checks, require a non-empty `accountHash`, finite non-negative `verifiedAt`, supported outcome, string-or-null `errorCode`, and finite-number-or-null `errcode`. Make `sanitizeSettings` accept schema versions `1`, `2`, and `3`, always emit `schemaVersion: 3`, and default old image settings to `openai-compatible`.

- [ ] **Step 4: Keep the existing SecretStorage ID and rename only the user-facing meaning**

Keep `SecretKind = 'appSecret' | 'accessToken' | 'imageApiKey'` and `wechat-workbench-image-api-key` so existing secrets remain readable. Do not add API Key fields to `PluginSettings` or settings serialization.

- [ ] **Step 5: Run focused settings tests**

Run: `npx vitest run tests/unit/settings/settings-store.test.ts tests/unit/settings/secret-store.test.ts`

Expected: PASS, including version 1/2 migration, invalid provider URL rejection, and secret-shaped-field rejection.

- [ ] **Step 6: Scan and commit only settings model files**

```bash
npm run scan:secrets
git add src/settings/model.ts src/settings/settings-store.ts src/settings/secret-store.ts tests/unit/settings/settings-store.test.ts tests/unit/settings/secret-store.test.ts
git commit -m "feat(settings): migrate account and ai config"
```

---

### Task 2: Add transactional account save, verification, and disconnect service

**Files:**
- Create: `src/settings/account-connection-service.ts`
- Create: `tests/unit/settings/account-connection-service.test.ts`

**Interfaces:**
- Consumes: schema-v3 `PluginSettings`, `accountHashForAppId`, `SecretStore` semantics, and `TokenService.getValidToken(null, { forceRefresh: true })` plus `clear()`.
- Produces: `AccountConnectionService`, `AccountConnectionState`, and `AccountConnectionSnapshot` for Task 3.

- [ ] **Step 1: Write failing tests for all persisted and transient states**

```ts
it('derives connected only from a matching successful verification record', () => {
  expect(service.snapshot()).toMatchObject({ state: 'CONNECTED', verifiedAt: 1_000 });
  settings.current.appId = 'wx-other';
  expect(service.snapshot().state).toBe('UNVERIFIED');
});

it('rolls back a refreshed token when verification-record persistence fails', async () => {
  token.verify.mockResolvedValue('SYNTHETIC_TOKEN');
  settings.update.mockRejectedValueOnce(new Error('synthetic save failure'));
  await expect(service.verify()).rejects.toMatchObject({ code: 'ACCOUNT_VERIFICATION_SAVE_FAILED' });
  expect(token.clear).toHaveBeenCalledOnce();
});

it('disconnects local credentials but preserves display name and app id', async () => {
  await service.disconnect();
  expect(secrets.clear).toHaveBeenCalledWith('appSecret');
  expect(secrets.clear).toHaveBeenCalledWith('accessToken');
  expect(settings.current).toMatchObject({
    accountDisplayName: 'Commit 日记', appId: 'wx-public-id', accountVerification: null,
  });
});
```

Also cover: empty AppID/AppSecret blocks without a token call; empty AppSecret input retains the stored secret; a new secret clears token metadata and verification; duplicate `verify()` calls share one in-flight Promise; failure stores only `PublicError.code`, `errcode`, and time.

Add one transient IP-whitelist test: a `PublicError.errmsg` that contains a syntactically valid public IP exposes `whitelistIp` in the in-memory snapshot, while malformed/private addresses produce `null`; the value is never added to `AccountVerificationRecord` or fetched from a third-party IP service.

- [ ] **Step 2: Run the new tests and confirm the service is missing**

Run: `npx vitest run tests/unit/settings/account-connection-service.test.ts`

Expected: FAIL with module-not-found for `account-connection-service`.

- [ ] **Step 3: Implement the narrow service contracts**

```ts
export type AccountConnectionState =
  | 'UNCONFIGURED' | 'UNVERIFIED' | 'VERIFYING' | 'CONNECTED' | 'FAILED';

export interface AccountConnectionSettingsPort {
  get(): Readonly<PluginSettings>;
  update(patch: Partial<PluginSettings>): Promise<Readonly<PluginSettings>>;
}

export interface AccountConnectionSecretPort {
  get(kind: 'appSecret'): string | null;
  set(kind: 'appSecret', value: string): void;
  clear(kind: 'appSecret' | 'accessToken'): void;
}

export interface AccountTokenVerifierPort {
  getValidToken(expectedAccountHash: null, options: Readonly<{ forceRefresh: true }>): Promise<string>;
  clear(): Promise<void>;
}

export interface AccountConnectionSnapshot {
  state: AccountConnectionState;
  verifiedAt: number | null;
  errorCode: string | null;
  errcode: number | null;
  whitelistIp: string | null;
}
```

Use one private `verification: Promise<AccountConnectionSnapshot> | null`. In `save`, normalize name/AppID first, reject a changed AppID plus empty new secret only when no stored secret exists, and clear token/verification before persisting the replacement account. In `verify`, set transient `VERIFYING`, force refresh, then persist success or sanitized failure. If success persistence fails, call `tokens.clear()` and throw a stable local error. Extract `whitelistIp` only from the current `PublicError.errmsg`, validate it as a public IPv4/IPv6 address, and never persist the raw message/IP. In `disconnect`, clear both secrets before persisting `accessTokenExpiresAt: null` and `accountVerification: null` while retaining display name/AppID.

- [ ] **Step 4: Verify rollback and single-flight behavior**

Run: `npx vitest run tests/unit/settings/account-connection-service.test.ts tests/unit/wechat/token-service.test.ts`

Expected: PASS with exactly one token request for concurrent verification.

- [ ] **Step 5: Scan and commit the service**

```bash
npm run scan:secrets
git add src/settings/account-connection-service.ts tests/unit/settings/account-connection-service.test.ts
git commit -m "feat(settings): add account connection service"
```

---

### Task 3: Render the approved account settings and confirmation flow

**Files:**
- Modify: `src/settings/settings-tab.ts`
- Modify: `src/main.ts`
- Create: `src/ui/account-disconnect-modal.ts`
- Modify: `tests/mocks/obsidian.ts`
- Modify: `tests/unit/settings/settings-tab.test.ts`
- Create: `tests/unit/ui/account-disconnect-modal.test.ts`
- Modify: `styles.css`

**Interfaces:**
- Consumes: `AccountConnectionService.snapshot/save/verify/disconnect` from Task 2 and an injected `copyText(value: string): void` backed by `ElectronClipboardPort.write({ text: value })`.
- Produces: compact account section with display name, AppID, password input, save, explicit verify, status/time, and confirmed disconnect.

- [ ] **Step 1: Write failing presentation and DOM tests**

```ts
it('renders one compact account section without exposing secrets', () => {
  tab.display();
  expect(tab.containerEl.textContent).toContain('微信公众号');
  expect(tab.containerEl.textContent).toContain('公众号名称');
  expect(tab.containerEl.textContent).toContain('公众号基础连接正常');
  expect(tab.containerEl.textContent).not.toContain('SYNTHETIC_APP_SECRET');
  expect(tab.containerEl.querySelector('[data-testid="account-secret"]'))
    .toHaveProperty('value', '');
});

it('shows a copy action only for an IP explicitly returned by WeChat', () => {
  connection.snapshot.mockReturnValue(failedSnapshot({ whitelistIp: '93.184.216.34' }));
  tab.display();
  expect(tab.containerEl.textContent).toContain('93.184.216.34');
  expect(tab.containerEl.querySelector('[data-testid="copy-whitelist-ip"]')).not.toBeNull();
});

it('does not verify on display and disables duplicate actions while verifying', async () => {
  tab.display();
  expect(connection.verify).not.toHaveBeenCalled();
  click('[data-testid="account-verify"]');
  expect(button('account-verify').disabled).toBe(true);
  expect(button('account-disconnect').disabled).toBe(true);
});
```

Add modal tests asserting cancel does nothing, confirm calls `disconnect()` once, and the copy states that AppID/name and article links are retained.

- [ ] **Step 2: Run tests and verify the old flat settings page fails**

Run: `npx vitest run tests/unit/settings/settings-tab.test.ts tests/unit/ui/account-disconnect-modal.test.ts`

Expected: FAIL because the setting tab has no account name, status, verify button, or confirmation modal.

- [ ] **Step 3: Replace per-field auto-save with one explicit account save action**

Create `renderAccountSection()` inside `settings-tab.ts`. Keep input state local until “保存账号配置”; pass this exact input to the service:

```ts
await connection.save({
  displayName: displayNameInput.value,
  appId: appIdInput.value,
  appSecret: appSecretInput.value,
});
appSecretInput.value = '';
this.display();
```

Map states to exact copy: `UNCONFIGURED -> 尚未配置`, `UNVERIFIED -> 待验证`, `VERIFYING -> 正在验证连接…`, `CONNECTED -> 公众号基础连接正常`, `FAILED -> 连接验证失败`. Show `verifiedAt` in local time only when non-null. Do not render full errors or raw WeChat responses.

Always show the local-direct-connect/IP-whitelist explanation. Render the IP and a clipboard copy action only when `snapshot.whitelistIp` is non-null; otherwise do not guess or call any public-IP service.

- [ ] **Step 4: Implement disconnect confirmation and compact layout**

```ts
export class AccountDisconnectModal extends Modal {
  constructor(app: App, private readonly confirm: () => Promise<void>) { super(app); }
  override onOpen(): void {
    this.titleEl.textContent = '断开本地连接';
    this.contentEl.replaceChildren();
    this.contentEl.append(createEl('p', {
      text: '将清除本机 AppSecret 和 Access Token；公众号名称、AppID、文章 Frontmatter 和草稿关联保持不变。',
    }));
  }
}
```

Use `.wechat-workbench-settings__section`, normal document flow, no `min-height`, no empty `Setting`, and no absolute positioning. Keep at most `var(--size-4-4)` between account fields and status.

- [ ] **Step 5: Run account UI tests and CSS contract checks**

Run: `npx vitest run tests/unit/settings/settings-tab.test.ts tests/unit/ui/account-disconnect-modal.test.ts tests/visual/workbench-visual.test.ts`

Expected: PASS; display causes zero network/token calls and secret input remains empty after every rerender.

Wire one `AccountConnectionService` into `WeChatWorkbenchSettingTab` in `main.ts`; inject the existing `TokenService`, `settingsAccess`, `SecretStore`, a clock, and `value => new ElectronClipboardPort().write({ text: value })`. Do not construct a second token service.

- [ ] **Step 6: Scan and commit the account UI**

```bash
npm run scan:secrets
git add src/settings/settings-tab.ts src/main.ts src/ui/account-disconnect-modal.ts tests/mocks/obsidian.ts tests/unit/settings/settings-tab.test.ts tests/unit/ui/account-disconnect-modal.test.ts styles.css
git commit -m "feat(settings): add verified account ui"
```

---

### Task 4: Add bounded OpenAI-compatible and Anthropic model discovery

**Files:**
- Create: `src/cover/ai-provider.ts`
- Create: `src/cover/ai-model-catalog.ts`
- Create: `tests/unit/cover/ai-model-catalog.test.ts`
- Modify: `tests/adversarial/network-assets.test.ts`

**Interfaces:**
- Consumes: `AiProviderProtocol` from Task 1, `HttpTransport`, `PinnedNodeHttpTransport`, `NetworkPolicy`, and `redactSensitiveText`.
- Produces: `AiModelCatalogPort.list()` and immutable `AiModelOption[]` for Task 5.

- [ ] **Step 1: Write failing protocol, parsing, and redaction tests**

```ts
it('uses bearer authentication for an OpenAI-compatible model list', async () => {
  const providerCredential = ['SYNTHETIC', 'PROVIDER', 'CREDENTIAL'].join('_');
  const request = vi.fn(async () => response({ data: [{ id: 'image-b' }, { id: 'image-a' }] }));
  const models = await new AiModelCatalogService({ request }).list({
    protocol: 'openai-compatible', baseUrl: 'https://models.example.test/v1',
    apiKey: providerCredential,
  });
  expect(request).toHaveBeenCalledWith(expect.objectContaining({
    method: 'GET', url: 'https://models.example.test/v1/models',
    headers: { Authorization: `Bearer ${providerCredential}` },
  }));
  expect(models.map(model => model.id)).toEqual(['image-a', 'image-b']);
  expect(models.every(model => model.capability === 'IMAGE_UNVERIFIED')).toBe(true);
});

it('uses Anthropic headers and marks every returned model planning-only', async () => {
  const providerCredential = ['SYNTHETIC', 'ANTHROPIC', 'CREDENTIAL'].join('_');
  const request = vi.fn(async () => response({ data: [{ id: 'claude-sonnet' }] }));
  const models = await new AiModelCatalogService({ request }).list({
    protocol: 'anthropic', baseUrl: 'https://api.anthropic.com',
    apiKey: providerCredential,
  });
  expect(request).toHaveBeenCalledWith(expect.objectContaining({
    url: 'https://api.anthropic.com/v1/models',
    headers: { 'x-api-key': providerCredential, 'anthropic-version': '2023-06-01' },
  }));
  expect(models).toEqual([{ id: 'claude-sonnet', capability: 'PROMPT_PLANNING_ONLY' }]);
});
```

Also test: duplicate IDs, whitespace IDs, IDs over 200 Unicode characters, more than 500 entries, non-array payloads, HTTP failures, API Key in thrown transport messages, userinfo/query/fragment URLs, private DNS answers, and redirects returned as 3xx.

- [ ] **Step 2: Run tests and confirm the catalog is absent**

Run: `npx vitest run tests/unit/cover/ai-model-catalog.test.ts tests/adversarial/network-assets.test.ts`

Expected: FAIL with module-not-found for `ai-model-catalog`.

- [ ] **Step 3: Implement exact provider types and endpoint joining**

```ts
export interface AiModelCatalogRequest {
  protocol: AiProviderProtocol;
  baseUrl: string;
  apiKey: string;
  signal?: AbortSignal;
}

export interface AiModelOption {
  id: string;
  capability: 'IMAGE_UNVERIFIED' | 'PROMPT_PLANNING_ONLY';
}

export interface AiModelCatalogPort {
  list(request: Readonly<AiModelCatalogRequest>): Promise<readonly Readonly<AiModelOption>[]>;
}
```

`providerEndpoint(baseUrl, 'models')` must require HTTPS, reject username/password/search/hash, remove trailing slashes, and produce exactly `/v1/models` whether the configured base is `https://host` or `https://host/v1`. Do not follow 3xx responses.

- [ ] **Step 4: Implement bounded parsing and sanitized failures**

Accept only object payloads whose `data` is an array. Read string `id`, trim, reject empty or over-200-code-point IDs, deduplicate with `Set`, sort using `localeCompare`, take 500, freeze each option and the array. Wrap all errors in `AiModelCatalogError` with stable codes:

```ts
type AiModelCatalogErrorCode =
  | 'AI_PROVIDER_URL_INVALID'
  | 'AI_PROVIDER_KEY_MISSING'
  | 'AI_MODEL_LIST_REJECTED'
  | 'AI_MODEL_LIST_INVALID'
  | 'AI_MODEL_LIST_FAILED';
```

Error messages may contain HTTP status but never response body, headers, URL credentials, or API Key.

- [ ] **Step 5: Run catalog and adversarial tests**

Run: `npx vitest run tests/unit/cover/ai-model-catalog.test.ts tests/adversarial/network-assets.test.ts tests/unit/wechat/pinned-node-http-transport.test.ts`

Expected: PASS with localhost/private targets blocked before any HTTP request.

- [ ] **Step 6: Scan and commit model discovery**

```bash
npm run scan:secrets
git add src/cover/ai-provider.ts src/cover/ai-model-catalog.ts tests/unit/cover/ai-model-catalog.test.ts tests/adversarial/network-assets.test.ts
git commit -m "feat(cover): discover provider models safely"
```

---

### Task 5: Isolate AI provider configuration and old-key reuse

**Files:**
- Create: `src/settings/ai-service-settings.ts`
- Create: `tests/unit/settings/ai-service-settings.test.ts`

**Interfaces:**
- Consumes: `PluginSettings`, `SecretStore` image key methods, and `AiModelCatalogPort` from Task 4.
- Produces: `AiServiceSettingsService.refreshModels()` and `save()` used by Task 6.

- [ ] **Step 1: Write failing host-isolation and refresh tests**

```ts
it('reuses the stored key only for the unchanged protocol and normalized host', async () => {
  const storedCredential = ['SYNTHETIC', 'STORED', 'CREDENTIAL'].join('_');
  secrets.set('imageApiKey', storedCredential);
  await service.refreshModels({
    protocol: 'openai-compatible', baseUrl: 'https://images.example.test/v1/', apiKey: '',
  });
  expect(catalog.list).toHaveBeenCalledWith(expect.objectContaining({
    baseUrl: 'https://images.example.test/v1', apiKey: storedCredential,
  }));
});

it('never sends an old key to a changed protocol or host', async () => {
  await expect(service.refreshModels({
    protocol: 'anthropic', baseUrl: 'https://api.anthropic.com', apiKey: '',
  })).rejects.toMatchObject({ code: 'AI_PROVIDER_NEW_KEY_REQUIRED' });
  expect(catalog.list).not.toHaveBeenCalled();
});

it('keeps the saved model when refresh fails', async () => {
  catalog.list.mockRejectedValue(new Error('synthetic provider failure'));
  await expect(service.refreshModels(currentInput)).rejects.toBeDefined();
  expect(settings.current.imageApiModel).toBe('saved-image-model');
});
```

- [ ] **Step 2: Run tests and verify the settings service is missing**

Run: `npx vitest run tests/unit/settings/ai-service-settings.test.ts`

Expected: FAIL with module-not-found for `ai-service-settings`.

- [ ] **Step 3: Implement explicit pending-input operations**

```ts
export interface AiServiceInput {
  protocol: AiProviderProtocol;
  baseUrl: string;
  model: string;
  apiKey: string;
}

export class AiServiceSettingsService {
  async refreshModels(input: Readonly<Omit<AiServiceInput, 'model'>>): Promise<readonly Readonly<AiModelOption>[]>;
  async save(input: Readonly<AiServiceInput>): Promise<Readonly<PluginSettings>>;
}
```

Normalize base URLs through the same exported provider URL validator as Task 4. `refreshModels` chooses the non-empty pending Key; otherwise reuse stored `imageApiKey` only when protocol and normalized URL match persisted settings. `save` requires the selected model to be one of the latest in-memory refresh results for the same protocol/base URL; if no refresh exists, allow the already persisted model only when protocol/base URL are unchanged.

- [ ] **Step 4: Make save atomic from the user's perspective**

When protocol/base URL changes, require a non-empty new Key. Capture the previous Key in memory, write the new Key to SecretStorage, then persist protocol/base/model. If settings persistence fails, restore the previous Key or clear the slot when no previous Key existed; never log either value. When protocol/base URL is unchanged and Key is empty, preserve the stored Key.

- [ ] **Step 5: Run focused service tests**

Run: `npx vitest run tests/unit/settings/ai-service-settings.test.ts tests/unit/settings/settings-store.test.ts tests/unit/settings/secret-store.test.ts`

Expected: PASS; catalog results remain memory-only and no failure changes persisted model selection.

- [ ] **Step 6: Scan and commit AI settings isolation**

```bash
npm run scan:secrets
git add src/settings/ai-service-settings.ts tests/unit/settings/ai-service-settings.test.ts
git commit -m "feat(settings): isolate ai provider credentials"
```

---

### Task 6: Add protocol, custom endpoint, model refresh, and dropdown UI

**Files:**
- Modify: `src/settings/settings-tab.ts`
- Modify: `tests/mocks/obsidian.ts`
- Modify: `tests/unit/settings/settings-tab.test.ts`
- Modify: `styles.css`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `AiServiceSettingsService` from Task 5 and account UI from Task 3.
- Produces: approved “智能封面服务” UI with no passive network traffic.

- [ ] **Step 1: Extend the Obsidian mock only for used controls**

Add `DropdownComponent` with `selectEl`, `addOption`, `setValue`, `onChange`, and `setDisabled`; add `Setting.addDropdown`. Match Obsidian chaining semantics and dispatch `change` from `selectEl` in tests.

- [ ] **Step 2: Write failing UI interaction tests**

```ts
it('does not fetch models until the user clicks 获取模型', () => {
  tab.display();
  expect(ai.refreshModels).not.toHaveBeenCalled();
  change('[data-testid="ai-base-url"]', 'https://images.example.test/v1');
  expect(ai.refreshModels).not.toHaveBeenCalled();
});

it('renders refreshed models in a dropdown and shows Anthropic capability truthfully', async () => {
  ai.refreshModels.mockResolvedValue([
    Object.freeze({ id: 'claude-sonnet', capability: 'PROMPT_PLANNING_ONLY' }),
  ]);
  click('[data-testid="ai-refresh-models"]');
  await settlePromises();
  expect(options('[data-testid="ai-model"]')).toEqual(['claude-sonnet']);
  expect(tab.containerEl.textContent).toContain('只支持封面策划，未提供图片输出');
});

it('saves only the selected refreshed model through one explicit action', async () => {
  await refreshOpenAiModels();
  select('[data-testid="ai-model"]', 'image-model');
  click('[data-testid="ai-save"]');
  expect(ai.save).toHaveBeenCalledWith({
    protocol: 'openai-compatible',
    baseUrl: 'https://images.example.test/v1',
    model: 'image-model',
    apiKey: '',
  });
});
```

Also assert: refresh button disables while pending; failure retains old dropdown selection; API Key input remains empty; save rejects changed host without new Key; model list and API Key never appear in serialized settings snapshot.

- [ ] **Step 3: Render one cohesive AI service section**

Use exact labels `接口协议`, `服务地址`, `服务 API Key`, `可用模型`, buttons `获取模型`/`刷新模型` and `保存服务配置`, and a model dropdown. Keep fetched models in the `WeChatWorkbenchSettingTab` instance until display closes or protocol/base URL changes. Do not call `display()` after a successful refresh because that would discard the in-memory list.

- [ ] **Step 4: Wire service dependencies in `main.ts`**

Construct one `AiModelCatalogService(providerHttp)` and one `AiServiceSettingsService(settingsAccess, image-key port, catalog)`. Inject them into `WeChatWorkbenchSettingTab`. Use the existing `PinnedNodeHttpTransport` wrapped by the existing timeout transport; do not add a second network implementation.

- [ ] **Step 5: Apply responsive Obsidian-native styling**

Use scoped classes and variables only. At widths under 520px, stack the model dropdown and refresh button. Status copy must wrap, controls remain at least 32px high, and no global `input`, `select`, or `button` selector may be added.

- [ ] **Step 6: Run settings and visual tests**

Run: `npx vitest run tests/unit/settings/settings-tab.test.ts tests/unit/settings/ai-service-settings.test.ts tests/unit/cover/ai-model-catalog.test.ts tests/visual/workbench-visual.test.ts`

Expected: PASS with zero model-list calls during `display()`.

- [ ] **Step 7: Scan and commit AI service UI**

```bash
npm run scan:secrets
git add src/settings/settings-tab.ts src/main.ts tests/mocks/obsidian.ts tests/unit/settings/settings-tab.test.ts styles.css
git commit -m "feat(settings): add provider model picker"
```

---

### Task 7: Replace the local account header action with a fixed external link

**Files:**
- Create: `src/ui/external-browser.ts`
- Create: `tests/unit/ui/external-browser.test.ts`
- Modify: `src/ui/workbench-view.ts`
- Modify: `src/settings/settings-tab.ts`
- Modify: `tests/unit/ui/workbench-view.test.ts`
- Modify: `tests/unit/settings/settings-tab.test.ts`
- Modify: `src/main.ts`
- Modify: `styles.css`

**Interfaces:**
- Consumes: Electron `shell.openExternal` behind an injected adapter.
- Produces: `ExternalBrowserPort`, `openWeChatBackend()`, and a workbench header action that cannot be redirected by settings/user content.

- [ ] **Step 1: Write failing fixed-URL and view tests**

```ts
it('opens only the compiled WeChat backend URL', async () => {
  const open = vi.fn(async () => undefined);
  await openWeChatBackend({ open });
  expect(open).toHaveBeenCalledWith('https://mp.weixin.qq.com/');
});

it('renders an external-link action instead of account settings', async () => {
  await view.onOpen();
  const action = view.contentEl.querySelector<HTMLButtonElement>('[data-testid="wechat-backend"]');
  expect(action?.getAttribute('aria-label')).toBe('跳转到公众号后台');
  expect(action?.title).toBe('跳转到公众号后台');
  expect(action?.dataset.icon).toBe('external-link');
  expect(view.contentEl.querySelector('[data-testid="account-settings"]')).toBeNull();
});
```

- [ ] **Step 2: Run tests and verify the old account icon fails**

Run: `npx vitest run tests/unit/ui/external-browser.test.ts tests/unit/ui/workbench-view.test.ts`

Expected: FAIL because the view still renders `circle-user-round` and calls `openSettings`.

- [ ] **Step 3: Implement the fixed external browser boundary**

```ts
export const WECHAT_MP_BACKEND_URL = 'https://mp.weixin.qq.com/' as const;

export interface ExternalBrowserPort {
  open(url: string): Promise<void>;
}

export async function openWeChatBackend(port: ExternalBrowserPort): Promise<void> {
  await port.open(WECHAT_MP_BACKEND_URL);
}
```

Production wiring wraps Electron `shell.openExternal`. Catch errors in the injected no-argument view action and show exactly `无法打开公众号后台，请在浏览器访问 mp.weixin.qq.com。`; never display the Electron error.

- [ ] **Step 4: Replace view constructor and icon wiring**

Change the third constructor parameter to `private readonly openBackend: () => Promise<void>`. Render a `clickable-icon` with `setIcon(action, 'external-link')`, exact `title` and `aria-label`, and call `void this.openBackend()` on click. Keep `AccountSettingsModal` and its tests/files present but remove imports/instantiation from `main.ts`.

Inject the same no-argument action into `WeChatWorkbenchSettingTab` for its IP-whitelist row. The settings button text is `打开公众号后台`; it must not accept a URL argument.

- [ ] **Step 5: Run view and external-browser tests**

Run: `npx vitest run tests/unit/ui/external-browser.test.ts tests/unit/ui/workbench-view.test.ts tests/unit/settings/settings-tab.test.ts tests/unit/ui/account-settings-modal.test.ts`

Expected: PASS; legacy modal tests remain green even though production no longer wires the modal.

- [ ] **Step 6: Scan and commit the header action**

```bash
npm run scan:secrets
git add src/ui/external-browser.ts tests/unit/ui/external-browser.test.ts src/ui/workbench-view.ts src/settings/settings-tab.ts tests/unit/ui/workbench-view.test.ts tests/unit/settings/settings-tab.test.ts src/main.ts styles.css
git commit -m "feat(ui): link to wechat backend"
```

---

### Task 8: Remove source-link editing and adopt Obsidian accent typography

**Files:**
- Modify: `src/domain/article.ts`
- Modify: `src/settings/article-settings.ts`
- Modify: `src/ui/workbench-publish-settings.ts`
- Modify: `src/ui/workbench-view.ts`
- Modify: `styles.css`
- Modify: `tests/unit/settings/article-settings.test.ts`
- Modify: `tests/unit/ui/workbench-publish-settings.test.ts`
- Modify: `tests/unit/ui/workbench-view.test.ts`
- Modify: `tests/visual/workbench-visual.test.ts`
- Modify: `tests/integration/workbench.test.ts`

**Interfaces:**
- Consumes: existing `ArticleMetadata.contentSourceUrl` for backward-compatible rendering/publishing.
- Produces: `EditableArticleSettings` containing only `title`, `author`, and `digest`; larger tabs/section headings using Obsidian variables.

- [ ] **Step 1: Write failing preservation and DOM tests**

```ts
it('does not render or submit the source URL field', () => {
  renderPublishSettings(host, stateWithLegacySourceUrl, actions);
  expect(host.querySelector('[data-testid="settings-source-url"]')).toBeNull();
  click('[data-testid="settings-save"]');
  expect(actions.saveArticle).toHaveBeenCalledWith({
    title: 'Updated title', author: 'anightmonarch', digest: 'Updated digest',
  });
});

it('preserves legacy content_source_url while saving editable fields', async () => {
  const frontmatter = { content_source_url: 'https://example.test/source', custom: 'keep' };
  await service.update(file, { title: 'Title', author: 'anightmonarch', digest: 'Digest' });
  expect(frontmatter).toMatchObject({
    content_source_url: 'https://example.test/source', custom: 'keep', title: 'Title',
  });
});
```

- [ ] **Step 2: Run focused tests and confirm the old source field fails**

Run: `npx vitest run tests/unit/settings/article-settings.test.ts tests/unit/ui/workbench-publish-settings.test.ts tests/visual/workbench-visual.test.ts`

Expected: FAIL because `EditableArticleSettings` still requires `contentSourceUrl`, the UI renders it, and CSS prioritizes `--color-green`.

- [ ] **Step 3: Narrow editable settings without changing article metadata**

```ts
export interface EditableArticleSettings {
  title: string;
  author: string;
  digest: string;
}
```

Remove only the `content_source_url` mutation from `ArticleSettingsService.update`. Keep `ArticleMetadata.contentSourceUrl`, snapshot parsing, preflight, publish-content hashing, and WeChat payload behavior unchanged so old source URLs continue to publish.

- [ ] **Step 4: Remove the field and update error copy**

Delete creation of `settings-source-url` from `appendArticleEditor`. Change `publishPreparationMessage` article-settings copy to mention `标题、作者和摘要`, not `原文链接`. Do not delete the Frontmatter field from any note.

- [ ] **Step 5: Apply exact theme and typography rules**

```css
.wechat-workbench {
  --wechat-accent: var(--interactive-accent);
}

.wechat-workbench__tabs button {
  font-size: var(--font-ui-medium);
}

.wechat-workbench__tabs button.is-active {
  border-bottom-color: var(--interactive-accent);
  color: var(--text-normal);
}

.wechat-workbench__settings-section h2 {
  color: var(--text-normal);
  font-size: var(--font-ui-large);
  font-weight: var(--font-semibold);
}
```

Remove all workbench-shell preference for `--color-green`. Keep the white preview sheet unchanged.

- [ ] **Step 6: Run unit, integration, and visual tests**

Run: `npx vitest run tests/unit/settings/article-settings.test.ts tests/unit/ui/workbench-publish-settings.test.ts tests/unit/ui/workbench-view.test.ts tests/integration/workbench.test.ts tests/visual/workbench-visual.test.ts`

Expected: PASS; legacy source URL survives saving and still appears in immutable artifact/publish payload tests.

- [ ] **Step 7: Scan and commit article UI changes**

```bash
npm run scan:secrets
git add src/domain/article.ts src/settings/article-settings.ts src/ui/workbench-publish-settings.ts src/ui/workbench-view.ts styles.css tests/unit/settings/article-settings.test.ts tests/unit/ui/workbench-publish-settings.test.ts tests/unit/ui/workbench-view.test.ts tests/visual/workbench-visual.test.ts tests/integration/workbench.test.ts
git commit -m "feat(ui): simplify publish settings"
```

---

### Task 9: Replace legacy cover choices with dynamic first-image preparation

**Files:**
- Modify: `src/cover/cover-types.ts`
- Modify: `src/cover/cover-service.ts`
- Modify: `src/cover/cover-workflow.ts`
- Modify: `src/ui/workbench-publish-settings.ts`
- Modify: `src/ui/workbench-view.ts`
- Modify: `src/main.ts`
- Modify: `tests/unit/cover/cover-service.test.ts`
- Modify: `tests/unit/cover/cover-workflow.test.ts`
- Modify: `tests/unit/ui/workbench-publish-settings.test.ts`
- Modify: `tests/unit/ui/workbench-view.test.ts`
- Modify: `tests/adversarial/network-assets.test.ts`

**Interfaces:**
- Consumes: ordered `RenderArtifact.assets`, `RemoteImageFetcher`, local vault reads, `ElectronImagePort`, and Frontmatter mutation.
- Produces: a picker model whose only visible sources are `first-image`, `upload`, and `ai`; `PreparedCover` with explicit persistence semantics; `CoverWorkflow.prepareFirstImage()`.

- [ ] **Step 1: Write failing source-order and exclusion tests**

```ts
it('chooses the first ordinary local or remote image in artifact order', () => {
  const first = service.firstImage(artifactWith([
    asset('generated-math', 'math.png'),
    asset('remote-image', 'https://cdn.example.test/first.png'),
    asset('local-image', 'assets/second.png'),
  ]));
  expect(first).toEqual({ kind: 'remote-image', source: 'https://cdn.example.test/first.png' });
});

it('exposes exactly first image, upload, and ai choices', () => {
  const model = workflow.model(snapshot, artifact);
  expect(model.options.map(option => option.kind)).toEqual(['first-image', 'upload', 'ai']);
  expect(model.options.map(option => option.label)).toEqual([
    '文章首图（默认）', '上传本地图片', '智能生成封面',
  ]);
});
```

Add tests for no ordinary image, remote fetch only after `prepareFirstImage`, local read without network, MIME validation via `RemoteImageFetcher`, and `confirm()` clearing `frontmatter.cover` for dynamic first-image mode while preserving unknown fields.

Add publish-settings presentation tests: explicit cover label, `文章首图（默认）`, `文章没有可用首图`, safe local thumbnail, and remote-first-image placeholder with zero fetch calls.

- [ ] **Step 2: Run cover tests and verify legacy options fail**

Run: `npx vitest run tests/unit/cover/cover-service.test.ts tests/unit/cover/cover-workflow.test.ts tests/adversarial/network-assets.test.ts`

Expected: FAIL because current code exposes article/default paths and searches only `local-image`.

- [ ] **Step 3: Define explicit prepared-cover persistence**

```ts
export type VisibleCoverKind = 'first-image' | 'upload' | 'ai';

export interface PreparedCover {
  source: 'dynamic-first-image' | 'local-upload' | 'ai-generated';
  persistence: 'CLEAR_EXPLICIT_COVER' | 'SET_EXPLICIT_COVER';
  notePath: string;
  contextHash: string;
  vaultPath: string | null;
  bytes: Uint8Array;
  mimeType: 'image/png';
  contentHash: string;
  previewDataUrl: string;
}
```

`CoverPickerModel.options` contains exactly three immutable options. `first-image` is disabled with `文章没有可用首图` when no local/remote asset exists. `upload` is always enabled. `ai` uses provider readiness from Task 11.

Extend `renderPublishSettings` with a read-only cover presentation produced by `WeChatWorkbenchView`. Add an injected `WorkbenchCoverPreviewPort` that converts only an already-resolved Vault `TFile` into `app.vault.getResourcePath(file)`; it returns `null` for remote images and never performs HTTP. Render the actual thumbnail when that safe local URL exists, otherwise render the exact remote/no-image placeholder. Do not place Vault paths or resource URLs in visible text.

- [ ] **Step 4: Implement local/remote first-image preparation**

For `local-image`, resolve/read the Vault path. For `remote-image`, call injected `RemoteGeneratedImagePort.fetch()` only inside `prepareFirstImage`. Process bytes to PNG, keep the preview in memory, set `vaultPath: null`, and do not write Frontmatter before confirmation. `confirm()` must verify note path and context hash; for `CLEAR_EXPLICIT_COVER`, delete only `frontmatter.cover`.

- [ ] **Step 5: Run focused cover and security tests**

Run: `npx vitest run tests/unit/cover/cover-service.test.ts tests/unit/cover/cover-workflow.test.ts tests/unit/ui/workbench-publish-settings.test.ts tests/unit/ui/workbench-view.test.ts tests/adversarial/network-assets.test.ts`

Expected: PASS; passive `model()` performs zero file/network operations and generated assets are excluded.

- [ ] **Step 6: Scan and commit first-image behavior**

```bash
npm run scan:secrets
git add src/cover/cover-types.ts src/cover/cover-service.ts src/cover/cover-workflow.ts src/ui/workbench-publish-settings.ts src/ui/workbench-view.ts src/main.ts tests/unit/cover/cover-service.test.ts tests/unit/cover/cover-workflow.test.ts tests/unit/ui/workbench-publish-settings.test.ts tests/unit/ui/workbench-view.test.ts tests/adversarial/network-assets.test.ts
git commit -m "feat(cover): default to article first image"
```

---

### Task 10: Replace Vault path input with the native file picker

**Files:**
- Modify: `src/cover/cover-workflow.ts`
- Modify: `src/ui/cover-picker-modal.ts`
- Modify: `tests/integration/cover-ui.test.ts`
- Modify: `tests/unit/cover/cover-workflow.test.ts`
- Modify: `tests/unit/cover/electron-image-port.test.ts`
- Modify: `styles.css`

**Interfaces:**
- Consumes: `File.arrayBuffer()`, existing 20 MiB decode boundary, image magic-byte detection, `ElectronImagePort`, and `CoverStorage`.
- Produces: `CoverWorkflow.prepareUpload(file, bytes)` and file-picker UI with no path text box.

- [ ] **Step 1: Write failing upload-session and modal tests**

```ts
it('opens one hidden file input for 上传本地图片', () => {
  modal.open();
  const input = modal.contentEl.querySelector<HTMLInputElement>('input[type="file"]');
  expect(input?.accept).toBe('image/png,image/jpeg,image/webp');
  expect(input?.multiple).toBe(false);
  expect(modal.contentEl.querySelector('input[type="text"]')).toBeNull();
});

it('keeps the prior selection when the file chooser is cancelled', async () => {
  await session.selectFirstImage();
  await session.selectUpload(null);
  expect(session.selected?.source).toBe('dynamic-first-image');
});
```

Also test empty bytes, forged `.png` filename with non-image bytes, more than 20 MiB, decode failure, successful 2.35:1 PNG processing, and no Frontmatter mutation until confirm.

- [ ] **Step 2: Run upload tests and verify the path UI fails**

Run: `npx vitest run tests/integration/cover-ui.test.ts tests/unit/cover/cover-workflow.test.ts tests/unit/cover/electron-image-port.test.ts`

Expected: FAIL because the modal renders a Vault path text box and `selectVaultPath`.

- [ ] **Step 3: Add byte-based upload preparation**

```ts
async prepareUpload(
  file: VaultFileRef,
  bytes: Uint8Array,
  contextHash: string,
): Promise<Readonly<PreparedCover>> {
  if (bytes.byteLength === 0) throw new CoverPathError('Cover upload is empty.');
  if (detectImageMime(bytes) === null) throw new CoverPathError('Cover upload is not a supported image.');
  return this.processStoreAndPrepare(file, bytes, 'local-upload', contextHash);
}
```

`processStoreAndPrepare` uses `ElectronImagePort.process`, saves under `.wechat-workbench/covers/<note-name>/`, returns `SET_EXPLICIT_COVER`, and does not persist the OS filename or path.

- [ ] **Step 4: Replace modal path controls with a hidden file input**

Create one input per modal render, set exact `accept`, and trigger `.click()` from the visible option. On `change`, read only `files?.[0]?.arrayBuffer()`, convert to `Uint8Array`, and call `session.selectUpload(bytes)`. If no file exists, return without clearing selection or showing an error. Disable all source actions while the session is busy.

- [ ] **Step 5: Run upload and responsive tests**

Run: `npx vitest run tests/integration/cover-ui.test.ts tests/unit/cover/cover-workflow.test.ts tests/unit/cover/electron-image-port.test.ts tests/visual/workbench-visual.test.ts`

Expected: PASS; no “Vault 内图片路径” or “使用本地图片” text remains in the cover modal.

- [ ] **Step 6: Scan and commit native upload**

```bash
npm run scan:secrets
git add src/cover/cover-workflow.ts src/ui/cover-picker-modal.ts tests/integration/cover-ui.test.ts tests/unit/cover/cover-workflow.test.ts tests/unit/cover/electron-image-port.test.ts styles.css
git commit -m "feat(cover): upload covers with file picker"
```

---

### Task 11: Gate AI generation by provider capability and disclose protocol

**Files:**
- Modify: `src/cover/cover-generator.ts`
- Modify: `src/cover/openai-image-generator.ts`
- Modify: `src/cover/cover-workflow.ts`
- Modify: `src/ui/ai-cover-confirmation.ts`
- Modify: `src/ui/cover-picker-modal.ts`
- Modify: `src/main.ts`
- Modify: `tests/unit/cover/openai-image-generator.test.ts`
- Modify: `tests/unit/cover/cover-workflow.test.ts`
- Modify: `tests/unit/ui/ai-cover-confirmation.test.ts`
- Modify: `tests/integration/cover-provider.test.ts`
- Modify: `tests/integration/cover-ui.test.ts`

**Interfaces:**
- Consumes: saved `imageApiProtocol/baseUrl/model`, `imageApiKey`, `AiModelOption.capability`, and existing OpenAI-compatible image generation.
- Produces: protocol-aware disclosure and hard Anthropic image-generation block.

- [ ] **Step 1: Write failing capability and disclosure tests**

```ts
it('disables AI image generation for Anthropic without making a request', async () => {
  settings.current.imageApiProtocol = 'anthropic';
  const model = workflow.model(snapshot, artifact);
  expect(model.options.find(option => option.kind === 'ai')).toMatchObject({
    enabled: false,
    disabledReason: 'Anthropic 当前只支持封面策划，未提供图片输出。',
  });
  await expect(workflow.prepareAi(file, artifact)).rejects.toMatchObject({
    code: 'AI_PROVIDER_IMAGE_UNSUPPORTED',
  });
  expect(generator.generate).not.toHaveBeenCalled();
});

it('shows protocol, endpoint, model, payload fields, and cost before generation', () => {
  const disclosure = buildAiCoverDisclosure(source, {
    imageApiProtocol: 'openai-compatible',
    imageApiBaseUrl: 'https://images.example.test/v1',
    imageApiModel: 'image-model',
  });
  expect(disclosure).toMatchObject({
    protocol: 'OpenAI 兼容', baseUrl: 'https://images.example.test/v1', model: 'image-model',
  });
});
```

Also assert confirmation cancel makes zero network calls, OpenAI-compatible generation reads the latest saved model at click time, provider errors do not clear prior cover, and prompt injection text remains quoted as untrusted source material.

- [ ] **Step 2: Run AI tests and verify protocol is absent**

Run: `npx vitest run tests/unit/cover/openai-image-generator.test.ts tests/unit/cover/cover-workflow.test.ts tests/unit/ui/ai-cover-confirmation.test.ts tests/integration/cover-provider.test.ts tests/integration/cover-ui.test.ts`

Expected: FAIL because requests/disclosures contain no provider protocol and Anthropic is not blocked.

- [ ] **Step 3: Extend generation settings without adding an Anthropic image generator**

```ts
export interface AiCoverGenerationRequest {
  protocol: AiProviderProtocol;
  baseUrl: string;
  model: string;
  apiKey: string;
  title: string;
  digest: string;
  bodyExcerpt: string;
  signal?: AbortSignal;
}
```

`OpenAiImageGenerator.generate` must reject any protocol other than `openai-compatible` before building headers. Do not implement a Messages API call or SVG fallback. Keep response MIME, base64 size, remote URL, timeout, and redaction checks unchanged.

- [ ] **Step 4: Update workflow readiness and disclosure**

AI option is enabled only when protocol is `openai-compatible`, normalized base URL/model exist, and SecretStorage has `imageApiKey`. The disabled-reason priority is: Anthropic capability, missing address, missing model, missing Key. Add `protocol` to disclosure rows before service address.

- [ ] **Step 5: Run AI unit and integration tests**

Run: `npx vitest run tests/unit/cover/openai-image-generator.test.ts tests/unit/cover/cover-workflow.test.ts tests/unit/ui/ai-cover-confirmation.test.ts tests/integration/cover-provider.test.ts tests/integration/cover-ui.test.ts`

Expected: PASS; Anthropic discovery remains available but image generation makes zero Anthropic requests.

- [ ] **Step 6: Scan and commit AI capability behavior**

```bash
npm run scan:secrets
git add src/cover/cover-generator.ts src/cover/openai-image-generator.ts src/cover/cover-workflow.ts src/ui/ai-cover-confirmation.ts src/ui/cover-picker-modal.ts src/main.ts tests/unit/cover/openai-image-generator.test.ts tests/unit/cover/cover-workflow.test.ts tests/unit/ui/ai-cover-confirmation.test.ts tests/integration/cover-provider.test.ts tests/integration/cover-ui.test.ts
git commit -m "feat(cover): gate ai generation by capability"
```

---

### Task 12: Make `CoverWorkflow` the single publish-cover resolver

**Files:**
- Modify: `src/cover/cover-workflow.ts`
- Modify: `src/publish/publish-workflow.ts`
- Modify: `src/publish/publish-types.ts`
- Modify: `src/main.ts`
- Modify: `tests/unit/publish/publish-workflow.test.ts`
- Modify: `tests/unit/cover/cover-workflow.test.ts`
- Modify: `tests/integration/workbench.test.ts`
- Modify: `tests/adversarial/publish-concurrency.test.ts`

**Interfaces:**
- Consumes: explicit Frontmatter cover or ordered first local/remote image, current immutable artifact, local/remote image security, image processing/storage.
- Produces: `PublishCoverResolverPort.prepareForPublish()` and a frozen `PublishCommand.cover` with no duplicated path resolution.

- [ ] **Step 1: Write failing resolver and frozen-command tests**

```ts
it('prepares an explicit cover before falling back to dynamic first image', async () => {
  const explicitSnapshot = Object.freeze({
    ...snapshot,
    metadata: Object.freeze({ ...snapshot.metadata, cover: 'assets/explicit.png' }),
  });
  const prepared = await workflow.prepareForPublish(file, explicitSnapshot, artifact);
  expect(prepared.source).toBe('explicit');
  expect(remote.fetch).not.toHaveBeenCalled();
});

it('freezes prepared remote first-image bytes into the publish command', async () => {
  resolver.prepareForPublish.mockResolvedValue(preparedRemoteCover);
  const prepared = await publish.prepare(file, artifact);
  mutateRemoteFixture();
  expect(prepared.command.cover.bytes).toEqual(preparedRemoteCover.bytes);
  expect(prepared.command.coverHash).toBe(preparedRemoteCover.contentHash);
});
```

Also cover no-image blocking, MIME mismatch, current explicit cover retained until user selects dynamic first image, association mismatch before remote fetch, unresolved CREATE receipt before cover preparation, and remote failure leaving no draft side effect.

- [ ] **Step 2: Run publish and cover tests and verify duplicate resolution fails**

Run: `npx vitest run tests/unit/publish/publish-workflow.test.ts tests/unit/cover/cover-workflow.test.ts tests/adversarial/publish-concurrency.test.ts`

Expected: FAIL because `PublishWorkflow` still reads cover paths itself and cannot prepare remote first images.

- [ ] **Step 3: Add the resolver port and implementation**

```ts
export interface PreparedPublishCover {
  source: 'explicit' | 'first-local-image' | 'first-remote-image';
  vaultPath: string;
  bytes: Uint8Array;
  mimeType: 'image/png';
  contentHash: string;
}

export interface PublishCoverResolverPort {
  prepareForPublish(
    file: VaultFileRef,
    snapshot: Readonly<NoteSnapshot>,
    artifact: Readonly<RenderArtifact>,
  ): Promise<Readonly<PreparedPublishCover>>;
}
```

Resolve explicit Frontmatter first. Otherwise prepare the first ordinary local/remote asset, process to PNG, store in the generated-cover directory, and return immutable copied bytes. Verify `artifact.source.vaultPath`, snapshot path, source hash/context hash, and current file identity before returning.

- [ ] **Step 4: Remove cover-path logic from `PublishWorkflow`**

Replace `files` and `defaultCoverStrategy` consumption with injected `PublishCoverResolverPort`. Preserve the ordering of account/receipt/association guards before potentially networked cover preparation. Build `PublishCommand.cover`, `coverPath`, `coverHash`, and dialog label solely from `PreparedPublishCover`.

- [ ] **Step 5: Wire the shared `CoverWorkflow` instance in `main.ts`**

Pass the same workflow used by `CoverPickerModal` into `PublishWorkflow`. Keep the coordinator's existing `currentCover` stale-readback callback: explicit covers continue to resolve the current Frontmatter path, while dynamic first-image commands read the resolver's stored `command.coverPath`; the existing `currentPayloadHash` check detects article/asset changes.

- [ ] **Step 6: Run publish, concurrency, and integration tests**

Run: `npx vitest run tests/unit/publish/publish-workflow.test.ts tests/unit/cover/cover-workflow.test.ts tests/adversarial/publish-concurrency.test.ts tests/integration/workbench.test.ts`

Expected: PASS; remote timeout/error never creates a draft and frozen bytes do not change after article edits.

- [ ] **Step 7: Scan and commit publish-cover unification**

```bash
npm run scan:secrets
git add src/cover/cover-workflow.ts src/publish/publish-workflow.ts src/publish/publish-types.ts src/main.ts tests/unit/publish/publish-workflow.test.ts tests/unit/cover/cover-workflow.test.ts tests/integration/workbench.test.ts tests/adversarial/publish-concurrency.test.ts
git commit -m "refactor(publish): unify cover preparation"
```

---

### Task 13: Run full gates and record fixed-Vault desktop acceptance

**Files:**
- Create: `docs/verification/account-cover-ui-refinement.md`
- No production files are planned in this task. A failure returns execution to the owning Task 1–12, where a failing regression test is added before the fix.

**Interfaces:**
- Consumes: completed Tasks 1–12.
- Produces: reproducible automatic, real desktop, and real WeChat evidence with blockers separated from passes.

- [ ] **Step 1: Create the evidence ledger before running acceptance**

```markdown
# Account, Cover, and UI Refinement Verification

## Environment
- Date:
- Commit:
- Obsidian version:
- Vault: `$HOME/workspace/Github/wechat-workbench-test-vault`

## Automatic gates
| Command | Result | Evidence |
|---|---|---|

## Desktop UI
| Scenario | Result | Evidence |
|---|---|---|

## Real WeChat
| Scenario | Result | Evidence |
|---|---|---|

## Blockers
- None recorded at verification start.
```

Replace blank values with actual command output, timestamps, screenshot filenames, and blockers during execution; never enter credentials, complete AppID, access token, API Key, media ID, or unredacted WeChat responses.

- [ ] **Step 2: Run the complete automatic gate in this order**

```bash
npm test
npm run lint
npm run typecheck
npm run build
npm run verify:release
npm run scan:secrets
WECHAT_WORKBENCH_TEST_VAULT=$HOME/workspace/Github/wechat-workbench-test-vault npm run sync:test-vault
```

Expected: every command exits `0`. Record any existing baseline failure as a blocker with exact command/error; do not mark it passed.

- [ ] **Step 3: Run synthetic desktop acceptance in the fixed Vault**

Verify and record all of these independently:

1. Settings account section is compact; no middle blank area; AppSecret never refills.
2. Success/failure verification shows state/time and restores buttons; disconnect keeps name/AppID and article state.
3. Setting display/input causes no network; “获取模型” sends one request with the selected protocol.
4. OpenAI-compatible model list populates dropdown; Anthropic shows planning-only and disables image generation.
5. Changing protocol/host without new Key sends no request to the new host.
6. Workbench icon tooltip says `跳转到公众号后台` and opens only `https://mp.weixin.qq.com/`.
7. Publish settings has no source-link field and preserves legacy `content_source_url`.
8. Cover modal shows exactly article first image, native upload, and intelligent generation.
9. Native upload opens the file manager and stores a cropped PNG in the test Vault.
10. Local and remote first-image modes match the publish-prepared cover; passive preview does not fetch remote content.
11. Light, dark, and non-green accent themes render readable tabs/sections at 520px, 640px, and 720px.
12. No prototype review controls appear in Obsidian.

- [ ] **Step 4: Run real provider and WeChat checks only with isolated secrets**

Use SecretStorage in the fixed test Vault. Verify model discovery against one public HTTPS OpenAI-compatible test endpoint and Anthropic if credentials are available. Then verify real draft create, update, unchanged skip, and WeChat backend visual readback. If credentials/provider access are unavailable, mark only these rows `BLOCKED`; do not downgrade automatic or synthetic results and do not call the whole feature complete.

- [ ] **Step 5: Inspect the evidence for sensitive information before staging**

Run:

```bash
npm run scan:secrets
rg -n "(?:sk-|access[_-]?token|appsecret|api[_-]?key|media[_-]?id|wx[a-zA-Z0-9]{8,})" docs/verification/account-cover-ui-refinement.md
```

Expected: secret scan passes and `rg` returns no unredacted sensitive values. Generic labels such as `API Key` may remain only when no value follows them.

- [ ] **Step 6: Commit verification evidence**

```bash
git add docs/verification/account-cover-ui-refinement.md
git commit -m "test: verify account and cover refinement"
```

Do not commit screenshots containing unmasked account identifiers. Do not push, publish, deploy, or submit the community plugin.

---

## Plan Self-Review Checklist

- [ ] Every requirement in `docs/superpowers/specs/2026-08-22-account-cover-ui-refinement-design.md` maps to Tasks 1–13.
- [ ] Every production behavior begins with a failing test and a focused failure command.
- [ ] Task interfaces use consistent names: `AccountConnectionService`, `AiServiceSettingsService`, `AiModelCatalogPort`, `PreparedCover`, `PublishCoverResolverPort`, and `ExternalBrowserPort`.
- [ ] No task deletes legacy files, fields, settings, or Git history.
- [ ] No task sends an old provider Key to a changed protocol/host.
- [ ] No task treats Anthropic as an image-output provider.
- [ ] No task loads or validates the development plugin in `commit_note`.
- [ ] Full automatic, desktop, and real-WeChat evidence remain separate terminal states.
