# WeChat Workbench AI Content Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement independent OpenAI-compatible text and image services, bounded AI context, title/digest candidate workflows, flicker-free article autosave, and preview-before-adopt cover generation exactly as approved in the 2026-08-23 design.

**Architecture:** Keep settings, context construction, remote generation, candidate session state, autosave, and cover persistence behind separate narrow services. Preserve the current immutable `RenderArtifact`, `NetworkPolicy`, `PinnedNodeHttpTransport`, SecretStorage, safe Frontmatter merge, and publish transaction boundaries; replace model discovery, Base URL suffix joining, full settings rerenders, and pre-confirmation AI cover persistence.

**Tech Stack:** TypeScript 5.8, Obsidian 1.13 API with minimum version 1.11.4, Vitest 4 + jsdom, esbuild, existing Node HTTP/DNS security adapters, Electron image processing, CSS with Obsidian variables.

---

## Source of Truth

- Approved design: `docs/superpowers/specs/2026-08-23-ai-content-generation-design.md`
- Approved prototype: `docs/prototypes/ai-content-generation-workbench.html`
- Incremental predecessor: `docs/superpowers/specs/2026-08-22-account-cover-ui-refinement-design.md`
- Fixed desktop acceptance Vault: `$HOME/workspace/Github/wechat-workbench-test-vault`

If this plan conflicts with the approved design, stop and update the plan before changing production code.

### 2026-08-24 implementation amendment

AI cover generation sends only the current title, digest, and optional modal-only supplemental prompt. It does not send headings or a body excerpt. This supersedes earlier cover-specific examples in this plan that included `bodyExcerpt`.

## Global Constraints

- Desktop only; keep `manifest.json.isDesktopOnly: true` and `minAppVersion >= 1.11.4`.
- Do not load development builds into `$HOME/workspace/Github/commit_note`.
- Do not add local Codex, Anthropic, model discovery, provider presets, cloud article sync, or author-hosted proxy behavior.
- Text and image configuration remain independent: full Endpoint URL, API Key, and model name for each.
- AppSecret, Access Token, `textApiKey`, and `imageApiKey` only enter Obsidian `SecretStorage` and request memory.
- Settings display, field input, and AI configuration save must not perform HTTP, DNS, or model validation.
- Only explicit title, digest, or cover generation may send bounded content to the configured third-party endpoint.
- Preview, clipboard, and draft payloads continue to consume one immutable `RenderArtifact`.
- Preserve unknown Frontmatter fields and existing `content_source_url`; autosave changes only `title`, `author`, and `digest`.
- Do not automatically retry generation requests or automatically adopt model output.
- Do not delete old generated/uploaded cover files when restoring article first image.
- Each production change starts with a failing test and ends with a focused commit after `npm run scan:secrets` passes.
- Do not push, publish, deploy, rebase, reset, or modify real credentials.

## Baseline Preflight

Before Task 1:

```bash
git status --short --branch
npm test
npm run lint
npm run typecheck
npm run build
npm run verify:release
npm run scan:secrets
```

Expected:

- Branch is `codex/foundation` unless the user explicitly chooses another branch.
- Worktree contains no unrelated changes. If it does, preserve them and stage only task files.
- Every command passes. Existing failures must be recorded as baseline failures and must not be described as caused by this plan without evidence.

## File and Responsibility Map

### New production files

- `src/ai/article-context.ts` — sanitize and bound the current article for text/image requests.
- `src/ai/openai-text-generator.ts` — minimal OpenAI-compatible text request and strict candidate parsing.
- `src/ai/text-workflow.ts` — title/digest request concurrency, cancellation, staleness, and in-memory candidate state.
- `src/ui/article-autosave-controller.ts` — 600ms debounce, single-flight writes, flush, retry, and revision state.
- `src/ui/ai-text-candidates.ts` — stable inline candidate DOM for title and digest.
- `src/ui/ai-cover-session.ts` — modal-only supplemental prompt and one in-memory image candidate.

### Existing production files to modify

- `src/settings/model.ts` — schema v4 and text/image endpoint fields.
- `src/settings/settings-store.ts` — v1–v4 migration and endpoint sanitization.
- `src/settings/secret-store.ts` — `textApiKey` SecretStorage support.
- `src/settings/ai-service-settings.ts` — local-only independent text/image save transactions.
- `src/settings/settings-tab.ts` — approved dual configuration cards; remove protocol/model-list UI.
- `src/domain/article.ts` — shared editable title/author/digest value type.
- `src/settings/article-settings.ts` — save only title/author/digest.
- `src/cover/openai-image-generator.ts` — use the exact endpoint and the documented Agnes-compatible `2K` URL-output panoramic request fields with a 120-second request boundary.
- `src/cover/cover-workflow.ts` — keep AI candidate in memory until adoption and expose restore-first-image.
- `src/cover/cover-types.ts` — candidate bytes and persistence result types.
- `src/ui/ai-cover-confirmation.ts` — disclosure, optional prompt, preview, regenerate, adopt, cancel.
- `src/ui/workbench-publish-settings.ts` — stable article DOM, inline AI candidates, direct cover card.
- `src/ui/workbench-controller.ts` — inject text workflow/autosave/cover session actions.
- `src/ui/workbench-view.ts` — preserve settings component identity and flush/cancel lifecycle.
- `src/main.ts` — construct and inject new services.
- `styles.css` — approved native Obsidian visual treatment.

### Tests to create

- `tests/unit/ai/article-context.test.ts`
- `tests/unit/ai/openai-text-generator.test.ts`
- `tests/unit/ai/text-workflow.test.ts`
- `tests/unit/ui/article-autosave-controller.test.ts`
- `tests/unit/ui/ai-text-candidates.test.ts`
- `tests/unit/ui/ai-cover-session.test.ts`
- `tests/integration/ai-content-generation.test.ts`
- `tests/adversarial/ai-content-boundary.test.ts`

### Tests to modify

- `tests/unit/settings/settings-store.test.ts`
- `tests/unit/settings/secret-store.test.ts`
- `tests/unit/settings/ai-service-settings.test.ts`
- `tests/unit/settings/settings-tab.test.ts`
- `tests/unit/settings/article-settings.test.ts`
- `tests/unit/cover/openai-image-generator.test.ts`
- `tests/unit/cover/cover-workflow.test.ts`
- `tests/unit/ui/ai-cover-confirmation.test.ts`
- `tests/unit/ui/workbench-publish-settings.test.ts`
- `tests/unit/ui/workbench-view.test.ts`
- `tests/integration/cover-provider.test.ts`
- `tests/integration/cover-ui.test.ts`
- `tests/integration/publish-ui.test.ts`
- `tests/adversarial/network-assets.test.ts`
- `tests/adversarial/secret-leakage.test.ts`
- `tests/visual/workbench-visual.test.ts`

## Task 1: Migrate Settings to Schema v4 and Add a Separate Text Secret

**Files:**

- Modify: `src/settings/model.ts:40-100`
- Modify: `src/settings/settings-store.ts:166-221`
- Modify: `src/settings/secret-store.ts:1-38`
- Modify: `tests/unit/settings/settings-store.test.ts`
- Modify: `tests/unit/settings/secret-store.test.ts`

- [ ] **Step 1: Write failing schema v4 migration tests**

Add tests that prove v3 image values migrate without suffix guessing and text values start empty:

```ts
it('migrates v3 image configuration to schema v4 without appending a path', async () => {
  const settings = await new SettingsStore(new MemoryPluginData({
    schemaVersion: 3,
    imageApiProtocol: 'openai-compatible',
    imageApiBaseUrl: 'https://images.example.test/custom/generate',
    imageApiModel: 'saved-image-model',
  })).load();

  expect(settings).toMatchObject({
    schemaVersion: 4,
    textApiEndpoint: '',
    textApiModel: '',
    imageApiEndpoint: 'https://images.example.test/custom/generate',
    imageApiModel: 'saved-image-model',
    imageApiBaseUrl: 'https://images.example.test/custom/generate',
    imageApiProtocol: 'openai-compatible',
  });
});

it('never serializes text or image API keys', async () => {
  const adapter = new MemoryPluginData();
  const store = new SettingsStore(adapter);

  await store.save({ ...DEFAULT_SETTINGS, textApiEndpoint: 'https://text.example.test/v1/chat' });

  expect(adapter.saved).not.toHaveProperty('textApiKey');
  expect(adapter.saved).not.toHaveProperty('imageApiKey');
});
```

Extend the secret-store test:

```ts
it('stores text and image AI keys under different secret ids', () => {
  const values = new Map<string, string>();
  const store = new SecretStore({
    setSecret: (id, value) => values.set(id, value),
    getSecret: id => values.get(id) ?? null,
  });

  store.set('textApiKey', 'synthetic-text-key');
  store.set('imageApiKey', 'synthetic-image-key');

  expect(values.get('wechat-workbench-text-api-key')).toBe('synthetic-text-key');
  expect(values.get('wechat-workbench-image-api-key')).toBe('synthetic-image-key');
});
```

- [ ] **Step 2: Run the focused tests and verify failure**

Run:

```bash
npx vitest run tests/unit/settings/settings-store.test.ts tests/unit/settings/secret-store.test.ts
```

Expected: FAIL because schema v4, `textApiEndpoint`, `imageApiEndpoint`, and `textApiKey` do not exist.

- [ ] **Step 3: Implement schema v4 and secret IDs**

Update the settings shape while retaining v3 compatibility fields for one release:

```ts
export interface PluginSettings {
  readonly schemaVersion: 4;
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
  textApiEndpoint: string;
  textApiModel: string;
  imageApiEndpoint: string;
  imageApiModel: string;
  imageApiBaseUrl: string;
  imageApiProtocol: AiProviderProtocol;
  accessTokenExpiresAt: number | null;
  accountHash: string | null;
  mediaCache: readonly Readonly<MediaCacheRecord>[];
  recoveryReceipts: readonly Readonly<RecoveryReceiptRecord>[];
}
```

Set defaults:

```ts
schemaVersion: 4,
textApiEndpoint: '',
textApiModel: '',
imageApiEndpoint: '',
imageApiBaseUrl: '',
imageApiProtocol: 'openai-compatible',
imageApiModel: '',
```

Accept schema 1–4 and migrate without URL joining. `storedProviderUrl()` performs only safe storage sanitization—absolute HTTPS, no credentials/query/fragment, and no literal local/private address—but permits a root path so a legacy Base URL is not silently dropped. Task 2's explicit save validation is stricter and requires a non-root Endpoint path.

```ts
const schemaVersion = isRecord(value)
  && (value.schemaVersion === 1 || value.schemaVersion === 2
    || value.schemaVersion === 3 || value.schemaVersion === 4)
  ? value.schemaVersion
  : 0;
const legacyImageUrl = storedProviderUrl(stored.imageApiBaseUrl);

return {
  schemaVersion: 4,
  appId: stringValue(stored.appId, DEFAULT_SETTINGS.appId),
  defaultThemeId: stringValue(stored.defaultThemeId, DEFAULT_SETTINGS.defaultThemeId),
  defaultStyle: styleConfig(stored.defaultStyle, DEFAULT_SETTINGS.defaultStyle),
  recentStyles: recentStyles(stored.recentStyles),
  customThemeDirectory: stringValue(stored.customThemeDirectory, DEFAULT_SETTINGS.customThemeDirectory),
  defaultAuthor: stringValue(stored.defaultAuthor, DEFAULT_SETTINGS.defaultAuthor),
  defaultSourceUrl: stringValue(stored.defaultSourceUrl, DEFAULT_SETTINGS.defaultSourceUrl),
  defaultCoverStrategy: coverStrategy(stored.defaultCoverStrategy),
  globalDefaultCoverPath: stringValue(stored.globalDefaultCoverPath, DEFAULT_SETTINGS.globalDefaultCoverPath),
  accountDisplayName: stringValue(stored.accountDisplayName, DEFAULT_SETTINGS.accountDisplayName),
  accountVerification: schemaVersion >= 3 ? accountVerification(stored.accountVerification) : null,
  textApiEndpoint: schemaVersion >= 4 ? storedProviderUrl(stored.textApiEndpoint) : '',
  textApiModel: schemaVersion >= 4 ? stringValue(stored.textApiModel, '') : '',
  imageApiEndpoint: schemaVersion >= 4
    ? storedProviderUrl(stored.imageApiEndpoint)
    : legacyImageUrl,
  imageApiModel: stringValue(stored.imageApiModel, ''),
  imageApiBaseUrl: legacyImageUrl,
  imageApiProtocol: aiProtocol(stored.imageApiProtocol),
  accessTokenExpiresAt: nullableNumber(stored.accessTokenExpiresAt, DEFAULT_SETTINGS.accessTokenExpiresAt),
  accountHash: nullableString(stored.accountHash, DEFAULT_SETTINGS.accountHash),
  mediaCache: mediaCache(stored.mediaCache),
  recoveryReceipts: recoveryReceipts(stored.recoveryReceipts),
};
```

Extend `SecretKind`:

```ts
export type SecretKind = 'appSecret' | 'accessToken' | 'textApiKey' | 'imageApiKey';
```

Extend the existing `SECRET_IDS` record with these exact mappings:

| Secret kind | SecretStorage ID |
| --- | --- |
| `textApiKey` | `wechat-workbench-text-api-key` |
| `imageApiKey` | `wechat-workbench-image-api-key` |

- [ ] **Step 4: Run focused settings tests**

Run:

```bash
npx vitest run tests/unit/settings/settings-store.test.ts tests/unit/settings/secret-store.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run typecheck and secret scan**

Run:

```bash
npm run typecheck
npm run scan:secrets
```

Expected: PASS; no credential-shaped values enter committed fixtures.

- [ ] **Step 6: Commit**

```bash
git add src/settings/model.ts src/settings/settings-store.ts src/settings/secret-store.ts \
  tests/unit/settings/settings-store.test.ts tests/unit/settings/secret-store.test.ts
git commit -m "feat(settings): split text and image ai configuration"
```

## Task 2: Replace Model Discovery with Local-Only Independent Save Transactions

**Files:**

- Modify: `src/settings/ai-service-settings.ts:1-130`
- Modify: `tests/unit/settings/ai-service-settings.test.ts`

- [ ] **Step 1: Replace old model-discovery tests with failing save-transaction tests**

```ts
function createService() {
  const current = { ...DEFAULT_SETTINGS };
  const update = vi.fn(async (patch: Partial<PluginSettings>) => Object.assign(current, patch));
  const secrets = {
    values: new Map([['textApiKey', 'stored-text'], ['imageApiKey', 'stored-image']]),
    get: vi.fn((kind: 'textApiKey' | 'imageApiKey') => secrets.values.get(kind) ?? null),
    set: vi.fn((kind: 'textApiKey' | 'imageApiKey', value: string) => secrets.values.set(kind, value)),
    clear: vi.fn((kind: 'textApiKey' | 'imageApiKey') => secrets.values.delete(kind)),
  };
  return {
    service: new AiServiceSettingsService({ get: () => current, update }, secrets),
    current, update, secrets,
  };
}

it('saves text configuration without a network dependency', async () => {
  const current = createService();

  await current.service.saveText({
    endpoint: 'https://text.example.test/v1/chat/completions',
    model: 'text-model',
    apiKey: 'new-text-key',
  });

  expect(current.current.textApiEndpoint).toBe('https://text.example.test/v1/chat/completions');
  expect(current.current.textApiModel).toBe('text-model');
  expect(current.secrets.set).toHaveBeenCalledWith('textApiKey', 'new-text-key');
});

it('requires a new key when the endpoint origin changes', async () => {
  const current = createService();
  current.current.imageApiEndpoint = 'https://old.example.test/v1/images';

  await expect(current.service.saveImage({
    endpoint: 'https://new.example.test/v1/images', model: 'image-model', apiKey: '',
  })).rejects.toMatchObject({ code: 'AI_ENDPOINT_NEW_KEY_REQUIRED' });
});

it('rolls back a replaced key when settings persistence fails', async () => {
  const current = createService();
  current.update.mockRejectedValueOnce(new Error('synthetic save failure'));

  await expect(current.service.saveText({
    endpoint: 'https://text.example.test/v1/chat', model: 'model', apiKey: 'replacement',
  })).rejects.toThrow('synthetic save failure');
  expect(current.secrets.set).toHaveBeenLastCalledWith('textApiKey', 'stored-text');
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```bash
npx vitest run tests/unit/settings/ai-service-settings.test.ts
```

Expected: FAIL because the service still requires protocol, model catalog refresh, and `baseUrl`.

- [ ] **Step 3: Implement independent local-only save methods**

Use one shared transaction with explicit kinds:

```ts
export type AiServiceKind = 'text' | 'image';

export interface AiServiceInput {
  endpoint: string;
  model: string;
  apiKey: string;
}

export class AiServiceSettingsError extends Error {
  constructor(
    readonly code: 'AI_ENDPOINT_INVALID' | 'AI_ENDPOINT_PATH_MISSING'
      | 'AI_ENDPOINT_NEW_KEY_REQUIRED' | 'AI_MODEL_MISSING',
    message: string,
  ) {
    super(message);
    this.name = 'AiServiceSettingsError';
  }
}

export class AiServiceSettingsService {
  constructor(private readonly settings: SettingsPort, private readonly secrets: AiSecretPort) {}

  saveText(input: Readonly<AiServiceInput>): Promise<Readonly<PluginSettings>> {
    return this.save('text', input);
  }

  saveImage(input: Readonly<AiServiceInput>): Promise<Readonly<PluginSettings>> {
    return this.save('image', input);
  }

  private async save(kind: AiServiceKind, input: Readonly<AiServiceInput>): Promise<Readonly<PluginSettings>> {
    const endpoint = normalizedEndpoint(input.endpoint);
    const model = input.model.trim();
    if (model.length === 0) throw new AiServiceSettingsError('AI_MODEL_MISSING', 'Model is required.');
    const current = this.settings.get();
    const endpointField = kind === 'text' ? 'textApiEndpoint' : 'imageApiEndpoint';
    const secretKind = kind === 'text' ? 'textApiKey' : 'imageApiKey';
    const previousKey = this.secrets.get(secretKind);
    const originChanged = origin(current[endpointField]) !== origin(endpoint);
    const suppliedKey = input.apiKey.trim();
    if (originChanged && suppliedKey.length === 0) {
      throw new AiServiceSettingsError('AI_ENDPOINT_NEW_KEY_REQUIRED', 'Changing service origin requires a new API key.');
    }
    if (suppliedKey.length > 0) this.secrets.set(secretKind, suppliedKey);
    try {
      const patch: Partial<PluginSettings> = kind === 'text'
        ? { textApiEndpoint: endpoint, textApiModel: model }
        : { imageApiEndpoint: endpoint, imageApiModel: model };
      return await this.settings.update(patch);
    } catch (error) {
      if (suppliedKey.length > 0) {
        if (previousKey === null) this.secrets.clear(secretKind);
        else this.secrets.set(secretKind, previousKey);
      }
      throw error;
    }
  }
}
```

`normalizedEndpoint()` must enforce absolute HTTPS, non-root path, no user info/query/fragment, and reject literal local/private/reserved IPs without performing DNS.

- [ ] **Step 4: Run the focused tests**

Run:

```bash
npx vitest run tests/unit/settings/ai-service-settings.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run scan:secrets
git add src/settings/ai-service-settings.ts tests/unit/settings/ai-service-settings.test.ts
git commit -m "refactor(settings): save ai endpoints without discovery"
```

## Task 3: Render the Approved Dual AI Configuration UI

**Files:**

- Modify: `src/settings/settings-tab.ts:53-260`
- Modify: `tests/unit/settings/settings-tab.test.ts`
- Modify: `styles.css`

- [ ] **Step 1: Write failing settings UI tests**

```ts
it('renders independent text and image cards without protocol or model discovery controls', () => {
  const current = createSettingsTab();
  current.tab.display();

  expect(current.container.textContent).toContain('AI 内容生成');
  expect(current.container.textContent).toContain('文本生成服务');
  expect(current.container.textContent).toContain('图片生成服务');
  expect(current.container.querySelector('[data-testid="text-ai-endpoint"]')).not.toBeNull();
  expect(current.container.querySelector('[data-testid="image-ai-endpoint"]')).not.toBeNull();
  expect(current.container.querySelector('[data-testid="text-ai-model"]')).not.toBeNull();
  expect(current.container.querySelector('[data-testid="image-ai-model"]')).not.toBeNull();
  expect(current.container.textContent).not.toContain('获取模型');
  expect(current.container.textContent).not.toContain('Anthropic');
  expect(current.container.querySelector('select')).toBeNull();
});

it('marks a saved configuration as local and unverified without calling a catalog', async () => {
  const current = createSettingsTab();
  current.tab.display();

  fill(current.container, 'text-ai-endpoint', 'https://text.example.test/v1/chat');
  fill(current.container, 'text-ai-model', 'text-model');
  click(current.container, 'save-text-ai');
  await Promise.resolve();

  expect(current.aiService.saveText).toHaveBeenCalledOnce();
  expect(current.container.textContent).toContain('已保存到本机 · 尚未联网验证');
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```bash
npx vitest run tests/unit/settings/settings-tab.test.ts
```

Expected: FAIL because the settings tab still renders protocol, model refresh, and one image service.

- [ ] **Step 3: Implement the dual cards**

Create one helper used twice:

```ts
interface AiCardOptions {
  kind: 'text' | 'image';
  title: string;
  description: string;
  endpoint: string;
  model: string;
  keySaved: boolean;
  save(input: Readonly<AiServiceInput>): Promise<void>;
}

function appendAiServiceCard(container: HTMLElement, options: Readonly<AiCardOptions>): void {
  const card = container.createDiv('wechat-workbench-settings__ai-card');
  card.createEl('h3', { text: options.title });
  card.createEl('p', { text: options.description, cls: 'setting-item-description' });
  let endpointValue = options.endpoint;
  let keyValue = '';
  let modelValue = options.model;
  new Setting(card)
    .setName('完整 Endpoint URL')
    .setDesc('OpenAI compatible；请填写包含接口路径的完整 HTTPS 地址。')
    .addText(text => {
      text.setValue(options.endpoint).onChange(value => { endpointValue = value; });
      text.inputEl.dataset.testid = `${options.kind}-ai-endpoint`;
    });
  new Setting(card)
    .setName('API Key')
    .setDesc('保存在 Obsidian SecretStorage。')
    .addText(text => {
      text.setPlaceholder(options.keySaved ? '已保存 · 输入新值以替换' : '输入 API Key')
        .onChange(value => { keyValue = value; });
      text.inputEl.type = 'password';
      text.inputEl.dataset.testid = `${options.kind}-ai-key`;
    });
  new Setting(card)
    .setName('模型名称')
    .setDesc('手动填写，不获取远程模型列表。')
    .addText(text => {
      text.setValue(options.model).onChange(value => { modelValue = value; });
      text.inputEl.dataset.testid = `${options.kind}-ai-model`;
    });
  const actions = card.createDiv('wechat-workbench-settings__ai-actions');
  const status = actions.createSpan({ cls: 'wechat-workbench-settings__save-status' });
  const save = actions.createEl('button', { text: `保存${options.kind === 'text' ? '文本' : '图片'}配置` });
  save.dataset.testid = `save-${options.kind}-ai`;
  save.addEventListener('click', () => {
    save.disabled = true;
    void options.save({ endpoint: endpointValue, apiKey: keyValue, model: modelValue })
      .then(() => { status.textContent = '已保存到本机 · 尚未联网验证'; })
      .finally(() => { save.disabled = false; });
  });
}
```

The save callback updates a fixed-height status element to `已保存到本机 · 尚未联网验证`. Remove all calls to `refreshModels()` and all protocol/model dropdown rendering.

- [ ] **Step 4: Add Obsidian-native responsive styles**

```css
.wechat-workbench-settings__ai-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--size-4-4);
}

.wechat-workbench-settings__ai-card {
  padding: var(--size-4-4);
  border: 1px solid var(--background-modifier-border);
  border-radius: var(--radius-m);
  background: var(--background-secondary);
}

.wechat-workbench-settings__save-status {
  min-height: var(--line-height-tight);
  color: var(--text-muted);
  font-size: var(--font-smallest);
}

@media (max-width: 900px) {
  .wechat-workbench-settings__ai-grid { grid-template-columns: 1fr; }
}
```

- [ ] **Step 5: Run tests and visual fixture**

Run:

```bash
npx vitest run tests/unit/settings/settings-tab.test.ts tests/visual/workbench-visual.test.ts
npm run typecheck
```

Expected: PASS; no snapshot contains `获取模型` or `Anthropic`.

- [ ] **Step 6: Commit**

```bash
npm run scan:secrets
git add src/settings/settings-tab.ts tests/unit/settings/settings-tab.test.ts styles.css
git commit -m "feat(settings): render separate text and image services"
```

## Task 4: Build a Bounded and Sanitized Article Context

**Files:**

- Create: `src/ai/article-context.ts`
- Modify: `src/domain/article.ts`
- Create: `tests/unit/ai/article-context.test.ts`
- Create: `tests/adversarial/ai-content-boundary.test.ts`

- [ ] **Step 1: Write failing context tests**

```ts
it('removes private metadata, image destinations, html, code, and control characters', () => {
  const context = buildAiArticleContext({
    snapshot: {
      ...snapshot,
      markdown: `---\nappSecret: SECRET\nwechat-draft-id: MEDIA\n---\n# Heading\n<img src="https://signed.example/x?token=SECRET">\n![diagram](data:image/png;base64,SECRET)\n\`\`\`sh\necho SECRET\n\`\`\`\nVisible\u0000 text`,
    },
    artifact,
    draft: { title: 'Draft title', author: 'anightmonarch', digest: 'Draft digest' },
    purpose: 'title',
  });

  expect(context.title).toBe('Draft title');
  expect(context.digest).toBe('Draft digest');
  expect(context.bodyExcerpt).toContain('Heading');
  expect(context.bodyExcerpt).toContain('diagram');
  expect(context.bodyExcerpt).toContain('[代码块]');
  expect(JSON.stringify(context)).not.toMatch(/SECRET|MEDIA|data:image|signed\.example/);
});

it('uses a 70/30 excerpt and stays within the purpose budget', () => {
  const body = `START-${'前'.repeat(7000)}-MIDDLE-${'后'.repeat(7000)}-END`;
  const context = buildAiArticleContext({
    snapshot: { ...snapshot, markdown: body },
    artifact: { ...artifact, plainText: body },
    draft: { title: '', author: '', digest: '' },
    purpose: 'cover',
  });

  expect([...context.bodyExcerpt].length).toBeLessThanOrEqual(3000);
  expect(context.bodyExcerpt).toContain('START');
  expect(context.bodyExcerpt).toContain('END');
  expect(context.bodyExcerpt).toContain('[内容已截断]');
});
```

Add an adversarial case containing prompt injection, bidirectional controls, huge Data URLs, and fake Frontmatter secrets; assert none escape the sanitized fields.

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
npx vitest run tests/unit/ai/article-context.test.ts tests/adversarial/ai-content-boundary.test.ts
```

Expected: FAIL because `src/ai/article-context.ts` does not exist.

- [ ] **Step 3: Implement the context builder**

Add the shared form type to `src/domain/article.ts`:

```ts
export interface ArticleDraftValues {
  title: string;
  author: string;
  digest: string;
}

export interface EditableArticleSettings extends ArticleDraftValues {
  contentSourceUrl: string;
}
```

Define the stable context contract and import `ArticleDraftValues` from `src/domain/article.ts`:

```ts
export type AiContextPurpose = 'title' | 'digest' | 'cover';

export interface AiArticleContext {
  notePathHash: string;
  sourceHash: string;
  title: string;
  digest: string;
  headings: readonly string[];
  bodyExcerpt: string;
}
```

Implement deterministic cleanup in this order:

```ts
function sanitizedMarkdown(markdown: string): string {
  return markdown
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/u, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, ' ')
    .replace(/<!--[\s\S]*?-->/gu, ' ')
    .replace(/```[\s\S]*?```/gu, '\n[代码块]\n')
    .replace(/!\[([^\]]*)\]\([^)]*\)/gu, '$1')
    .replace(/!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/gu, '$1')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/[\u0000-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function excerpt(value: string, limit: number): string {
  const characters = [...value];
  if (characters.length <= limit) return value;
  const marker = [...'[内容已截断]'];
  const available = limit - marker.length;
  const head = Math.floor(available * 0.7);
  return [...characters.slice(0, head), ...marker, ...characters.slice(-(available - head))].join('');
}
```

Use Node `createHash('sha256')` to hash the note path locally and to combine `artifact.source.sourceHash` with normalized draft values. Do not include either hash in the returned remote payload builder.

- [ ] **Step 4: Run context and adversarial tests**

Run:

```bash
npx vitest run tests/unit/ai/article-context.test.ts tests/adversarial/ai-content-boundary.test.ts
npm run lint
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run scan:secrets
git add src/ai/article-context.ts src/domain/article.ts tests/unit/ai/article-context.test.ts \
  tests/adversarial/ai-content-boundary.test.ts
git commit -m "feat(ai): build bounded article context"
```

## Task 5: Add the Minimal OpenAI-Compatible Text Generator

**Files:**

- Create: `src/ai/openai-text-generator.ts`
- Create: `tests/unit/ai/openai-text-generator.test.ts`

- [ ] **Step 1: Write failing request and parser tests**

```ts
it('sends only model and messages to the exact endpoint', async () => {
  const current = harness({ choices: [{ message: { content: '{"titles":["A","B","C"]}' } }] });
  const result = await current.generator.generateTitles(request);

  expect(result).toEqual(['A', 'B', 'C']);
  expect(current.requests[0]).toMatchObject({
    method: 'POST',
    url: 'https://text.example.test/custom/chat',
    headers: { Authorization: `Bearer ${credential}`, 'Content-Type': 'application/json' },
  });
  expect(Object.keys(current.requests[0]?.json as object).sort()).toEqual(['messages', 'model']);
});

it('parses one fenced digest and rejects duplicate or incomplete titles', async () => {
  const digest = harness({ choices: [{ message: { content: '```json\n{"digest":"Summary"}\n```' } }] });
  await expect(digest.generator.generateDigest(request)).resolves.toBe('Summary');

  const invalid = harness({ choices: [{ message: { content: '{"titles":["A","A"]}' } }] });
  await expect(invalid.generator.generateTitles(request))
    .rejects.toMatchObject({ code: 'AI_TITLE_CANDIDATES_INVALID' });
});

it('redacts credentials and maps authentication, rate limit, and timeout errors', async () => {
  await expect(harness({}, 401).generator.generateDigest(request))
    .rejects.toMatchObject({ code: 'AI_AUTH_REJECTED' });
  await expect(harness({}, 429).generator.generateDigest(request))
    .rejects.toMatchObject({ code: 'AI_RATE_LIMITED' });
});
```

- [ ] **Step 2: Run the test and verify failure**

Run:

```bash
npx vitest run tests/unit/ai/openai-text-generator.test.ts
```

Expected: FAIL because the generator file does not exist.

- [ ] **Step 3: Implement the generator contract**

```ts
export interface AiTextGenerationRequest {
  endpoint: string;
  model: string;
  apiKey: string;
  context: Readonly<AiArticleContext>;
  signal?: AbortSignal;
}

export interface AiTextGenerator {
  generateTitles(request: Readonly<AiTextGenerationRequest>): Promise<readonly string[]>;
  generateDigest(request: Readonly<AiTextGenerationRequest>): Promise<string>;
}

export class AiTextGenerationError extends Error {
  constructor(readonly code: AiTextErrorCode, message: string) {
    super(message);
    this.name = 'AiTextGenerationError';
  }
}
```

Use one private request method:

```ts
private async complete(
  request: Readonly<AiTextGenerationRequest>,
  system: string,
): Promise<string> {
  if (request.signal?.aborted === true) throw failure('AI_GENERATION_CANCELLED');
  const response = await this.boundary({
    method: 'POST',
    url: request.endpoint,
    headers: { Authorization: `Bearer ${request.apiKey}`, 'Content-Type': 'application/json' },
    json: {
      model: request.model.trim(),
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: quotedContext(request.context) },
      ],
    },
  }, request.signal);
  mapStatus(response.status);
  const serialized = JSON.stringify(response.body);
  if (serialized.length > 1_000_000) throw failure('AI_RESPONSE_TOO_LARGE');
  const content = object(array(object(response.body).choices)[0]).message;
  const value = object(content).content;
  if (typeof value !== 'string') throw failure('AI_RESPONSE_INVALID');
  return value;
}
```

Parse one optional JSON fence, require exactly three unique titles of 1–64 characters, and one digest of 1–120 characters. Never include raw provider content in thrown messages.

- [ ] **Step 4: Run tests, typecheck, and lint**

Run:

```bash
npx vitest run tests/unit/ai/openai-text-generator.test.ts
npm run typecheck
npm run lint
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run scan:secrets
git add src/ai/openai-text-generator.ts tests/unit/ai/openai-text-generator.test.ts
git commit -m "feat(ai): generate bounded text candidates"
```

## Task 6: Add Title and Digest Candidate Workflow State

**Files:**

- Create: `src/ai/text-workflow.ts`
- Create: `tests/unit/ai/text-workflow.test.ts`

- [ ] **Step 1: Write failing workflow tests**

```ts
it('keeps title output as candidates and rejects duplicate in-flight requests', async () => {
  const deferred = promiseWithResolvers<readonly string[]>();
  const generator = { generateTitles: vi.fn(() => deferred.promise), generateDigest: vi.fn() };
  const workflow = new AiTextWorkflow(generator, settings, secrets);

  const first = workflow.generateTitle(context);
  await expect(workflow.generateTitle(context)).rejects.toMatchObject({ code: 'AI_REQUEST_IN_FLIGHT' });
  deferred.resolve(['A', 'B', 'C']);

  await expect(first).resolves.toMatchObject({ status: 'ready', candidates: ['A', 'B', 'C'] });
});

it('discards a result after the active note changes', async () => {
  const deferred = promiseWithResolvers<readonly string[]>();
  const workflow = createWorkflow({ generateTitles: () => deferred.promise });
  const pending = workflow.generateTitle(context);

  workflow.bindNote('OTHER_NOTE_HASH');
  deferred.resolve(['A', 'B', 'C']);

  await expect(pending).rejects.toMatchObject({ code: 'AI_RESULT_NOTE_CHANGED' });
  expect(workflow.state('title').status).toBe('idle');
});

it('marks same-note output stale when the source hash changes', async () => {
  const workflow = createWorkflow({ generateTitles: async () => ['A', 'B', 'C'] });
  const pending = workflow.generateTitle(context);
  workflow.updateSource('NEW_SOURCE_HASH');

  await expect(pending).resolves.toMatchObject({ stale: true });
});
```

- [ ] **Step 2: Run the test and verify failure**

Run:

```bash
npx vitest run tests/unit/ai/text-workflow.test.ts
```

Expected: FAIL because `AiTextWorkflow` does not exist.

- [ ] **Step 3: Implement independent title/digest slots**

```ts
export type AiTextTarget = 'title' | 'digest';
export type AiTextState = Readonly<{
  status: 'idle' | 'loading' | 'ready' | 'error';
  candidates: readonly string[];
  stale: boolean;
  errorCode: string | null;
}>;

interface Slot {
  requestId: number;
  controller: AbortController | null;
  state: AiTextState;
}
```

`generateTitle()` and `generateDigest()` must:

1. Read the matching endpoint/model/key only at explicit invocation.
2. Reject missing configuration before constructing headers.
3. Set only that target to loading.
4. Bind the request to `notePathHash`, `sourceHash`, and an incrementing request ID.
5. Discard cross-note or superseded results.
6. Mark same-note changed-source results stale.
7. Freeze candidate arrays and expose `close(target)` and `cancelAll()`.

- [ ] **Step 4: Run workflow tests**

Run:

```bash
npx vitest run tests/unit/ai/text-workflow.test.ts tests/unit/ai/openai-text-generator.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run scan:secrets
git add src/ai/text-workflow.ts tests/unit/ai/text-workflow.test.ts
git commit -m "feat(ai): manage text candidate sessions"
```

## Task 7: Add the 600ms Single-Flight Article Autosave Controller

**Files:**

- Create: `src/ui/article-autosave-controller.ts`
- Create: `tests/unit/ui/article-autosave-controller.test.ts`
- Modify: `src/domain/article.ts`
- Modify: `src/settings/article-settings.ts:15-29`
- Modify: `tests/unit/settings/article-settings.test.ts`

- [ ] **Step 1: Write failing fake-timer tests**

```ts
it('writes once 600ms after the latest input', async () => {
  vi.useFakeTimers();
  const save = vi.fn(async () => undefined);
  const controller = new ArticleAutosaveController(save, 600);
  controller.bind(file, initialDraft);

  controller.update({ ...initialDraft, title: 'A' });
  await vi.advanceTimersByTimeAsync(300);
  controller.update({ ...initialDraft, title: 'AB' });
  await vi.advanceTimersByTimeAsync(599);
  expect(save).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(save).toHaveBeenCalledOnce();
  expect(save).toHaveBeenCalledWith(file, { ...initialDraft, title: 'AB' });
});

it('serializes a newer edit behind a slow in-flight write', async () => {
  const first = promiseWithResolvers<void>();
  const save = vi.fn()
    .mockImplementationOnce(() => first.promise)
    .mockResolvedValueOnce(undefined);
  const controller = new ArticleAutosaveController(save, 600);
  controller.bind(file, initialDraft);

  controller.update({ ...initialDraft, title: 'first' });
  const flushing = controller.flush();
  controller.update({ ...initialDraft, title: 'latest' });
  first.resolve();
  await flushing;

  expect(save).toHaveBeenNthCalledWith(2, file, { ...initialDraft, title: 'latest' });
  expect(controller.snapshot().status).toBe('saved');
});

it('flushes on demand and keeps dirty values after failure', async () => {
  const save = vi.fn(async () => { throw new Error('synthetic failure'); });
  const controller = new ArticleAutosaveController(save, 600);
  controller.bind(file, initialDraft);
  controller.update({ ...initialDraft, digest: 'new digest' });

  await expect(controller.flush()).rejects.toThrow('synthetic failure');
  expect(controller.snapshot()).toMatchObject({ status: 'error', values: { digest: 'new digest' } });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
npx vitest run tests/unit/ui/article-autosave-controller.test.ts tests/unit/settings/article-settings.test.ts
```

Expected: FAIL because the controller does not exist and article settings still writes `content_source_url`.

- [ ] **Step 3: Implement the autosave controller**

Use explicit revision fields:

```ts
export type ArticleSaveStatus = 'saved' | 'waiting' | 'saving' | 'error';

export interface ArticleAutosaveSnapshot {
  file: VaultFileRef | null;
  values: Readonly<ArticleDraftValues>;
  status: ArticleSaveStatus;
  editRevision: number;
  savedRevision: number;
  error: Error | null;
}
```

The implementation keeps one `inFlight` promise. `flush()` loops until `savedRevision === editRevision`, copying values before each write. A newer edit during a write causes an immediate second write after the first completes. `bind()` clears the old timer and only switches note after the caller has flushed the previous note.

Expose `subscribe(listener)`, `update(values)`, `flush()`, `retry()`, `bind(file, values)`, `snapshot()`, and `destroy()`.

- [ ] **Step 4: Stop article settings from touching source URL**

Change `ArticleSettingsService.update()` to accept `Readonly<ArticleDraftValues>`, then replace the mutation body with:

```ts
await this.frontmatter.processFrontmatter(file, frontmatter => {
  setOrDelete(frontmatter, 'title', settings.title);
  setOrDelete(frontmatter, 'author', settings.author);
  setOrDelete(frontmatter, 'digest', settings.digest);
});
```

Update the unit test to seed `content_source_url` and an unknown field, then assert both remain unchanged.

- [ ] **Step 5: Run focused tests**

Run:

```bash
npx vitest run tests/unit/ui/article-autosave-controller.test.ts tests/unit/settings/article-settings.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
npm run scan:secrets
git add src/ui/article-autosave-controller.ts tests/unit/ui/article-autosave-controller.test.ts \
  src/domain/article.ts src/settings/article-settings.ts tests/unit/settings/article-settings.test.ts
git commit -m "feat(workbench): autosave article metadata"
```

## Task 8: Build Stable Article Fields and Inline AI Candidate DOM

**Files:**

- Create: `src/ui/ai-text-candidates.ts`
- Create: `tests/unit/ui/ai-text-candidates.test.ts`
- Modify: `src/ui/workbench-publish-settings.ts:1-176`
- Modify: `tests/unit/ui/workbench-publish-settings.test.ts`

- [ ] **Step 1: Write failing DOM stability and candidate tests**

```ts
it('preserves the focused input node and cursor while state updates', () => {
  const host = document.createElement('section');
  const view = new PublishSettingsView(host, actions);
  view.update(renderState, autosaveSnapshot);
  const title = host.querySelector<HTMLInputElement>('[data-testid="settings-title"]')!;
  title.focus();
  title.value = 'Local draft';
  title.setSelectionRange(5, 5);

  view.update({ ...renderState, artifact: { ...renderState.artifact, contentHash: 'NEW' } }, {
    ...autosaveSnapshot, status: 'saving', values: { ...autosaveSnapshot.values, title: 'Local draft' },
  });

  expect(host.querySelector('[data-testid="settings-title"]')).toBe(title);
  expect(title.value).toBe('Local draft');
  expect(document.activeElement).toBe(title);
  expect(title.selectionStart).toBe(5);
  expect(host.querySelector('[data-testid="settings-save"]')).toBeNull();
});

it('shows three title candidates without changing the current title', () => {
  const host = document.createElement('section');
  const onAdopt = vi.fn();
  const candidates = new AiTextCandidates(host, 'title', { onAdopt, onRegenerate: vi.fn(), onClose: vi.fn() });
  candidates.update({ status: 'ready', candidates: ['A', 'B', 'C'], stale: false, errorCode: null });

  expect(host.querySelectorAll('[data-testid="title-candidate"]')).toHaveLength(3);
  host.querySelector<HTMLButtonElement>('[data-testid="title-candidate-adopt-1"]')?.click();
  expect(onAdopt).toHaveBeenCalledWith('B');
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
npx vitest run tests/unit/ui/ai-text-candidates.test.ts tests/unit/ui/workbench-publish-settings.test.ts
```

Expected: FAIL because the UI is stateless and calls `replaceChildren()` on every refresh.

- [ ] **Step 3: Implement `AiTextCandidates`**

Create its DOM once in the constructor and only patch text/hidden/disabled state in `update()`:

```ts
export interface AiTextCandidateActions {
  onAdopt(value: string): void;
  onRegenerate(): void;
  onClose(): void;
}

export class AiTextCandidates {
  private readonly rows: HTMLElement[] = [];
  constructor(private readonly host: HTMLElement, private readonly target: AiTextTarget,
    private readonly actions: Readonly<AiTextCandidateActions>) {}

  update(state: Readonly<AiTextState>): void {
    this.host.hidden = state.status === 'idle';
    this.host.classList.toggle('is-loading', state.status === 'loading');
    this.renderRows(state.status === 'ready' ? state.candidates : []);
  }
}
```

Rows use `textContent`, never `innerHTML`. Title accepts exactly three rows; digest accepts exactly one.

- [ ] **Step 4: Replace stateless rendering with `PublishSettingsView`**

Implement `mountPublishSettings()` in the same file. It must call `container.replaceChildren()` exactly once, create article/cover/publish-status sections, register all listeners once, and return stable input/candidate references plus `updateCover`, `updatePublishStatus`, and `destroy` callbacks.

```ts
interface MountedPublishSettings {
  title: HTMLInputElement;
  author: HTMLInputElement;
  digest: HTMLTextAreaElement;
  saveState: HTMLElement;
  titleCandidates: AiTextCandidates;
  digestCandidates: AiTextCandidates;
  updateCover(state: Readonly<WorkbenchRenderState>): void;
  updatePublishStatus(state: Readonly<WorkbenchRenderState>): void;
  destroy(): void;
}

function saveStatusText(status: ArticleSaveStatus): string {
  if (status === 'waiting') return '等待自动保存';
  if (status === 'saving') return '保存中';
  if (status === 'error') return '保存失败';
  return '已自动保存';
}

export class PublishSettingsView {
  private readonly title: HTMLInputElement;
  private readonly author: HTMLInputElement;
  private readonly digest: HTMLTextAreaElement;
  private readonly saveState: HTMLElement;
  private readonly titleCandidates: AiTextCandidates;
  private readonly digestCandidates: AiTextCandidates;
  private readonly mounted: MountedPublishSettings;

  constructor(private readonly container: HTMLElement, private readonly actions: Readonly<PublishSettingsActions>) {
    const mounted = mountPublishSettings(container, actions);
    this.mounted = mounted;
    this.title = mounted.title;
    this.author = mounted.author;
    this.digest = mounted.digest;
    this.saveState = mounted.saveState;
    this.titleCandidates = mounted.titleCandidates;
    this.digestCandidates = mounted.digestCandidates;
  }

  update(state: Readonly<WorkbenchRenderState>, autosave: Readonly<ArticleAutosaveSnapshot>,
    text: Readonly<{ title: AiTextState; digest: AiTextState }>): void {
    this.patchInput(this.title, autosave.values.title);
    this.patchInput(this.author, autosave.values.author);
    this.patchInput(this.digest, autosave.values.digest);
    this.saveState.textContent = saveStatusText(autosave.status);
    this.titleCandidates.update(text.title);
    this.digestCandidates.update(text.digest);
    this.mounted.updateCover(state);
    this.mounted.updatePublishStatus(state);
  }

  private patchInput(input: HTMLInputElement | HTMLTextAreaElement, value: string): void {
    if (document.activeElement !== input && input.value !== value) input.value = value;
  }

  destroy(): void {
    this.mounted.destroy();
  }
}
```

`PublishSettingsActions` must expose `updateArticle`, `flushArticle`, `generateTitle`, `generateDigest`, `adoptTitle`, `adoptDigest`, `openAiCover`, `chooseLocalCover`, and `restoreFirstImage`.

- [ ] **Step 5: Run focused tests**

Run:

```bash
npx vitest run tests/unit/ui/ai-text-candidates.test.ts tests/unit/ui/workbench-publish-settings.test.ts
npm run typecheck
```

Expected: PASS; title node identity, focus, cursor, and local value survive `update()`.

- [ ] **Step 6: Commit**

```bash
npm run scan:secrets
git add src/ui/ai-text-candidates.ts tests/unit/ui/ai-text-candidates.test.ts \
  src/ui/workbench-publish-settings.ts tests/unit/ui/workbench-publish-settings.test.ts
git commit -m "feat(workbench): add stable ai article controls"
```

## Task 9: Send Agnes-compatible Image Requests to the Exact Endpoint

**Files:**

- Modify: `src/cover/openai-image-generator.ts:1-198`
- Modify: `tests/unit/cover/openai-image-generator.test.ts`
- Modify: `tests/integration/cover-provider.test.ts`

- [ ] **Step 1: Rewrite the image request test to fail on current suffix joining**

```ts
const request: Readonly<AiCoverGenerationRequest> = Object.freeze({
  endpoint: 'https://images.example.test/custom/generate',
  model: 'synthetic-image-model',
  apiKey: credential,
  title: 'Article title',
  digest: 'Article digest',
  bodyExcerpt: 'Article body',
  supplementalPrompt: '',
});

it('posts to the exact endpoint with the fixed URL-output landscape contract', async () => {
  const current = transport({ data: [{ url: 'https://cdn.example.test/generated.png' }] });
  const generator = new OpenAiImageGenerator(current.http, { fetch: vi.fn() });

  await generator.generate(request);

  expect(current.requests[0]?.url).toBe('https://images.example.test/custom/generate');
  expect(current.requests[0]?.json).toMatchObject({
    model: 'synthetic-image-model',
    size: '2K',
    ratio: '21:9',
    extra_body: { response_format: 'url' },
  });
  expect(current.requests[0]?.json).not.toHaveProperty('n');
  expect(current.requests[0]?.json).not.toHaveProperty('return_base64');
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
npx vitest run tests/unit/cover/openai-image-generator.test.ts tests/integration/cover-provider.test.ts
```

Expected: FAIL because current code still sends the previous `n`/`1536x1024` contract.

- [ ] **Step 3: Update the request contract and prompt**

```ts
export interface AiCoverGenerationRequest {
  endpoint: string;
  model: string;
  apiKey: string;
  title: string;
  digest: string;
  bodyExcerpt: string;
  supplementalPrompt: string;
  signal?: AbortSignal;
}
```

Use the endpoint unchanged and send the fixed Agnes-compatible landscape contract:

```ts
response = await this.requestWithBoundary({
  method: 'POST',
  url: request.endpoint,
  headers: {
    Authorization: `Bearer ${request.apiKey}`,
    'Content-Type': 'application/json',
  },
  json: {
    model: request.model.trim(),
    prompt: prompt(request),
    size: '2K',
    ratio: '21:9',
    extra_body: { response_format: 'url' },
  },
}, request.signal);
```

Put `supplementalPrompt` in its own quoted untrusted section after the bounded article fields. Keep `b64_json` and URL output parsing, MIME validation, Base64 limit, cancellation, timeout, and redaction.

- [ ] **Step 4: Run focused tests**

Run:

```bash
npx vitest run tests/unit/cover/openai-image-generator.test.ts tests/integration/cover-provider.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run scan:secrets
git add src/cover/openai-image-generator.ts tests/unit/cover/openai-image-generator.test.ts \
  tests/integration/cover-provider.test.ts
git commit -m "refactor(cover): use exact image endpoint"
```

## Task 10: Keep AI Cover Bytes in Memory Until Adoption

**Files:**

- Modify: `src/cover/cover-types.ts`
- Modify: `src/cover/cover-workflow.ts:122-362`
- Modify: `tests/unit/cover/cover-workflow.test.ts`

- [ ] **Step 1: Write failing persistence-boundary tests**

```ts
it('does not save generated bytes or frontmatter before adoption', async () => {
  const current = harness();

  const candidate = await current.workflow.prepareAi(file, aiContext, '', undefined);

  expect(candidate.source).toBe('ai-generated');
  expect(candidate.vaultPath).toBeNull();
  expect(candidate.bytes).toEqual(processed);
  expect(current.save).not.toHaveBeenCalled();
  expect(current.processFrontmatter).not.toHaveBeenCalled();
});

it('saves and adopts an ai candidate only on confirm', async () => {
  const current = harness();
  const candidate = await current.workflow.prepareAi(file, aiContext, 'warm minimal', undefined);

  await current.workflow.confirm(file, candidate);

  expect(current.save).toHaveBeenCalledWith(file.path, processed);
  expect(current.frontmatter.cover).toBe('.wechat-workbench/covers/article-test/cover-abcd1234.png');
});

it('restores dynamic first image by clearing only the explicit cover', async () => {
  const current = harness();
  current.frontmatter.cover = '.wechat-workbench/covers/article/old.png';

  await current.workflow.restoreFirstImage(file);

  expect(current.frontmatter.cover).toBeUndefined();
  expect(current.frontmatter.custom).toBe('keep');
  expect(current.save).not.toHaveBeenCalled();
});

it('enables ai from the new image endpoint, model, and independent key only', () => {
  const current = harness();

  expect(current.workflow.model(snapshot, artifact)).toMatchObject({
    aiEnabled: true,
    aiDisabledReason: null,
  });
  current.settings.imageApiEndpoint = '';
  expect(current.workflow.model(snapshot, artifact)).toMatchObject({
    aiEnabled: false,
    aiDisabledReason: '图片 Endpoint URL 未配置',
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
npx vitest run tests/unit/cover/cover-workflow.test.ts
```

Expected: FAIL because current `prepareAi()` calls `processAndStore()` before confirmation.

- [ ] **Step 3: Add in-memory candidate bytes**

Extend `PreparedCover` so only an AI candidate can carry bytes before persistence:

```ts
export interface PreparedCover {
  source: PreparedCoverSource;
  persistence: 'SET_EXPLICIT_COVER' | 'CLEAR_EXPLICIT_COVER';
  notePath: string;
  contextHash: string;
  vaultPath: string | null;
  bytes: Uint8Array | null;
  mimeType: 'image/png';
  contentHash: string;
  previewDataUrl: string;
}
```

Update `model()` to ignore deprecated `imageApiProtocol` and `imageApiBaseUrl`. AI availability is exactly `imageApiEndpoint` + `imageApiModel` + `imageApiKey`; remove the old Anthropic capability branch and its tests.

Change the method signature to `prepareAi(file, context, supplementalPrompt, signal?)`. It must process generated bytes but not call storage:

```ts
const generated = await this.generator.generate({
  endpoint: settings.imageApiEndpoint,
  model: settings.imageApiModel,
  apiKey,
  title: context.title,
  digest: context.digest,
  bodyExcerpt: context.bodyExcerpt,
  supplementalPrompt,
  ...(signal === undefined ? {} : { signal }),
});
const processed = this.images.process(generated.bytes);
return Object.freeze({
  source: 'ai-generated', persistence: 'SET_EXPLICIT_COVER', notePath: file.path,
  contextHash: context.sourceHash, vaultPath: null, bytes: Uint8Array.from(processed),
  mimeType: 'image/png', contentHash: hash(processed), previewDataUrl: imageDataUrl(processed, 'image/png'),
});
```

In `confirm()`, when `source === 'ai-generated'` and `vaultPath === null`, save `bytes`, then write the returned Vault path to Frontmatter. If Frontmatter fails after save, throw `COVER_FILE_SAVED_FRONTMATTER_FAILED` with the saved path in a structured non-secret field; do not delete the file.

Add `restoreFirstImage(file)` that only deletes `frontmatter.cover`.

- [ ] **Step 4: Run cover tests**

Run:

```bash
npx vitest run tests/unit/cover/cover-workflow.test.ts tests/integration/cover-ui.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run scan:secrets
git add src/cover/cover-types.ts src/cover/cover-workflow.ts \
  tests/unit/cover/cover-workflow.test.ts
git commit -m "feat(cover): persist ai candidates on adoption"
```

## Task 11: Add the Modal-Only AI Cover Session and Interactive Confirmation UI

**Files:**

- Create: `src/ui/ai-cover-session.ts`
- Create: `tests/unit/ui/ai-cover-session.test.ts`
- Modify: `src/ui/ai-cover-confirmation.ts:1-108`
- Modify: `tests/unit/ui/ai-cover-confirmation.test.ts`

- [ ] **Step 1: Write failing session lifecycle tests**

```ts
it('reuses supplemental text for regeneration and clears it on close', async () => {
  const generate = vi.fn(async (_context, prompt: string) => candidate(prompt));
  const session = new AiCoverSession(generate);
  session.open(noteHash, context);
  session.setSupplementalPrompt('科技感、极简、暖色调');

  await session.generate();
  await session.generate();
  expect(generate).toHaveBeenNthCalledWith(2, context, '科技感、极简、暖色调', expect.any(AbortSignal));

  session.close();
  expect(session.snapshot()).toMatchObject({ status: 'closed', supplementalPrompt: '', candidate: null });
});

it('keeps the current cover unchanged until adopt', async () => {
  const adopt = vi.fn(async () => undefined);
  const session = createSession({ adopt });
  session.open(noteHash, context);
  await session.generate();

  expect(adopt).not.toHaveBeenCalled();
  await session.adopt();
  expect(adopt).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Write failing modal DOM tests**

```ts
it('shows endpoint, model, sent fields, cost, prompt, preview, regenerate, and adopt', async () => {
  const modal = createModal();
  modal.open();

  expect(modal.contentEl.textContent).toContain('https://images.example.test/custom/generate');
  expect(modal.contentEl.textContent).toContain('image-model');
  expect(modal.contentEl.textContent).toContain('可能产生第三方费用');
  expect(modal.contentEl.querySelector('[data-testid="cover-supplemental-prompt"]')).not.toBeNull();
  click(modal.contentEl, 'cover-generate');
  await flushPromises();
  expect(modal.contentEl.querySelector('[data-testid="cover-candidate-preview"]')).not.toBeNull();
  expect(modal.contentEl.querySelector('[data-testid="cover-regenerate"]')).not.toBeNull();
  expect(modal.contentEl.querySelector('[data-testid="cover-adopt"]')).not.toBeNull();
});
```

- [ ] **Step 3: Run tests and verify failure**

Run:

```bash
npx vitest run tests/unit/ui/ai-cover-session.test.ts tests/unit/ui/ai-cover-confirmation.test.ts
```

Expected: FAIL because the current modal closes before generation and has no session candidate.

- [ ] **Step 4: Implement `AiCoverSession`**

```ts
export interface AiCoverSessionState {
  status: 'closed' | 'idle' | 'generating' | 'ready' | 'error' | 'adopting';
  notePathHash: string | null;
  supplementalPrompt: string;
  candidate: Readonly<PreparedCover> | null;
  errorCode: string | null;
}
```

Methods: `open(notePathHash, context)`, `setSupplementalPrompt(value)`, `generate()`, `adopt()`, `close()`, `snapshot()`, and `subscribe(listener)`. Limit the prompt to 500 Unicode characters. `generate()` replaces the previous candidate only after a new candidate succeeds; on failure keep the previous successful candidate visible and show the error.

- [ ] **Step 5: Rebuild the modal around the session**

The modal must remain open through generation. Use `textContent` for all remote/user values, a textarea for the optional prompt, one preview `<img>` bound to `previewDataUrl`, and explicit buttons:

```text
取消 | 重新生成 | 确认并生成 / 采用此封面
```

Disable generation while `generating`, disable adoption while no candidate exists, and call `session.close()` from every close path. Reopening starts with an empty prompt.

- [ ] **Step 6: Run focused tests**

Run:

```bash
npx vitest run tests/unit/ui/ai-cover-session.test.ts tests/unit/ui/ai-cover-confirmation.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
npm run scan:secrets
git add src/ui/ai-cover-session.ts tests/unit/ui/ai-cover-session.test.ts \
  src/ui/ai-cover-confirmation.ts tests/unit/ui/ai-cover-confirmation.test.ts
git commit -m "feat(cover): add interactive ai cover session"
```

## Task 12: Wire Workbench Lifecycle, Direct Cover Card, and Approved Styles

**Files:**

- Modify: `src/ui/workbench-controller.ts:95-430`
- Modify: `src/ui/workbench-view.ts:167-470`
- Modify: `src/ui/workbench-publish-settings.ts`
- Modify: `src/ui/cover-picker-modal.ts:88-220`
- Modify: `src/main.ts:28-280`
- Modify: `styles.css`
- Modify: `tests/unit/ui/workbench-view.test.ts`
- Modify: `tests/integration/cover-ui.test.ts`
- Modify: `tests/integration/publish-ui.test.ts`
- Modify: `tests/visual/workbench-visual.test.ts`

- [ ] **Step 1: Write failing integration tests for the approved page**

```ts
it('renders direct cover actions and no article save button', async () => {
  const current = await openPublishSettings();

  expect(current.host.querySelector('[data-testid="settings-save"]')).toBeNull();
  expect(current.host.querySelector('[data-testid="generate-title"]')).not.toBeNull();
  expect(current.host.querySelector('[data-testid="generate-digest"]')).not.toBeNull();
  expect(current.host.querySelector('[data-testid="generate-cover"]')).not.toBeNull();
  expect(current.host.querySelector('[data-testid="choose-local-cover"]')).not.toBeNull();
  expect(current.host.querySelector('[data-testid="restore-first-image"]')).toBeNull();
  expect(current.host.textContent).toContain('自动使用文章首图');
});

it('shows restore only for an explicit cover and clears it without deleting files', async () => {
  const current = await openPublishSettings({ explicitCover: '.wechat-workbench/covers/note/cover.png' });

  click(current.host, 'restore-first-image');
  await flushPromises();

  expect(current.covers.restoreFirstImage).toHaveBeenCalledOnce();
  expect(current.files.delete).not.toHaveBeenCalled();
});
```

Add a view lifecycle test that edits title, calls `showArtifact()` with a new content hash, and asserts the input node/focus/value survive. Add an `onClose()` test that awaits autosave flush and cancels text/cover sessions.

- [ ] **Step 2: Run integration tests and verify failure**

Run:

```bash
npx vitest run tests/unit/ui/workbench-view.test.ts tests/integration/cover-ui.test.ts \
  tests/integration/publish-ui.test.ts tests/visual/workbench-visual.test.ts
```

Expected: FAIL because current view recreates settings, uses a cover picker entry point, and has no AI text/autosave wiring.

- [ ] **Step 3: Extend controller ports and actions**

Add narrow ports:

```ts
export interface WorkbenchAiTextPort {
  bindNote(notePathHash: string): void;
  updateSource(sourceHash: string): void;
  generateTitle(context: Readonly<AiArticleContext>): Promise<Readonly<AiTextState>>;
  generateDigest(context: Readonly<AiArticleContext>): Promise<Readonly<AiTextState>>;
  state(target: AiTextTarget): Readonly<AiTextState>;
  close(target: AiTextTarget): void;
  cancelAll(): void;
}

export interface WorkbenchArticleAutosavePort {
  bind(file: VaultFileRef, values: Readonly<ArticleDraftValues>): void;
  update(values: Readonly<ArticleDraftValues>): void;
  flush(): Promise<void>;
  snapshot(): Readonly<ArticleAutosaveSnapshot>;
  destroy(): Promise<void>;
}
```

Controller generation methods build context from the latest snapshot/artifact plus autosave values. Candidate adoption updates autosave values. Cover actions expose AI session, native local picker, and `restoreFirstImage()` separately.

- [ ] **Step 4: Preserve one `PublishSettingsView` instance per open workbench**

In `WorkbenchView.onOpen()`, construct one `PublishSettingsView` after `settingsEl` exists. In `showArtifact()`, call `publishSettings.update(...)`; do not call the old stateless renderer. In `onClose()`:

```ts
async onClose(): Promise<void> {
  await this.articleAutosave?.flush().catch(error => this.showArticleSaveFailure(error));
  this.aiText?.cancelAll();
  this.aiCoverSession?.close();
  this.controller?.stop();
  this.previewRenderer.clear();
  this.publishSettings?.destroy();
}
```

On active-note switch, flush the previous note before binding new article values; cancel old text and cover requests immediately so cross-note results cannot render.

- [ ] **Step 5: Wire services in `main.ts`**

Construct one shared `AiArticleContextBuilder` function, a text generator using a 1 MiB bounded transport, an image generator using the existing 32 MiB transport, one text workflow, and per-view autosave/cover session factories. Do not inject `AiModelCatalog` into `AiServiceSettingsService` or settings UI.

Retain `src/cover/ai-model-catalog.ts` without wiring it; deletion is outside this plan.

- [ ] **Step 6: Implement the direct cover card**

The card derives state from `artifact.metadata.cover` and the first ordinary asset:

```ts
const first = state.artifact.assets.find(asset =>
  asset.kind === 'local-image' || asset.kind === 'remote-image');
const explicit = state.artifact.metadata.cover !== null;

coverTitle.textContent = explicit
  ? coverSourceLabel(state)
  : first === undefined ? '暂未设置封面' : '自动使用文章首图';
restoreButton.hidden = !explicit;
```

Do not display Vault paths. Remote first-image passive preview remains a placeholder until an explicit network action.

- [ ] **Step 7: Apply approved styles**

Add stable, scoped classes using Obsidian variables:

```css
.wechat-workbench__article-save-state {
  min-height: var(--line-height-tight);
  color: var(--text-muted);
  font-size: var(--font-smallest);
}

.wechat-workbench__ai-candidates {
  margin-top: var(--size-4-2);
  padding: var(--size-4-2);
  border: 1px solid color-mix(in srgb, var(--interactive-accent) 24%, var(--background-modifier-border));
  border-radius: var(--radius-s);
  background: color-mix(in srgb, var(--interactive-accent) 5%, var(--background-primary));
}

.wechat-workbench__cover-summary {
  display: grid;
  grid-template-columns: minmax(120px, 174px) 1fr;
  gap: var(--size-4-3);
  align-items: center;
}
```

The settings screen, light/dark/accent switcher, and cover scenario picker from the prototype must not enter production.

- [ ] **Step 8: Run integration and visual tests**

Run:

```bash
npx vitest run tests/unit/ui/workbench-view.test.ts tests/integration/cover-ui.test.ts \
  tests/integration/publish-ui.test.ts tests/visual/workbench-visual.test.ts
npm run lint
npm run typecheck
npm run build
```

Expected: PASS; visual snapshot hashes change only for the approved settings/publish UI surfaces.

- [ ] **Step 9: Commit**

```bash
npm run scan:secrets
git add src/ui/workbench-controller.ts src/ui/workbench-view.ts \
  src/ui/workbench-publish-settings.ts src/ui/cover-picker-modal.ts src/main.ts styles.css \
  tests/unit/ui/workbench-view.test.ts tests/integration/cover-ui.test.ts \
  tests/integration/publish-ui.test.ts tests/visual/workbench-visual.test.ts
git commit -m "feat(workbench): integrate ai content workflows"
```

## Task 13: Add Full-Story, Adversarial, and Fixed-Vault Acceptance Evidence

**Files:**

- Create: `tests/integration/ai-content-generation.test.ts`
- Modify: `tests/adversarial/ai-content-boundary.test.ts`
- Modify: `tests/adversarial/network-assets.test.ts`
- Modify: `tests/adversarial/secret-leakage.test.ts`
- Modify: `docs/verification/account-cover-ui-refinement.md`
- Create: `docs/verification/ai-content-generation.md`

- [ ] **Step 1: Add a no-network-before-generation integration test**

```ts
it('does not contact ai endpoints during load, render, edit, or settings save', async () => {
  const http = { request: vi.fn() };
  const current = await createIntegratedWorkbench({ http });

  await current.load();
  current.render();
  current.editTitle('Local edit');
  await vi.advanceTimersByTimeAsync(600);
  await current.saveTextSettings({
    endpoint: 'https://text.example.test/v1/chat', model: 'text-model', apiKey: 'synthetic-key',
  });

  expect(http.request).not.toHaveBeenCalled();
  await current.generateTitle();
  expect(http.request).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Add a complete candidate/adopt/restore integration test**

```ts
it('generates candidates without overwrite and adopts only explicit choices', async () => {
  const current = await createIntegratedWorkbench({
    textResponse: { choices: [{ message: { content: '{"titles":["A","B","C"]}' } }] },
    imageResponse: { data: [{ b64_json: encodedPng }] },
  });

  await current.generateTitle();
  expect(current.title()).toBe('Original');
  expect(current.titleCandidates()).toEqual(['A', 'B', 'C']);
  await current.adoptTitle('B');
  expect(current.title()).toBe('B');

  await current.generateCover('minimal warm');
  expect(current.frontmatter().cover).toBeUndefined();
  await current.adoptCover();
  expect(current.frontmatter().cover).toMatch(/^\.wechat-workbench\/covers\//u);
  await current.restoreFirstImage();
  expect(current.frontmatter().cover).toBeUndefined();
});
```

- [ ] **Step 3: Extend adversarial coverage**

Verify all of the following with explicit assertions:

- Literal and DNS-resolved local/private AI endpoints fail before credentials are sent.
- Redirects to private targets fail closed.
- Old text/image Key is never sent to a changed Origin.
- Provider errors containing a synthetic Key are redacted.
- One-megabyte text output and oversized Base64 image output are rejected.
- Prompt injection cannot alter the requested JSON contract or expose local metadata.
- Switching notes cancels requests and prevents cross-note candidates/adoption.
- A 100-click burst creates one in-flight request per target and no automatic retries.
- `data.json`, Frontmatter, logs, errors, verification Markdown, and snapshots contain no AI Key or full request content.

- [ ] **Step 4: Run the complete automatic gate**

Run:

```bash
npm test
npm run lint
npm run typecheck
npm run build
npm run verify:release
npm run scan:secrets
git diff --check
```

Expected: every command passes. Record exact test counts and command output summaries in `docs/verification/ai-content-generation.md`.

- [ ] **Step 5: Sync only to the fixed test Vault**

Run:

```bash
npm run sync:test-vault
```

Expected: production plugin assets are copied only to:

```text
$HOME/workspace/Github/wechat-workbench-test-vault/.obsidian/plugins/wechat-workbench/
```

Verify no path under `$HOME/workspace/Github/commit_note/.obsidian/plugins/` was modified.

- [ ] **Step 6: Perform real Obsidian desktop acceptance**

In the fixed Vault, capture evidence for:

1. Settings page shows independent text/image Endpoint, Key, and model fields.
2. Saving either configuration makes no network request and displays “尚未联网验证”.
3. Continuous title/author/digest typing for at least 10 seconds shows no flicker, lost focus, cursor jump, or value rollback.
4. Blur and note switch flush pending article values.
5. Title generation returns exactly three candidates and does not overwrite.
6. Digest generation returns exactly one candidate and does not overwrite.
7. Regenerate replaces candidates; adopt writes only the chosen value.
8. Default cover follows first ordinary article image; an image-free note shows empty cover.
9. AI cover disclosure shows exact endpoint, model, sent fields, and cost warning.
10. Supplemental prompt survives regeneration and clears after close/reopen.
11. AI cover remains unchanged before adoption, persists after adoption, and restores to article first image without deleting the generated file.
12. Provider/network/auth/model errors show redacted actionable messages.

Use user-provided local SecretStorage configuration. Do not write real Endpoint credentials or raw provider responses into evidence. If no working text or image provider is configured, mark the corresponding real-generation item `BLOCKED`, not `PASS`.

- [ ] **Step 7: Record cross-platform status honestly**

Record macOS version, Obsidian version, plugin commit, test Vault path, provider protocol label, and model names without keys. Windows and Linux must at least cover configuration UI, autosave, synthetic candidates, modal cancellation, and first-image restoration. Unrun platforms remain `NOT RUN`.

- [ ] **Step 8: Commit verification assets**

```bash
npm run scan:secrets
git add tests/integration/ai-content-generation.test.ts \
  tests/adversarial/ai-content-boundary.test.ts tests/adversarial/network-assets.test.ts \
  tests/adversarial/secret-leakage.test.ts docs/verification/ai-content-generation.md \
  docs/verification/account-cover-ui-refinement.md
git commit -m "test(ai): verify content generation workflows"
```

## Plan Self-Review Checklist

- [x] Every approved design section 1–18 maps to at least one task.
- [x] Text and image settings remain independent through schema, secrets, UI, and runtime.
- [x] No task restores model discovery, protocol selection, Anthropic, local Codex, or built-in providers.
- [x] Configuration save has no network path.
- [x] AI context is bounded, sanitized, and excludes raw Markdown/private fields.
- [x] Title returns exactly 3 candidates; digest returns exactly 1.
- [x] Candidate generation never directly overwrites article values.
- [x] Autosave uses 600ms debounce, single-flight writes, flush, and stable DOM.
- [x] AI image request uses the exact endpoint with `size: "2K"`, `ratio: "21:9"`, `extra_body.response_format: "url"`, and a shared 120-second outer/inner transport boundary.
- [x] AI cover bytes remain in memory until adoption.
- [x] Supplemental prompt is modal-only, reusable for regeneration, and cleared on close.
- [x] Restore-first-image clears Frontmatter only and does not delete files.
- [x] Every task includes failing test, focused verification, secret scan, and focused commit.
- [x] Real desktop and cross-platform outcomes distinguish `PASS`, `BLOCKED`, and `NOT RUN`.

## Session Batches and Acceptance Checkpoints

### Batch 1: Configuration foundation

Tasks: 1–3.

Checkpoint:

- schema v4 migration passes without URL suffix guessing.
- Text and image Secret IDs are independent.
- Settings UI contains no protocol or model discovery controls.
- Save is local-only and reports unverified state.

### Batch 2: Bounded text generation

Tasks: 4–6.

Checkpoint:

- Sanitized context budgets and prompt-injection boundary pass.
- Exact text endpoint receives only model/messages.
- Title/digest state is independent, cancellable, and cross-note safe.

### Batch 3: Stable article editing

Tasks: 7–8.

Checkpoint:

- 600ms debounce, blur/switch flush, single-flight ordering, and retry pass.
- Input node, focus, cursor, and local value remain stable during updates.
- Title 3 / digest 1 candidate UI does not directly overwrite.

### Batch 4: Preview-before-adopt cover generation

Tasks: 9–11.

Checkpoint:

- Exact image endpoint and the documented Agnes-compatible landscape request pass.
- One candidate stays in memory until adoption.
- Supplemental prompt survives regenerate and clears on close.
- Restore-first-image changes Frontmatter only.

### Batch 5: Full integration and acceptance

Tasks: 12–13.

Checkpoint:

- Approved settings and publish UI are wired without prototype-only controls.
- Automatic quality gates pass.
- Fixed-Vault macOS evidence is complete or accurately blocked.
- Windows/Linux remain explicit `PASS`, `BLOCKED`, or `NOT RUN`.
