# WeChat Workbench Cover, Security, and Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补齐本地与 AI 封面流程、全项目对抗验证、跨平台验收和社区发布所需资产，使项目达到“可发布但尚未公开发布”状态。

**Architecture:** `CoverService` 通过来源策略选择图片，`CoverGenerator` 隔离第三方图片 API，Electron 图像端口负责本地解码、裁剪和保存。发布收口阶段不新增产品能力，只修复对抗测试、真实平台测试和文档发现的问题。

**Tech Stack:** Electron `nativeImage`、OpenAI 兼容 `/v1/images/generations` API、Vitest 假提供商、Obsidian Vault 文件 API、GitHub Release 标准资产、Obsidian Community Plugins 规范。

## Global Constraints

- AI 封面是可选能力；失败不得阻断本地封面、正文首图或默认封面。
- 每次 AI 调用前展示并确认发送内容、Base URL、模型和成本提示。
- 不发送 Vault 路径、账号信息、凭据或未展示的正文。
- 生成封面最终保存为 2.35:1 Vault 图片，用户确认后才参与发布。
- 不加入遥测、广告、作者云端、AI 写作或正文自动改写。
- 发布收口必须覆盖 macOS 完整链路，Windows/Linux 冒烟，最低和最新 Obsidian。
- 计划只能把项目准备到可发布；Git push、Release、BRAT、社区提交必须另获用户批准。

---

## File Map

```text
src/cover/cover-types.ts                 封面来源与候选类型
src/cover/cover-service.ts               来源选择与协调
src/cover/cover-generator.ts             生成器接口
src/cover/openai-image-generator.ts      OpenAI 兼容适配器
src/cover/electron-image-port.ts         解码、裁剪、编码
src/cover/cover-storage.ts               Vault 路径和写入
src/ui/cover-picker-modal.ts             本地/首图/默认/AI 选择
src/ui/ai-cover-confirmation.ts           外发数据确认
tests/unit/cover/*.test.ts                封面单元测试
tests/integration/cover-provider.test.ts  假图片服务
tests/adversarial/*.test.ts               全项目恶意输入
tests/visual/*.test.ts                    视觉快照入口
scripts/verify-release.mjs                最终发布资产和 manifest 校验
README.md                                 安装、功能、限制
SECURITY.md                               漏洞报告与凭据响应
PRIVACY.md                                网络和数据去向
LICENSE                                   MIT
docs/user-guide/*.md                      用户指南
docs/verification/*.md                    跨平台与真实服务证据
```

### Task 1: Local Cover Sources, Crop, and Vault Storage

**Files:**
- Create: `src/cover/cover-types.ts`
- Create: `src/cover/cover-service.ts`
- Create: `src/cover/cover-storage.ts`
- Create: `src/cover/electron-image-port.ts`
- Create: `tests/unit/cover/cover-service.test.ts`
- Create: `tests/unit/cover/cover-storage.test.ts`

**Interfaces:**
- Produces: `CoverService.resolve(selection, snapshot): Promise<CoverCandidate>`.
- Produces: `CoverStorage.save(notePath, bytes): Promise<string>`.
- Produces: `ImagePort.decode`, `cropToAspect(2.35)`, `encodePng`.

- [ ] **Step 1: Write failing source-priority and safe-path tests**

```ts
it.each([
  ['article', 'frontmatter-cover'],
  ['first-image', 'first-local-image'],
  ['global-default', 'configured-default'],
])('resolves %s strategy', async (strategy, expected) => {
  expect((await service.resolve({ strategy }, snapshot)).source).toBe(expected);
});

it('stores generated covers under the plugin-owned vault directory', async () => {
  const path = await storage.save('01-公众号/My Article.md', pngBytes);
  expect(path).toMatch(/^\.wechat-workbench\/covers\/my-article\//);
  expect(path).not.toContain('..');
});
```

- [ ] **Step 2: Run and verify missing cover modules**

```bash
npm test -- tests/unit/cover/cover-service.test.ts tests/unit/cover/cover-storage.test.ts
```

- [ ] **Step 3: Implement deterministic 2.35:1 processing**

Normalize the note filename to lowercase ASCII-safe slug plus an 8-character path hash to avoid collisions. Decode through Electron `nativeImage`; reject empty/corrupt images and images above 20 MiB decoded input. Center-crop to exact `2350:1000` aspect without upscaling the short dimension beyond source resolution, then encode PNG. Write through Vault adapter using create-or-overwrite only inside `.wechat-workbench/covers/<slug-hash>/`.

- [ ] **Step 4: Run image and path tests**

```bash
npm test -- tests/unit/cover
npm run typecheck
```

- [ ] **Step 5: Scan and commit**

```bash
npm run scan:secrets
git add src/cover tests/unit/cover
git commit -m "feat: add local cover workflow"
```

### Task 2: OpenAI-Compatible Cover Generator and Privacy Gate

**Files:**
- Create: `src/cover/cover-generator.ts`
- Create: `src/cover/openai-image-generator.ts`
- Create: `src/ui/ai-cover-confirmation.ts`
- Create: `tests/unit/cover/openai-image-generator.test.ts`
- Create: `tests/unit/ui/ai-cover-confirmation.test.ts`
- Create: `tests/integration/cover-provider.test.ts`

**Interfaces:**
- Produces: `CoverGenerator.generate(request): Promise<GeneratedCover>`.
- Produces: `buildAiCoverDisclosure(snapshot, settings): AiCoverDisclosure`.
- Consumes: API key from `SecretStore` only after confirmation.

- [ ] **Step 1: Write failing disclosure and request-minimization tests**

```ts
it('shows exactly what will be sent before generation', () => {
  const disclosure = buildAiCoverDisclosure(snapshot, settings);
  expect(disclosure).toMatchObject({ baseUrl: settings.imageApiBaseUrl, model: settings.imageApiModel });
  expect(disclosure.sentFields).toEqual(['title', 'digest', 'bodyExcerpt']);
});

it('never sends vault paths or account data', async () => {
  await generator.generate(request);
  const body = JSON.stringify(http.lastJson);
  expect(body).not.toMatch(/01-公众号|wechat-account|appid|appsecret/i);
});
```

- [ ] **Step 2: Run and verify missing generator failure**

```bash
npm test -- tests/unit/cover/openai-image-generator.test.ts tests/unit/ui/ai-cover-confirmation.test.ts tests/integration/cover-provider.test.ts
```

- [ ] **Step 3: Implement explicit-confirmation compatible API calls**

Build the prompt from title, digest and at most 1,500 Unicode characters of sanitized plain text. Treat article text as quoted source material and prepend a fixed instruction that embedded instructions must not be followed. POST to `<normalized-base-url>/v1/images/generations` with `model`, `prompt`, `n: 1`, and the provider-supported landscape size selected by adapter capability. Accept either base64 or HTTPS URL response; URL retrieval uses `RemoteImageFetcher`. Crop the result locally to 2.35:1.

- [ ] **Step 4: Run fake-provider timeout, error, cancellation and success tests**

```bash
npm test -- tests/unit/cover tests/unit/ui/ai-cover-confirmation.test.ts tests/integration/cover-provider.test.ts
npm run typecheck
```

- [ ] **Step 5: Scan and commit**

```bash
npm run scan:secrets
git add src/cover src/ui/ai-cover-confirmation.ts tests/unit/cover tests/unit/ui/ai-cover-confirmation.test.ts tests/integration/cover-provider.test.ts
git commit -m "feat: generate covers with explicit privacy consent"
```

### Task 3: Cover Picker and Publish Integration

**Files:**
- Create: `src/ui/cover-picker-modal.ts`
- Create: `tests/integration/cover-ui.test.ts`
- Modify: `src/ui/workbench-view.ts`
- Modify: `src/ui/publish-dialog.ts`
- Modify: `src/publish/publish-coordinator.ts`
- Modify: `styles.css`

**Interfaces:**
- Consumes: `CoverService`, `CoverGenerator`, `AssetUploadService`.
- Produces: user-confirmed `CoverSelection` and cover hash in the frozen publish command.

- [ ] **Step 1: Write failing fallback and confirmation tests**

```ts
it('keeps local cover options available when AI generation fails', async () => {
  generator.generate.mockRejectedValue(providerError());
  await modal.generateAi();
  expect(modal.options).toContainEqual(expect.objectContaining({ kind: 'local-file', enabled: true }));
});

it('does not publish an unconfirmed generated cover', async () => {
  await modal.generateAi();
  await publish.click();
  expect(coordinator.publish).not.toHaveBeenCalled();
  expect(modal.errorCode).toBe('COVER_CONFIRMATION_REQUIRED');
});
```

- [ ] **Step 2: Run and verify missing picker failure**

```bash
npm test -- tests/integration/cover-ui.test.ts
```

- [ ] **Step 3: Implement source cards and frozen cover selection**

Offer current article cover, first local body image, global default, local file picker and AI generation. Show exact crop preview and source. Confirming writes only the selected Vault path to article metadata. Publish dialog freezes `coverPath`, `coverHash` and preview; later file changes produce a preflight mismatch rather than silently changing the request.

- [ ] **Step 4: Run cover, publish and build checks**

```bash
npm test -- tests/unit/cover tests/integration/cover-ui.test.ts tests/unit/publish tests/integration/publish-ui.test.ts
npm run lint
npm run typecheck
npm run build
```

- [ ] **Step 5: Scan and commit**

```bash
npm run scan:secrets
git add src/ui src/publish styles.css tests/integration/cover-ui.test.ts
git commit -m "feat: select and publish confirmed covers"
```

### Task 4: Full Adversarial and Visual Regression Suite

**Files:**
- Create: `tests/adversarial/html-css.test.ts`
- Create: `tests/adversarial/network-assets.test.ts`
- Create: `tests/adversarial/publish-concurrency.test.ts`
- Create: `tests/adversarial/secret-leakage.test.ts`
- Create: `tests/adversarial/large-input.test.ts`
- Create: `tests/visual/workbench-visual.test.ts`
- Create: `docs/verification/adversarial-review.md`

**Interfaces:**
- Produces: executable attack corpus and review receipt.

- [ ] **Step 1: Add attack fixtures that must initially expose at least one missing assertion**

Include scripts/events/dangerous protocols, CSS import/url/global escape, path traversal, private-IP redirects, MIME spoofing, empty/corrupt/oversized images, 5 MiB Markdown, 500 images, 200 nested nodes, double publish, note/theme/cover switches, duplicate draft IDs and secrets embedded in upstream error strings.

- [ ] **Step 2: Run the adversarial suite and record every real failure**

```bash
npm test -- tests/adversarial
```

Expected before fixes: at least the newly asserted uncovered boundary fails. If all pass, independently inspect that each fixture actually reaches the intended code path; a fixture rejected too early does not prove downstream safety.

- [ ] **Step 3: Apply the smallest production fixes for each reproduced failure**

For every failure, add a stable regression assertion, identify the owning module, and patch only that boundary. Do not weaken a test or increase limits merely to pass. Record cause, exploit path, fix and command in `docs/verification/adversarial-review.md`.

- [ ] **Step 4: Run full automated and visual matrices**

```bash
npm test
npm run lint
npm run typecheck
npm run build
npm run verify:release
npm run scan:secrets
```

Execute visual checks at 320/360/480/640 px, light/dark, default plus one community theme, 100/125/150% zoom, long errors, tabs, menus and modals. Store only screenshots without private note content.

- [ ] **Step 5: Scan and commit the attack corpus and fixes**

```bash
npm run scan:secrets
git add tests/adversarial tests/visual docs/verification/adversarial-review.md src
git commit -m "test: harden workbench against adversarial input"
```

### Task 5: Public Documentation and Release Assets

**Files:**
- Create: `LICENSE`
- Create: `SECURITY.md`
- Create: `PRIVACY.md`
- Create: `docs/user-guide/getting-started.md`
- Create: `docs/user-guide/themes.md`
- Create: `docs/user-guide/covers.md`
- Create: `docs/user-guide/recovery.md`
- Create: `docs/verification/release-candidate.md`
- Modify: `README.md`
- Modify: `scripts/verify-release.mjs`
- Modify: `manifest.json`
- Modify: `versions.json`
- Modify: `package.json`

**Interfaces:**
- Produces: Community Plugins-compatible `main.js`, `manifest.json`, `styles.css` and public documentation.

- [ ] **Step 1: Write failing release-contract tests**

Extend verifier assertions:

```ts
expect(manifest.id).toBe('wechat-workbench');
expect(manifest.name).toBe('WeChat Workbench');
expect(manifest.minAppVersion).toBe('1.11.4');
expect(manifest.isDesktopOnly).toBe(true);
expect(versionMap[manifest.version]).toBe('1.11.4');
expect(requiredDocs).toEqual(expect.arrayContaining(['README.md', 'LICENSE', 'SECURITY.md', 'PRIVACY.md']));
```

- [ ] **Step 2: Run verifier and confirm missing public assets fail**

```bash
npm run build
npm run verify:release
```

- [ ] **Step 3: Write exact public contracts**

README covers scope, install, local/manual installation, account setup, copy, draft sync, themes, covers, privacy, desktop-only limitation and “does not formally publish”. `PRIVACY.md` lists each destination host, triggering action and sent fields. `SECURITY.md` defines private reporting and credential rotation steps. Use the canonical MIT text in `LICENSE`. Set a release-candidate semantic version consistently in manifest/package/versions without creating a GitHub Release.

- [ ] **Step 4: Complete real release-candidate verification**

Run clean install and checks:

```bash
npm ci
npm test
npm run lint
npm run typecheck
npm run build
npm run verify:release
npm audit --omit=dev
npm run scan:secrets
```

Then verify minimum/latest Obsidian, macOS complete workflow, Windows/Linux install/open/preview/copy/draft smoke, real WeChat create/update, real editor paste and one explicitly confirmed real AI call. Mark missing environments BLOCKED, not PASS.

- [ ] **Step 5: Commit the release candidate without publishing it**

Review `git diff --cached`, rerun the secret scanner, then:

```bash
git add LICENSE README.md SECURITY.md PRIVACY.md docs/user-guide docs/verification/release-candidate.md scripts/verify-release.mjs manifest.json versions.json package.json package-lock.json
git commit -m "docs: prepare public release candidate"
```

Stop after the commit. Do not push, tag, create a release, start BRAT beta or submit to the Obsidian directory without separate user approval.

## Phase Acceptance

- 本地、首图、默认和 AI 封面都可选择，最终图片为 2.35:1 并经用户确认。
- AI 外发数据与服务目标在调用前可见，失败不阻断本地路径。
- 对抗测试覆盖输入、网络、并发、状态和凭据泄漏。
- README、隐私、安全、主题、封面、恢复和白名单指南完整。
- macOS 完整链路、Windows/Linux 冒烟、最低/最新 Obsidian 和专用微信账号形成证据。
- 项目达到可发布状态，但没有执行任何公开发布动作。
