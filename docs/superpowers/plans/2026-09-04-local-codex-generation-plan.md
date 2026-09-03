# Local Codex Content Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add independently selectable `原始 API` and `本地 Codex` backends to title, digest, and cover generation, with automatic local Codex discovery and a real Codex image-generation path.

**Architecture:** Keep the existing remote provider adapters intact and add a shell-free local Codex boundary around stable `codex exec --ephemeral`. Settings store one default backend for text and one for image; each workbench action freezes an optional per-operation override and routes to the matching adapter without silent fallback. Text consumes the final JSONL agent message; image generation correlates the JSONL `thread_id` with `$CODEX_HOME/generated_images/<thread_id>/` before entering the existing cover candidate workflow.

**Tech Stack:** TypeScript 5.8, Obsidian 1.13 desktop API, Node `child_process`/`fs`/`os`/`path`, Codex CLI non-interactive mode, Vitest 4 + jsdom, esbuild.

## Global Constraints

- Desktop only; keep `manifest.json.isDesktopOnly: true` and `minAppVersion >= 1.11.4`.
- Fixed real acceptance Vault: `$HOME/workspace/Github/wechat-workbench-test-vault`; never load the development build into `commit_note`.
- Use `codex exec --ephemeral`; do not use app-server or automate Codex Desktop UI.
- Launch child processes with argument arrays and `shell: false`; user content must never be interpolated into a Shell command.
- Disable Codex Shell, Apps, browser and Computer Use tools for generation.
- Never read, display, copy or persist Codex authentication material.
- Never pass plugin API keys, AppSecret or Access Token into the Codex child environment.
- Old settings migrate to `api` for both defaults; discovery must not silently change an existing user's backend.
- Workbench overrides affect only the current UI session/request and never write Frontmatter or plugin defaults.
- Codex failure must not silently fall back to the remote API and must not auto-retry generation.
- Existing candidate-before-adopt, automatic article-field save and generated-cover persistence rules remain unchanged.
- Every production behavior starts with a focused failing test.
- Before every commit run `npm run scan:secrets` and `git diff --check`.
- Do not push, publish, deploy, rebase, reset, modify credentials, or create a public release in this plan.

## Source of Truth

- Design: `docs/superpowers/specs/2026-09-04-local-codex-generation-design.md`
- Existing AI design: `docs/superpowers/specs/2026-08-23-ai-content-generation-design.md`
- Existing text adapter: `src/ai/openai-text-generator.ts`
- Existing image adapter: `src/cover/openai-image-generator.ts`
- Existing workbench entry points: `src/ui/article-settings-form.ts`, `src/ui/ai-cover-confirmation.ts`

## Critical Path

`Codex process can run safely` → `text result reaches existing candidates` → `image reaches existing cover candidate` → `settings/default and per-operation UI route correctly` → `real isolated-Vault acceptance`.

## File and Responsibility Map

### New production files

- `src/codex/codex-errors.ts` — stable error codes and public-safe error type.
- `src/codex/codex-locator.ts` — executable discovery and validation only.
- `src/codex/codex-process-runner.ts` — bounded shell-free child process execution only.
- `src/codex/codex-exec-client.ts` — stable Codex arguments and JSONL event contract.
- `src/codex/codex-capability-service.ts` — version and `image_generation` feature detection.
- `src/ai/codex-text-generator.ts` — title/digest prompts and final-message validation.
- `src/cover/codex-generated-image-store.ts` — thread-scoped generated image validation/read.
- `src/cover/codex-image-generator.ts` — `$imagegen` prompt and `GeneratedCover` conversion.

### Existing production files

- `src/settings/model.ts`, `src/settings/settings-store.ts` — schema v6 and independent default backends.
- `src/settings/settings-tab.ts` — API/Codex settings cards and local capability status.
- `src/ai/article-text-service.ts` — freeze and route text backend.
- `src/cover/cover-workflow.ts` — freeze and route image backend.
- `src/ui/article-settings-form.ts` — title/digest per-operation selectors and Codex errors.
- `src/ui/ai-cover-confirmation.ts` — cover backend selector, source-specific disclosure and errors.
- `src/ui/workbench-controller.ts`, `src/ui/workbench-view.ts`, `src/ui/workbench-publish-settings.ts` — carry frozen backend choice.
- `src/main.ts` — construct Codex services and inject both adapter paths.
- `styles.css` — native compact selector/status layout.
- `SECURITY.md`, `PRIVACY.md`, `README.md` — disclose local process and Codex data path.

### New tests

- `tests/unit/codex/codex-locator.test.ts`
- `tests/unit/codex/codex-process-runner.test.ts`
- `tests/unit/codex/codex-exec-client.test.ts`
- `tests/unit/codex/codex-capability-service.test.ts`
- `tests/unit/ai/codex-text-generator.test.ts`
- `tests/unit/cover/codex-generated-image-store.test.ts`
- `tests/unit/cover/codex-image-generator.test.ts`

### Existing tests to extend

- `tests/unit/settings/settings-store.test.ts`
- `tests/unit/settings/settings-tab.test.ts`
- `tests/unit/ai/article-text-service.test.ts`
- `tests/unit/cover/cover-workflow.test.ts`
- `tests/unit/ui/ai-cover-confirmation.test.ts`
- `tests/unit/ui/workbench-publish-settings.test.ts`
- `tests/integration/workbench.test.ts`
- `tests/adversarial/secret-leakage.test.ts`

## Baseline Gate

- [ ] Run `git status --short --branch`; expected: `main` with only this plan before its commit.
- [ ] Run `npm test`; expected: PASS.
- [ ] Run `npm run lint`; expected: PASS.
- [ ] Run `npm run typecheck`; expected: PASS.
- [ ] Run `npm run build`; expected: PASS.
- [ ] Run `npm run verify:release`; expected: PASS.
- [ ] Run `npm run scan:secrets`; expected: PASS.

---

### Task 1: Persist Independent Text and Image Backend Defaults

**Files:**
- Modify: `src/settings/model.ts`
- Modify: `src/settings/settings-store.ts`
- Test: `tests/unit/settings/settings-store.test.ts`

**Interfaces:**
- Produces: `GenerationBackend`, `LocalCodexSettings`, `PluginSettings.textGenerationBackend`, `PluginSettings.imageGenerationBackend`, `PluginSettings.localCodex`.
- Consumes: existing `SettingsStore` load/save sanitization.

- [ ] **Step 1: Write failing schema migration tests**

```ts
it('migrates schema v5 to API backends without changing providers', async () => {
  const settings = await new SettingsStore(new MemoryPluginData({
    ...DEFAULT_SETTINGS,
    schemaVersion: 5,
  })).load();
  expect(settings.schemaVersion).toBe(6);
  expect(settings.textGenerationBackend).toBe('api');
  expect(settings.imageGenerationBackend).toBe('api');
  expect(settings.localCodex).toEqual({ executablePath: '' });
});

it('sanitizes invalid backend and trims the executable path', async () => {
  const settings = await loadSchema6({
    textGenerationBackend: 'unknown',
    imageGenerationBackend: 'codex',
    localCodex: { executablePath: '  /opt/homebrew/bin/codex  ' },
  });
  expect(settings.textGenerationBackend).toBe('api');
  expect(settings.imageGenerationBackend).toBe('codex');
  expect(settings.localCodex.executablePath).toBe('/opt/homebrew/bin/codex');
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx vitest run tests/unit/settings/settings-store.test.ts`

Expected: FAIL because schema v6 and backend fields do not exist.

- [ ] **Step 3: Add the exact settings types and defaults**

```ts
export type GenerationBackend = 'api' | 'codex';

export interface LocalCodexSettings {
  executablePath: string;
}

export interface PluginSettings {
  readonly schemaVersion: 6;
  // existing fields remain unchanged
  textGenerationBackend: GenerationBackend;
  imageGenerationBackend: GenerationBackend;
  localCodex: Readonly<LocalCodexSettings>;
}
```

Set both backend defaults to `api` and the executable path to `''`. Extend `sanitizeSettings()` to accept schema 6; only schema 6 reads the new fields. Use a strict helper:

```ts
function generationBackend(value: unknown): GenerationBackend {
  return value === 'codex' ? 'codex' : 'api';
}
```

- [ ] **Step 4: Run focused tests and typecheck**

Run: `npx vitest run tests/unit/settings/settings-store.test.ts`

Run: `npm run typecheck`

Expected: both PASS.

- [ ] **Step 5: Scan and commit**

Run: `npm run scan:secrets`

Run: `git diff --check`

Commit: `feat(settings): add local Codex backend defaults`

---

### Task 2: Add a Bounded Shell-Free Codex Runtime Boundary

**Files:**
- Create: `src/codex/codex-errors.ts`
- Create: `src/codex/codex-locator.ts`
- Create: `src/codex/codex-process-runner.ts`
- Create: `src/codex/codex-exec-client.ts`
- Create: `src/codex/codex-capability-service.ts`
- Test: `tests/unit/codex/codex-locator.test.ts`
- Test: `tests/unit/codex/codex-process-runner.test.ts`
- Test: `tests/unit/codex/codex-exec-client.test.ts`
- Test: `tests/unit/codex/codex-capability-service.test.ts`

**Interfaces:**
- Consumes: optional configured path from Task 1.
- Produces:

```ts
export interface CodexRunRequest {
  executable: string;
  args: readonly string[];
  cwd: string;
  timeoutMs: number;
  maxStdoutBytes: number;
  maxStderrBytes: number;
  env: Readonly<Record<string, string>>;
  signal?: AbortSignal;
}

export interface CodexRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface CodexExecResult {
  threadId: string;
  finalMessage: string;
  completed: boolean;
}

export interface CodexCapabilities {
  available: boolean;
  executablePath: string | null;
  version: string | null;
  imageGeneration: boolean;
  errorCode: string | null;
}
```

- [ ] **Step 1: Write failing locator and process-boundary tests**

Cover these exact cases:

```ts
it('prefers the configured executable and never enables shell', async () => {
  const result = await locator.locate('/custom/codex');
  expect(result).toBe('/custom/codex');
  expect(spawnCalls[0]).toMatchObject({ executable: '/custom/codex', shell: false });
});

it('kills a timed-out child and returns CODEX_TIMEOUT', async () => {
  await expect(runner.run(request({ timeoutMs: 10 })))
    .rejects.toMatchObject({ code: 'CODEX_TIMEOUT' });
  expect(child.kill).toHaveBeenCalled();
});

it('rejects stdout beyond its byte limit', async () => {
  child.stdout.emit('data', Buffer.alloc(65));
  await expect(result).rejects.toMatchObject({ code: 'CODEX_OUTPUT_TOO_LARGE' });
});

it('passes only the explicit environment allowlist', async () => {
  await runner.run(request({ env: { HOME: '/home/user', PATH: '/bin' } }));
  expect(spawnOptions.env).toEqual({ HOME: '/home/user', PATH: '/bin' });
  expect(JSON.stringify(spawnOptions.env)).not.toContain('API_KEY');
});
```

- [ ] **Step 2: Run the runtime tests and verify RED**

Run: `npx vitest run tests/unit/codex`

Expected: FAIL because the Codex modules do not exist.

- [ ] **Step 3: Implement public-safe errors, locator and runner**

`CodexRuntimeError` accepts only the design's fixed codes. `CodexLocator` probes configured path, `codex`, `/opt/homebrew/bin/codex`, and `/usr/local/bin/codex` in order using `--version`. `CodexProcessRunner` uses injected `spawn` with `{ shell: false, stdio: ['pipe', 'pipe', 'pipe'] }`, immediately calls `stdin.end()`, bounds both streams, listens for abort, applies one timer, and settles exactly once.

- [ ] **Step 4: Write failing JSONL and capability tests**

```ts
it('uses the stable restricted exec argument set', async () => {
  await client.exec({ sandbox: 'read-only', prompt: 'synthetic', timeoutMs: 120_000 });
  expect(run.args).toEqual(expect.arrayContaining([
    'exec', '--ephemeral', '--skip-git-repo-check', '--ignore-rules',
    '--ignore-user-config', '--disable', 'shell_tool', '--disable', 'apps',
    '--disable', 'browser_use', '--disable', 'computer_use', '--json',
  ]));
});

it('ignores reconnect events and returns the final completed agent message', async () => {
  processResult.stdout = jsonl(
    { type: 'thread.started', thread_id: 'thread-1' },
    { type: 'error', message: 'Reconnecting...' },
    { type: 'item.completed', item: { type: 'agent_message', text: '{"ok":true}' } },
    { type: 'turn.completed' },
  );
  await expect(client.exec(input)).resolves.toMatchObject({
    threadId: 'thread-1', finalMessage: '{"ok":true}', completed: true,
  });
});

it('detects image_generation from features list without generation', async () => {
  processResult.stdout = 'image_generation stable true\n';
  await expect(capabilities.detect('')).resolves.toMatchObject({ imageGeneration: true });
});
```

- [ ] **Step 5: Implement `CodexExecClient` and capability detection**

The client appends the prompt as the final argument, parses each non-empty stdout line independently, records the first `thread.started.thread_id`, replaces the final message only for `item.completed/item.type === 'agent_message'`, and requires `turn.completed`. Capability detection executes `--version` and `features list` only; it never invokes a model.

- [ ] **Step 6: Run focused tests, lint and typecheck**

Run: `npx vitest run tests/unit/codex`

Run: `npm run lint`

Run: `npm run typecheck`

Expected: all PASS.

- [ ] **Step 7: Scan and commit**

Run: `npm run scan:secrets`

Run: `git diff --check`

Commit: `feat(codex): add bounded local runtime`

---

### Task 3: Route Title and Digest Generation to Local Codex

**Files:**
- Create: `src/ai/codex-text-generator.ts`
- Modify: `src/ai/article-text-service.ts`
- Modify: `src/ui/workbench-controller.ts`
- Modify: `src/main.ts`
- Test: `tests/unit/ai/codex-text-generator.test.ts`
- Test: `tests/unit/ai/article-text-service.test.ts`
- Test: `tests/integration/workbench.test.ts`

**Interfaces:**
- Consumes: `GenerationBackend`, `CodexExecClient`, existing `AiArticleContext` and `OpenAiTextGenerator`.
- Produces:

```ts
export interface LocalTextGenerationRequest {
  context: Readonly<AiArticleContext>;
  signal?: AbortSignal;
}

export interface LocalTextGenerator {
  generateTitles(request: Readonly<LocalTextGenerationRequest>): Promise<readonly string[]>;
  generateDigest(request: Readonly<LocalTextGenerationRequest>): Promise<string>;
}

export interface ArticleTextGenerationInput {
  snapshot: Readonly<NoteSnapshot>;
  artifact: Readonly<RenderArtifact>;
  draft: Readonly<ArticleDraftValues>;
  backend?: GenerationBackend;
  signal?: AbortSignal;
}
```

- [ ] **Step 1: Write failing Codex text adapter tests**

```ts
it('generates exactly three validated titles from the final message', async () => {
  exec.finalMessage = '{"titles":["标题一","标题二","标题三"]}';
  await expect(generator.generateTitles({ context })).resolves.toEqual(['标题一', '标题二', '标题三']);
  expect(exec.request.sandbox).toBe('read-only');
  expect(exec.request.disabledFeatures).toContain('image_generation');
});

it('rejects duplicate titles', async () => {
  exec.finalMessage = '{"titles":["重复","重复","第三个"]}';
  await expect(generator.generateTitles({ context }))
    .rejects.toMatchObject({ code: 'CODEX_OUTPUT_INVALID' });
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npx vitest run tests/unit/ai/codex-text-generator.test.ts`

Expected: FAIL because `CodexTextGenerator` does not exist.

- [ ] **Step 3: Implement text prompts and validation**

Build prompts from the already bounded `AiArticleContext`, delimit source as untrusted, and request only the existing JSON shapes. Reuse/export the title and digest parsing/cleaning helpers from `openai-text-generator.ts` instead of adding a second looser validator.

- [ ] **Step 4: Write failing routing tests**

```ts
it('uses the configured default backend when the call has no override', async () => {
  settings.textGenerationBackend = 'codex';
  await service.generateTitles(input());
  expect(codex.generateTitles).toHaveBeenCalledOnce();
  expect(api.generateTitles).not.toHaveBeenCalled();
});

it('uses a one-call API override without mutating settings', async () => {
  settings.textGenerationBackend = 'codex';
  await service.generateDigest(input({ backend: 'api' }));
  expect(api.generateDigest).toHaveBeenCalledOnce();
  expect(settings.textGenerationBackend).toBe('codex');
});

it('does not fall back to API when Codex fails', async () => {
  codex.generateTitles.mockRejectedValue(new CodexRuntimeError('CODEX_PROCESS_FAILED'));
  await expect(service.generateTitles(input({ backend: 'codex' }))).rejects.toMatchObject({ code: 'CODEX_PROCESS_FAILED' });
  expect(api.generateTitles).not.toHaveBeenCalled();
});
```

- [ ] **Step 5: Implement frozen text routing and main wiring**

`ArticleTextGenerationService` resolves `input.backend ?? settings.textGenerationBackend` once before awaiting. API requests continue to resolve the current provider and secret. Codex requests pass only the bounded context and signal. Extend controller/view callback signatures to carry the chosen backend.

- [ ] **Step 6: Run focused and integration tests**

Run: `npx vitest run tests/unit/ai/codex-text-generator.test.ts tests/unit/ai/article-text-service.test.ts tests/integration/workbench.test.ts`

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 7: Scan and commit**

Run: `npm run scan:secrets`

Run: `git diff --check`

Commit: `feat(ai): route text generation through Codex`

---

### Task 4: Route Smart Cover Generation to Thread-Scoped Codex Images

**Files:**
- Create: `src/cover/codex-generated-image-store.ts`
- Create: `src/cover/codex-image-generator.ts`
- Modify: `src/cover/cover-generator.ts`
- Modify: `src/cover/cover-workflow.ts`
- Modify: `src/main.ts`
- Test: `tests/unit/cover/codex-generated-image-store.test.ts`
- Test: `tests/unit/cover/codex-image-generator.test.ts`
- Test: `tests/unit/cover/cover-workflow.test.ts`
- Test: `tests/adversarial/secret-leakage.test.ts`

**Interfaces:**
- Consumes: `CodexExecClient`, `GenerationBackend`, existing `GeneratedCover` and cover processing/storage.
- Produces:

```ts
export interface LocalCoverGenerationRequest {
  title: string;
  digest: string;
  supplementalPrompt: string;
  presetId?: string;
  includeTitle: boolean;
  includeDigest: boolean;
  signal?: AbortSignal;
}

export interface LocalCoverGenerator {
  generate(request: Readonly<LocalCoverGenerationRequest>): Promise<Readonly<GeneratedCover>>;
}

export interface CodexGeneratedImageStorePort {
  read(threadId: string): Promise<Readonly<{
    bytes: Uint8Array;
    mimeType: SupportedImageMime;
  }>>;
}
```

- [ ] **Step 1: Write failing thread-directory safety tests**

```ts
it('reads only the exact generated_images thread directory', async () => {
  await store.read('01-valid-thread');
  expect(fs.readdir).toHaveBeenCalledWith(
    '/home/user/.codex/generated_images/01-valid-thread',
    expect.anything(),
  );
});

it.each(['../escape', '/absolute', 'thread/child', ''])('rejects unsafe thread id %s', async threadId => {
  await expect(store.read(threadId)).rejects.toMatchObject({ code: 'CODEX_IMAGE_NOT_FOUND' });
});

it('rejects symlinks and unsupported or oversized files', async () => {
  fs.lstat.mockResolvedValue({ isFile: () => true, isSymbolicLink: () => true });
  await expect(store.read('thread-1')).rejects.toMatchObject({ code: 'CODEX_IMAGE_NOT_FOUND' });
});
```

- [ ] **Step 2: Run image-store tests and verify RED**

Run: `npx vitest run tests/unit/cover/codex-generated-image-store.test.ts`

Expected: FAIL because the store does not exist.

- [ ] **Step 3: Implement exact-thread image validation**

Resolve `CODEX_HOME || path.join(homedir(), '.codex')`, validate `threadId` with `/^[a-zA-Z0-9-]{8,80}$/u`, call `lstat`, reject symlinks, accept PNG/JPEG/WebP by bytes rather than extension, cap the file before read, and select only the newest valid regular file inside the exact directory.

- [ ] **Step 4: Write failing image-generation and routing tests**

```ts
it('invokes imagegen without Shell and reads its exact thread output', async () => {
  exec.result = { threadId: 'thread-1', finalMessage: 'done', completed: true };
  imageStore.read.mockResolvedValue({ bytes: pngBytes, mimeType: 'image/png' });
  const result = await generator.generate(request);
  expect(exec.request.sandbox).toBe('workspace-write');
  expect(exec.request.enabledFeatures).toContain('image_generation');
  expect(exec.request.prompt).toMatch(/^\$imagegen/u);
  expect(imageStore.read).toHaveBeenCalledWith('thread-1');
  expect(result.source).toBe('local-codex');
});

it('routes a Codex cover without resolving API key', async () => {
  settings.imageGenerationBackend = 'codex';
  await workflow.prepareAi(file, artifact, '', selection({ backend: 'codex' }));
  expect(codex.generate).toHaveBeenCalledOnce();
  expect(secret.get).not.toHaveBeenCalled();
  expect(api.generate).not.toHaveBeenCalled();
});
```

- [ ] **Step 5: Implement Codex image adapter and frozen cover routing**

Extend `GeneratedCover.source` with `'local-codex'`. Generate the `$imagegen` prompt from the current preset, inclusion flags and sanitized fields. `CoverWorkflow.prepareAi()` resolves `selection.backend ?? settings.imageGenerationBackend` once. The Codex branch never reads provider settings or API keys; the API branch remains unchanged.

- [ ] **Step 6: Run focused and adversarial tests**

Run: `npx vitest run tests/unit/cover/codex-generated-image-store.test.ts tests/unit/cover/codex-image-generator.test.ts tests/unit/cover/cover-workflow.test.ts tests/adversarial/secret-leakage.test.ts`

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 7: Scan and commit**

Run: `npm run scan:secrets`

Run: `git diff --check`

Commit: `feat(cover): generate covers with local Codex`

---

### Task 5: Add Backend Defaults and Codex Detection to Settings UI

**Files:**
- Modify: `src/settings/settings-tab.ts`
- Modify: `src/main.ts`
- Modify: `styles.css`
- Test: `tests/unit/settings/settings-tab.test.ts`

**Interfaces:**
- Consumes: `CodexCapabilityService.detect(configuredPath)` and Task 1 settings.
- Produces: settings UI callbacks that persist `textGenerationBackend`, `imageGenerationBackend`, and `localCodex.executablePath`.

- [ ] **Step 1: Write failing settings UI tests**

```ts
it('persists text and image backend defaults independently', async () => {
  renderSettings();
  click('ai-text-backend-codex');
  expect(update).toHaveBeenCalledWith({ textGenerationBackend: 'codex' });
  click('ai-mode-image');
  click('ai-image-backend-api');
  expect(update).toHaveBeenCalledWith({ imageGenerationBackend: 'api' });
});

it('shows detected path version and image capability without generating', async () => {
  capabilities.detect.mockResolvedValue({
    available: true,
    executablePath: '/opt/homebrew/bin/codex',
    version: 'codex-cli 0.141.0',
    imageGeneration: true,
    errorCode: null,
  });
  click('codex-detect');
  await flushPromises();
  expect(text('codex-status')).toContain('已发现');
  expect(text('codex-status')).toContain('图片生成已启用');
});
```

- [ ] **Step 2: Run settings UI tests and verify RED**

Run: `npx vitest run tests/unit/settings/settings-tab.test.ts`

Expected: FAIL because backend controls and capability service are absent.

- [ ] **Step 3: Implement API/Codex mode cards**

Within each existing text/image mode, render a two-button segmented backend selector before the provider panel. Show the existing provider panel only for `api`; show one Codex card for `codex`. The Codex card includes a path input, saved value, detected path/version/status, and `重新检测`. Detection is explicit and does not generate or modify provider profiles.

- [ ] **Step 4: Add stable green native styling**

Use Obsidian variables and the plugin green accent. The segmented control must fit narrow settings panes; status text wraps; the path input and button remain usable at the existing minimum width. Do not duplicate an independent global selector above the text/image modes.

- [ ] **Step 5: Run focused tests and visual DOM snapshots**

Run: `npx vitest run tests/unit/settings/settings-tab.test.ts tests/visual/workbench-visual.test.ts`

Run: `npm run lint`

Expected: PASS.

- [ ] **Step 6: Scan and commit**

Run: `npm run scan:secrets`

Run: `git diff --check`

Commit: `feat(settings): configure local Codex generation`

---

### Task 6: Add Per-Operation Backend Selectors to the Workbench

**Files:**
- Modify: `src/ui/article-settings-form.ts`
- Modify: `src/ui/ai-cover-confirmation.ts`
- Modify: `src/ui/workbench-controller.ts`
- Modify: `src/ui/workbench-view.ts`
- Modify: `src/ui/workbench-publish-settings.ts`
- Modify: `src/main.ts`
- Modify: `styles.css`
- Test: `tests/unit/ui/workbench-publish-settings.test.ts`
- Test: `tests/unit/ui/ai-cover-confirmation.test.ts`
- Test: `tests/integration/workbench.test.ts`

**Interfaces:**
- Consumes: backend-aware text and cover methods from Tasks 3–4.
- Produces: `backend?: GenerationBackend` on title/digest actions and `AiCoverGenerationSelection.backend`.

- [ ] **Step 1: Write failing title/digest selector tests**

```ts
it('starts from the backend default and sends the selected one per title request', async () => {
  const form = render({ textGenerationBackend: 'codex' });
  expect(value('settings-title-backend')).toBe('codex');
  change('settings-title-backend', 'api');
  click('settings-title-ai');
  expect(actions.generateTitles).toHaveBeenCalledWith(expect.anything(), 'api');
  expect(actions.updateSettings).not.toHaveBeenCalled();
});

it('maps Codex errors to actionable Chinese copy', async () => {
  actions.generateDigest.mockRejectedValue(new CodexRuntimeError('CODEX_NOT_AUTHENTICATED'));
  click('settings-digest-ai');
  await flushPromises();
  expect(text('settings-digest-candidates')).toContain('本地 Codex 尚未登录');
});
```

- [ ] **Step 2: Write failing cover selector/disclosure tests**

```ts
it('shows local Codex disclosure and sends the chosen backend', async () => {
  const modal = openModal({ defaultBackend: 'codex' });
  expect(value('ai-cover-backend')).toBe('codex');
  expect(modal.contentEl.textContent).toContain('当前 Codex 账号额度');
  click('ai-cover-generate');
  expect(generate).toHaveBeenCalledWith(expect.objectContaining({ backend: 'codex' }));
});

it('clears an unadopted candidate when backend changes', async () => {
  await generateCandidate();
  change('ai-cover-backend', 'api');
  expect(query('ai-cover-candidate')).toBeNull();
});
```

- [ ] **Step 3: Run workbench UI tests and verify RED**

Run: `npx vitest run tests/unit/ui/workbench-publish-settings.test.ts tests/unit/ui/ai-cover-confirmation.test.ts tests/integration/workbench.test.ts`

Expected: FAIL because the selector state and signatures do not exist.

- [ ] **Step 4: Implement the session-only selectors and error copy**

Title and digest each own an in-memory backend initialized from `textGenerationBackend`. Regenerate preserves the current selector. Switching active note or reconstructing the form restores the default. The cover modal owns one backend initialized from `imageGenerationBackend`; changing it clears the current candidate and rebuilds source-specific disclosure. Add all design error-code mappings without showing raw stderr.

- [ ] **Step 5: Make API and Codex availability independent**

The title/digest buttons are enabled when either the selected API configuration is complete or Codex is detected. The cover action is enabled by the same rule for its selected default. If the user explicitly chooses an unavailable backend, clicking generate shows the matching error instead of disabling all generation or falling back.

- [ ] **Step 6: Run focused UI/integration tests**

Run: `npx vitest run tests/unit/ui/workbench-publish-settings.test.ts tests/unit/ui/ai-cover-confirmation.test.ts tests/integration/workbench.test.ts`

Run: `npm run typecheck`

Run: `npm run lint`

Expected: PASS.

- [ ] **Step 7: Scan and commit**

Run: `npm run scan:secrets`

Run: `git diff --check`

Commit: `feat(workbench): switch generation backend per request`

---

### Task 7: Document, Build, Sync and Perform Real Isolated-Vault Acceptance

**Files:**
- Modify: `README.md`
- Modify: `SECURITY.md`
- Modify: `PRIVACY.md`
- Create: `docs/verification/2026-09-04-local-codex-generation.md`
- Modify only if required by release-asset validation: generated `main.js`, `styles.css` at repository root.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: fresh automated and real desktop evidence; no public release.

- [ ] **Step 1: Add accurate user/security documentation**

Document that `本地 Codex` means the plugin starts the user's local Codex CLI but content is still processed by the user's Codex service, may consume account quota, does not require the plugin's API Key fields, and does not read Codex auth files. Document API as the compatibility fallback selected by the user, not an automatic fallback.

- [ ] **Step 2: Run the full automated gate once**

Run: `npm test`

Run: `npm run lint`

Run: `npm run typecheck`

Run: `npm run build`

Run: `npm run verify:release`

Run: `npm audit --audit-level=high`

Run: `npm run scan:secrets`

Expected: all PASS. Any pre-existing failure is recorded separately and cannot be called passing.

- [ ] **Step 3: Sync only to the isolated Vault**

Run: `npm run sync:test-vault`

Expected: development assets are copied to `$HOME/workspace/Github/wechat-workbench-test-vault/.obsidian/plugins/wechat-workbench`; no files under `commit_note` change.

- [ ] **Step 4: Verify settings in real Obsidian**

Reload the plugin in the isolated Vault. Open `设置 → 第三方插件 → WeChat Workbench → AI 内容生成`. Observe and record:

1. Text and image default selectors are independent.
2. `本地 Codex` detects executable, version and image generation.
3. Remote provider configuration remains intact when switching cards.

- [ ] **Step 5: Verify title and digest end-to-end**

Open a test article, select `本地 Codex` for title, generate three real candidates, adopt one, and confirm automatic save. Generate a real digest with Codex. Temporarily select API for one operation and confirm the backend default does not change. If no valid remote test credential is present, stop at the API confirmation/request boundary and record that external API execution was not claimed.

- [ ] **Step 6: Verify cover end-to-end**

Open the smart-cover modal, select `本地 Codex`, confirm the disclosure, generate a real image, inspect the preview, adopt it, and confirm the file exists under `.wechat-workbench/covers/` and remains visible after closing/reopening the workbench. Confirm the source selector resets to the saved default on a new modal session.

- [ ] **Step 7: Verify failure boundaries**

Use dependency injection tests plus one harmless invalid executable-path UI check to confirm `CODEX_NOT_FOUND`; restore the original path without changing credentials. Confirm failure preserves existing title/digest/cover and never invokes remote API.

- [ ] **Step 8: Write the verification record**

Record for each user path: goal, action, observed result, conclusion, command/SHA, Obsidian version and Codex version. Redact account data, article contents, absolute generated-image paths, raw prompts and stderr.

- [ ] **Step 9: Final adversarial review and commit**

Review process injection, path traversal, symlink, output-size, cancellation, note-switch staleness, secret inheritance, hidden fallback and duplicate generation. Re-run only tests affected by findings, then:

Run: `npm run scan:secrets`

Run: `git diff --check`

Commit: `docs(ai): verify local Codex generation`

## Completion Gate

The feature is complete only when all three real Codex paths—title, digest and cover—have succeeded through the installed plugin in the isolated Vault, the generated cover has been adopted and reopened, all automated gates are fresh and passing, and the worktree contains no uncommitted implementation changes. Local completion does not authorize `git push`, GitHub Release or Obsidian marketplace publication.
