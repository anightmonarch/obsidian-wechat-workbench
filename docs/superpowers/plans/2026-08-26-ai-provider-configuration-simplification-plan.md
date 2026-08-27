# AI Provider Configuration Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pre-fill official provider Base URLs, remove advanced endpoint overrides, keep provider contracts fixed, and add local API-key visibility controls.

**Architecture:** Provider metadata is the sole source for supported mode, fixed request format, default Base URL, and derived endpoint path. Settings migration converts only standard historical endpoints to Base URLs; the settings UI reads the active key from SecretStorage only to render a password input and never persists it outside SecretStorage.

**Tech Stack:** TypeScript, Obsidian Plugin API, Vitest, SecretStorage.

## Global Constraints

- API keys only persist in Obsidian SecretStorage and never enter `data.json`, Frontmatter, logs, error details, fixtures, or evidence.
- Only Agnes supports image generation; DeepSeek remains text-only.
- Provider requests must use HTTPS public origins and fixed provider contracts.
- Build and desktop validation use `$HOME/workspace/Github/wechat-workbench-test-vault` only.

---

### Task 1: Canonical provider metadata and schema migration

**Files:**
- Modify: `src/settings/model.ts`
- Modify: `src/settings/settings-store.ts`
- Test: `tests/unit/settings/settings-store.test.ts`

**Interfaces:**
- Produces `providerBaseUrl(kind, provider): string` and `providerRequestFormat(kind, provider): AiRequestFormat`.
- Removes `endpointOverride` from `AiProviderProfile` and resolves only `baseUrl + fixed path`.

- [x] **Step 1: Write failing migration/default tests**

```ts
expect(defaultAiProviders().text.providers.deepseek.baseUrl).toBe('https://api.deepseek.com');
expect(defaultAiProviders().image.providers.agnes.baseUrl).toBe('https://apihub.agnes-ai.com/v1');
expect(loaded.aiProviders.text.providers.deepseek.baseUrl).toBe('https://api.deepseek.com');
expect(loaded.aiProviders.text.providers.deepseek.requestFormat).toBe('openai-chat-completions');
```

- [x] **Step 2: Run the tests and verify they fail because current defaults are blank and endpoint overrides remain active**

Run: `npx vitest run tests/unit/settings/settings-store.test.ts`

- [x] **Step 3: Implement provider metadata and v5-safe sanitization**

```ts
export function providerBaseUrl(kind: AiServiceKind, provider: AiProviderId): string {
  if (provider === 'deepseek') return 'https://api.deepseek.com';
  return 'https://apihub.agnes-ai.com/v1';
}
```

Normalize request format from the supported mode/provider pair, derive standard legacy Base URLs by stripping `/chat/completions` or `/images/generations`, and discard nonstandard endpoint overrides.

- [x] **Step 4: Run the targeted tests and type check**

Run: `npx vitest run tests/unit/settings/settings-store.test.ts && npm run typecheck`

### Task 2: Simplify save and resolve behavior

**Files:**
- Modify: `src/settings/ai-service-settings.ts`
- Modify: `src/cover/cover-workflow.ts`
- Test: `tests/unit/settings/ai-provider-profiles.test.ts`

**Interfaces:**
- Consumes canonical provider metadata from Task 1.
- `saveProfile` accepts Base URL, model and optional replacement key only; it cannot accept an endpoint override or caller-selected request format.

- [x] **Step 1: Write failing service tests**

```ts
await service.saveProfile({ kind: 'text', provider: 'deepseek', baseUrl, model, apiKey });
expect(settings.current.aiProviders.text.providers.deepseek).not.toHaveProperty('endpointOverride');
expect(resolveAiService(settings.current, 'text')?.endpoint).toBe(`${baseUrl}/chat/completions`);
```

- [x] **Step 2: Run the tests and verify they fail because the current input accepts `endpointOverride` and `requestFormat`**

Run: `npx vitest run tests/unit/settings/ai-provider-profiles.test.ts`

- [x] **Step 3: Remove override handling and enforce canonical request formats**

Delete endpoint validation and origin-selection branches. Retain the origin-change key requirement against Base URL only.

- [x] **Step 4: Run the targeted tests**

Run: `npx vitest run tests/unit/settings/ai-provider-profiles.test.ts tests/unit/cover/cover-workflow.test.ts`

### Task 3: Render compact provider fields and accessible Key visibility

**Files:**
- Modify: `src/settings/settings-tab.ts`
- Modify: `styles.css`
- Test: `tests/unit/settings/settings-tab.test.ts`

**Interfaces:**
- Consumes `SecretStore.get(secretKind)` for the selected profile only.
- Produces `data-testid="ai-<kind>-<provider>-key-toggle"` with an accessible label that follows its visibility state.

- [x] **Step 1: Write failing settings-tab tests**

```ts
expect(input(tab.containerEl, 'ai-text-deepseek-base-url').value).toBe('https://api.deepseek.com');
expect(tab.containerEl.querySelector('[data-testid="ai-text-deepseek-endpoint"]')).toBeNull();
expect(key.type).toBe('password');
button(tab.containerEl, 'ai-text-deepseek-key-toggle').click();
expect(key.type).toBe('text');
```

- [x] **Step 2: Run the tests and verify they fail because the endpoint field exists and keys are not rendered**

Run: `npx vitest run tests/unit/settings/settings-tab.test.ts`

- [x] **Step 3: Implement Base URL defaults, key visibility toggle, and read-only format copy**

Use an icon-only button with `aria-label` and visible keyboard focus. Render `固定：OpenAI Chat Completions` for text and `固定：Agnes Images` for image; include the derived path in concise helper copy.

- [x] **Step 4: Run the targeted settings tests**

Run: `npx vitest run tests/unit/settings/settings-tab.test.ts`

### Task 4: Full verification and isolated-Vault UI check

**Files:**
- Modify: `docs/verification/` only if a user-visible verification record is already part of this task.

- [x] **Step 1: Run automated gates**

Run: `npm test && npm run lint && npm run verify:release && npm run scan:secrets`

- [x] **Step 2: Build and sync the test Vault**

Run: `WECHAT_WORKBENCH_TEST_VAULT=$HOME/workspace/Github/wechat-workbench-test-vault npm run sync:test-vault`

- [x] **Step 3: Restart Obsidian and inspect both mode tabs**

Verify text mode shows Agnes/DeepSeek defaults, image mode shows Agnes only, no advanced Endpoint field, fixed format copy, and each selected Key begins hidden and toggles locally.
