# WeChat Workbench Rendering and UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付确定性文章渲染、4 套内置主题、自定义主题、发布预检、右侧实时预览和无需社区审核的富文本复制。

**Architecture:** `NoteSnapshot`、`ThemeDefinition` 和 `RenderArtifact` 是纯领域对象。渲染管线使用 unified/remark/rehype 生成受控 HAST，再经过清洗、主题内联和规范化；Obsidian UI 只消费产物，不参与 Markdown 转换。公式、Mermaid、图片均先形成稳定资源槽位，由预览或复制投影解析。

**Tech Stack:** unified 11.0.5、remark-parse 11.0.0、remark-gfm 4.0.1、remark-rehype 11.1.2、rehype-sanitize 6.0.0、rehype-stringify 10.0.1、unist-util-visit 5.1.0、PostCSS 8.5.26、postcss-selector-parser 7.1.5、juice 12.1.2、highlight.js 11.12.0、KaTeX 0.18.4、Mermaid 11.16.1、Electron clipboard。

## Global Constraints

- 被动预览不得联网；远程图片显示占位。
- 同一输入、主题内容和渲染器版本必须产生字节一致的 `canonicalHtml`。
- 用户 HTML 只能经过允许列表，不得原样透传。
- 自定义主题禁止 JavaScript、`@import`、`url()`、全局污染和固定定位。
- 复制不要求公众号账号；本地图片使用受控 Data URL，失败时整次复制失败并指出文件。
- 本阶段不调用微信 API，不写草稿关联 Frontmatter。

---

## File Map

```text
src/domain/article.ts                 文章元数据与快照
src/domain/artifact.ts                渲染产物、资源槽位、诊断
src/domain/theme.ts                   主题类型
src/domain/ports.ts                   Vault、图像、剪贴板等窄接口
src/render/markdown-pipeline.ts        Markdown 到安全 HAST
src/render/artifact-builder.ts        规范化产物编译
src/render/html-schema.ts             HTML 允许列表
src/render/canonicalize.ts            确定性序列化与哈希
src/render/extensions/code.ts         代码高亮
src/render/extensions/math.ts         KaTeX 安全投影
src/render/extensions/mermaid.ts      Mermaid 资源槽位
src/render/assets.ts                  图片和生成资源槽位
src/themes/theme-registry.ts          内置/自定义主题发现与缓存
src/themes/theme-validator.ts         CSS/manifest 校验
src/themes/builtin/*.ts               4 套 clean-room 主题
src/preflight/preflight-engine.ts     本地检查
src/clipboard/clipboard-service.ts    HTML/text 剪贴板
src/clipboard/asset-resolver.ts       Data URL 解析
src/ui/workbench-view.ts              工作台视图
src/ui/workbench-controller.ts        活动笔记和防抖编排
tests/fixtures/articles/*.md           固定输入
tests/golden/*.html                    规范化输出
tests/unit/render/*.test.ts            渲染单元测试
tests/unit/themes/*.test.ts            主题测试
tests/unit/preflight/*.test.ts         预检测试
tests/unit/clipboard/*.test.ts         剪贴板测试
tests/integration/workbench.test.ts    活动笔记集成测试
```

### Task 1: Domain Contracts and Note Snapshots

**Files:**
- Create: `src/domain/article.ts`
- Create: `src/domain/artifact.ts`
- Create: `src/domain/theme.ts`
- Create: `src/domain/ports.ts`
- Create: `src/render/note-snapshot-service.ts`
- Create: `tests/unit/render/note-snapshot-service.test.ts`

**Interfaces:**
- Produces: `NoteSnapshotService.snapshot(file): Promise<NoteSnapshot>`.
- Produces: immutable `NoteSnapshot`, `RenderArtifact`, `AssetSlot`, `Diagnostic`, `ThemeDefinition`.

- [ ] **Step 1: Write failing snapshot merge and immutability tests**

```ts
it('merges article metadata over global defaults without network access', async () => {
  const service = new NoteSnapshotService(vaultPort, metadataPort, defaults);
  const snapshot = await service.snapshot(file('article.md'));
  expect(snapshot.metadata).toEqual({
    title: 'Frontmatter title', author: 'Default author', digest: '',
    cover: null, contentSourceUrl: '',
  });
  expect(Object.isFrozen(snapshot)).toBe(true);
  expect(networkPort.calls).toBe(0);
});
```

- [ ] **Step 2: Run and confirm missing service failure**

```bash
npm test -- tests/unit/render/note-snapshot-service.test.ts
```

Expected: FAIL because domain contracts are missing.

- [ ] **Step 3: Implement narrow immutable contracts**

Define `NoteSnapshot` with `vaultPath`, `modifiedAt`, `markdown`, `frontmatter`, `metadata`, `selectedThemeId`, and `sourceHash`. Normalize CRLF to LF before SHA-256. Freeze nested metadata and frontmatter copies. `VaultPort` exposes only `readText`, `readBinary`, `exists`, `resolveLink`; no Obsidian object leaks into render modules.

- [ ] **Step 4: Run domain tests and typecheck**

```bash
npm test -- tests/unit/render/note-snapshot-service.test.ts
npm run typecheck
```

- [ ] **Step 5: Scan and commit**

```bash
npm run scan:secrets
git add src/domain src/render/note-snapshot-service.ts tests/unit/render/note-snapshot-service.test.ts
git commit -m "feat: add immutable article snapshots"
```

### Task 2: Versioned Theme Registry and CSS Safety

**Files:**
- Create: `src/themes/theme-registry.ts`
- Create: `src/themes/theme-validator.ts`
- Create: `src/themes/builtin/native.ts`
- Create: `src/themes/builtin/verdant.ts`
- Create: `src/themes/builtin/editorial.ts`
- Create: `src/themes/builtin/technical.ts`
- Create: `tests/unit/themes/theme-registry.test.ts`
- Create: `tests/unit/themes/theme-validator.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Produces: `ThemeRegistry.get(id)`, `list()`, `reloadChanged(path)`.
- Produces: `validateThemePack(manifest, css): ThemeValidationResult`.

- [ ] **Step 1: Install exact CSS dependencies and write failing rejection tests**

```bash
npm install --save-exact postcss@8.5.26 postcss-selector-parser@7.1.5 juice@12.1.2
```

```ts
it.each([
  '@import "https://evil.test/x.css";',
  '.article { background: url(https://evil.test/a.png) }',
  'body { color: red }',
  '.article { position: fixed; inset: 0 }',
])('rejects unsafe theme css: %s', css => {
  expect(validateThemePack(validManifest, css).ok).toBe(false);
});
```

- [ ] **Step 2: Run and verify missing validator failure**

```bash
npm test -- tests/unit/themes
```

- [ ] **Step 3: Implement AST validation and four clean-room themes**

Parse CSS with PostCSS. Permit selectors only under `.wechat-article`; rewrite `h1` to `.wechat-article h1`, but reject `html`, `body`, `:root`, `*` at root, sibling escape and pseudo-elements that inject external content. Reject `@import`, all `url()`, `expression`, `behavior`, `position: fixed|sticky`, negative full-screen offsets and z-index above 10. Each built-in has a unique ID/version and uses only supported article elements.

- [ ] **Step 4: Verify deterministic listing and invalid-version fallback**

```bash
npm test -- tests/unit/themes
npm run lint
npm run typecheck
```

Expected: exactly 4 built-ins sorted by ID; an invalid changed custom theme leaves the last valid cached version active and emits a diagnostic.

- [ ] **Step 5: Scan and commit themes**

```bash
npm run scan:secrets
git add package.json package-lock.json src/themes tests/unit/themes
git commit -m "feat: add safe versioned themes"
```

### Task 3: Safe Deterministic Markdown Pipeline

**Files:**
- Create: `src/render/markdown-pipeline.ts`
- Create: `src/render/html-schema.ts`
- Create: `src/render/canonicalize.ts`
- Create: `src/render/artifact-builder.ts`
- Create: `src/render/extensions/code.ts`
- Create: `tests/unit/render/markdown-pipeline.test.ts`
- Create: `tests/unit/render/determinism.test.ts`
- Create: `tests/fixtures/articles/core-elements.md`
- Create: `tests/golden/core-elements.html`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: `NoteSnapshot`, `ThemeDefinition`.
- Produces: `RenderArtifactBuilder.build(snapshot, theme): Promise<RenderArtifact>`.
- Produces: `canonicalizeHtml(root): string` and `sha256(value): string`.

- [ ] **Step 1: Install exact Markdown dependencies and write unsafe HTML tests**

```bash
npm install --save-exact unified@11.0.5 remark-parse@11.0.0 remark-gfm@4.0.1 remark-rehype@11.1.2 rehype-sanitize@6.0.0 rehype-stringify@10.0.1 unist-util-visit@5.1.0 highlight.js@11.12.0
```

```ts
it('removes scripts, event handlers, forms, iframes and javascript urls', async () => {
  const artifact = await build('<script>x()</script><a href="javascript:x()">x</a><img onerror="x()">');
  expect(artifact.canonicalHtml).not.toMatch(/script|onerror|javascript:|iframe|form/i);
});

it('is byte-identical across repeated builds', async () => {
  const outputs = await Promise.all(Array.from({ length: 5 }, () => buildFixture('core-elements.md')));
  expect(new Set(outputs.map(x => x.canonicalHtml)).size).toBe(1);
});
```

- [ ] **Step 2: Run and verify missing builder failure**

```bash
npm test -- tests/unit/render/markdown-pipeline.test.ts tests/unit/render/determinism.test.ts
```

- [ ] **Step 3: Implement the allow-list pipeline**

Disable raw HTML parsing by default. Convert supported Markdown to HAST, map Obsidian callout blockquotes by parsed marker, highlight fenced code with an explicit language allow-list and plaintext fallback, sanitize using a project-owned schema, inline validated theme CSS with Juice, then canonicalize element/attribute order and insignificant whitespace. Compute `contentHash` after sanitization and canonicalization.

- [ ] **Step 4: Approve the first golden fixture intentionally**

Run:

```bash
npm test -- tests/unit/render
```

Review generated HTML manually before writing it to `tests/golden/core-elements.html`; then rerun and expect PASS. Do not update golden output solely to silence a diff.

- [ ] **Step 5: Scan and commit the core renderer**

```bash
npm run scan:secrets
git add package.json package-lock.json src/render tests/unit/render tests/fixtures/articles/core-elements.md tests/golden/core-elements.html
git commit -m "feat: add deterministic article renderer"
```

### Task 4: Image, Math, and Mermaid Resource Slots

**Files:**
- Create: `src/render/assets.ts`
- Create: `src/render/extensions/math.ts`
- Create: `src/render/extensions/mermaid.ts`
- Create: `src/render/diagram-renderer.ts`
- Create: `tests/unit/render/assets.test.ts`
- Create: `tests/unit/render/math.test.ts`
- Create: `tests/unit/render/mermaid.test.ts`
- Create: `tests/fixtures/articles/rich-elements.md`
- Create: `tests/golden/rich-elements.html`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Produces: stable asset IDs `asset:<sha256(kind + normalizedSource)>`.
- Produces: `DiagramRenderer.renderMermaid(source): Promise<GeneratedAsset>`.
- Consumes: `BinaryFilePort` for local attachments; no network port.

- [ ] **Step 1: Install exact rich-content dependencies and write slot tests**

```bash
npm install --save-exact katex@0.18.4 mermaid@11.16.1
```

```ts
it('creates stable slots without loading a remote image', async () => {
  const artifact = await build('![remote](https://example.test/a.png)');
  expect(artifact.assets[0]).toMatchObject({ kind: 'remote-image', status: 'unresolved' });
  expect(network.calls).toBe(0);
});

it('turns mermaid into a generated asset slot', async () => {
  const artifact = await build('```mermaid\ngraph TD; A-->B\n```');
  expect(artifact.assets[0].kind).toBe('generated-diagram');
});
```

- [ ] **Step 2: Run and verify unresolved feature failure**

```bash
npm test -- tests/unit/render/assets.test.ts tests/unit/render/math.test.ts tests/unit/render/mermaid.test.ts
```

- [ ] **Step 3: Implement pure slot extraction and adapter-driven diagrams**

Local images store Vault-relative source and content hash, not bytes, in the artifact. Remote images store normalized HTTPS URL and remain unresolved. KaTeX renders through a fixed trust-disabled configuration and sanitized output. Mermaid parsing runs with `securityLevel: 'strict'`; DOM/SVG-to-PNG conversion sits behind `DiagramRenderer` so Node tests use a fake and Obsidian uses Electron `nativeImage` only when a consumer requests resolution.

- [ ] **Step 4: Run rich-content golden tests**

```bash
npm test -- tests/unit/render
npm run typecheck
```

Expected: repeated rich fixture output is byte-identical; no network calls occur.

- [ ] **Step 5: Scan and commit rich elements**

```bash
npm run scan:secrets
git add package.json package-lock.json src/render tests/unit/render tests/fixtures/articles/rich-elements.md tests/golden/rich-elements.html
git commit -m "feat: add rich content asset slots"
```

### Task 5: Preflight Engine

**Files:**
- Create: `src/preflight/codes.ts`
- Create: `src/preflight/preflight-engine.ts`
- Create: `tests/unit/preflight/preflight-engine.test.ts`

**Interfaces:**
- Produces: `PreflightEngine.run(artifact, context): PreflightReport`.
- Produces: stable severities `BLOCKING`, `WARNING`, `INFO` and machine-readable codes.

- [ ] **Step 1: Write failing blocking/warning classification tests**

```ts
it('blocks unresolved local assets and warns for an empty digest', () => {
  const report = engine.run(artifact({ digest: '', unresolvedLocal: true }), copyContext());
  expect(report.blocking.map(x => x.code)).toContain('LOCAL_ASSET_UNRESOLVED');
  expect(report.warnings.map(x => x.code)).toContain('DIGEST_EMPTY');
});
```

- [ ] **Step 2: Run and verify missing engine failure**

```bash
npm test -- tests/unit/preflight
```

- [ ] **Step 3: Implement explicit rule functions**

Each rule is `(artifact, context) => Diagnostic[]`; no rule mutates the artifact. Include codes for missing Markdown, empty title, empty sanitized body, invalid theme, unsafe/unresolved asset, digest empty, non-HTTPS source URL, narrow-content risk, and unsupported element removal. Copy context does not require an account; publish-specific rules are added in the publishing plan.

- [ ] **Step 4: Run focused and global renderer tests**

```bash
npm test -- tests/unit/preflight tests/unit/render tests/unit/themes
```

- [ ] **Step 5: Scan and commit**

```bash
npm run scan:secrets
git add src/preflight tests/unit/preflight
git commit -m "feat: add article preflight checks"
```

### Task 6: Real-Time Workbench Controller and Preview UI

**Files:**
- Create: `src/ui/workbench-controller.ts`
- Create: `src/ui/render-preview.ts`
- Create: `src/ui/render-preflight.ts`
- Create: `tests/integration/workbench.test.ts`
- Modify: `src/ui/workbench-view.ts`
- Modify: `src/main.ts`
- Modify: `styles.css`

**Interfaces:**
- Consumes: `NoteSnapshotService`, `ThemeRegistry`, `RenderArtifactBuilder`, `PreflightEngine`.
- Produces: `WorkbenchController.start()`, `stop()`, `rebuild(reason)`, `currentArtifact()`.

- [ ] **Step 1: Write failing debounce, active-file, and stale-build tests**

```ts
it('renders only the newest active markdown snapshot after 400ms debounce', async () => {
  controller.start();
  workspace.emitActive('a.md');
  workspace.emitActive('b.md');
  await clock.tickAsync(400);
  expect(view.renderedSource).toBe('b.md');
  expect(view.renderCount).toBe(1);
});
```

- [ ] **Step 2: Run and verify missing controller failure**

```bash
npm test -- tests/integration/workbench.test.ts
```

- [ ] **Step 3: Implement cancellation-by-generation and native UI states**

Register workspace and Vault events through `registerEvent`. Every rebuild increments a generation number; a completed older build is discarded. The preview root is `.wechat-workbench-preview` containing an isolated `.wechat-article`. Render preflight strip separately. Remote images render a local placeholder button but do not set their remote URL on an `<img>` during passive preview.

- [ ] **Step 4: Run automated UI and build checks**

```bash
npm test -- tests/integration/workbench.test.ts tests/unit/ui
npm run lint
npm run typecheck
npm run build
```

- [ ] **Step 5: Scan and commit real-time preview**

```bash
npm run scan:secrets
git add src/ui src/main.ts styles.css tests/integration/workbench.test.ts
git commit -m "feat: add real-time article preview"
```

### Task 7: Accountless Rich Clipboard

**Files:**
- Create: `src/clipboard/clipboard-service.ts`
- Create: `src/clipboard/asset-resolver.ts`
- Create: `src/clipboard/electron-clipboard-port.ts`
- Create: `tests/unit/clipboard/clipboard-service.test.ts`
- Create: `tests/unit/clipboard/asset-resolver.test.ts`
- Create: `tests/mocks/electron.ts`
- Modify: `src/ui/workbench-view.ts`
- Modify: `vitest.config.ts`

**Interfaces:**
- Produces: `ClipboardService.copyForWeChat(artifact): Promise<CopyResult>`.
- Produces: `ClipboardService.copyHtmlSource(artifact): Promise<CopyResult>`.
- Consumes: `ClipboardPort.write({ html, text })` and `BinaryFilePort`.

- [ ] **Step 1: Write failing HTML/text and all-or-nothing asset tests**

```ts
it('writes html and plain text from the same artifact', async () => {
  await service.copyForWeChat(artifact);
  expect(clipboard.lastWrite).toEqual({ html: expectedHtml, text: artifact.plainText });
});

it('does not write when a local image cannot be encoded', async () => {
  files.readBinary.mockRejectedValue(new Error('unreadable'));
  await expect(service.copyForWeChat(localImageArtifact)).rejects.toMatchObject({ code: 'LOCAL_ASSET_UNREADABLE' });
  expect(clipboard.write).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run and verify missing service failure**

```bash
npm test -- tests/unit/clipboard
```

- [ ] **Step 3: Implement bounded Data URL resolution and Electron write**

Resolve all assets before writing. Accept PNG, JPEG, GIF and WebP only after magic-byte validation. Enforce 5 MiB per image and 20 MiB total decoded bytes for the accountless clipboard projection; violations return stable blocking diagnostics. Build HTML by replacing exact resource slot IDs, then call Electron `clipboard.write({ html, text })` once. HTML-source copy writes canonical source as plain text and does not resolve images.

Add a Vitest alias from `electron` to `tests/mocks/electron.ts`. The mock records `clipboard.write` calls and throws for unimplemented Electron APIs; production `electron-clipboard-port.ts` remains the only module that imports Electron directly.

- [ ] **Step 4: Run clipboard, renderer and build checks**

```bash
npm test -- tests/unit/clipboard tests/unit/render
npm run typecheck
npm run build
```

- [ ] **Step 5: Scan and commit clipboard behavior**

```bash
npm run scan:secrets
git add src/clipboard src/ui/workbench-view.ts tests/unit/clipboard tests/mocks/electron.ts vitest.config.ts
git commit -m "feat: copy rich articles to wechat"
```

### Task 8: Rendering Phase Real Verification

**Files:**
- Create: `docs/verification/rendering-local-smoke.md`
- Create: `docs/verification/wechat-copy-visual.md`
- Create: `tests/fixtures/themes/sample-custom/manifest.json`
- Create: `tests/fixtures/themes/sample-custom/theme.css`

**Interfaces:**
- Produces: evidence for real-time rendering, theme loading and paste fidelity.

- [ ] **Step 1: Add the custom-theme fixture and automated load test**

The fixture uses only `.wechat-article` scoped styles and version `1.0.0`. Assert registry discovery, preview rendering and invalid-CSS fallback.

- [ ] **Step 2: Run all automated phase checks**

```bash
npm test
npm run lint
npm run typecheck
npm run build
npm run verify:release
npm run scan:secrets
```

- [ ] **Step 3: Sync to the isolated Vault and verify real-time behavior**

Open fixtures covering Chinese long-form, lists, quotes, tables, code, formula, Mermaid, callout, local images and remote placeholders. Record panel widths 320/360/480/640, light/dark mode, 100/125/150% zoom and activity-file switching.

- [ ] **Step 4: Paste into the real WeChat editor without an account API**

Use “复制到公众号”, paste into a disposable draft editor, and compare headings, paragraphs, lists, code, formulas, diagrams and local images against the preview. Record every mismatch; the check fails if a local image silently disappears. Do not click formal publish.

- [ ] **Step 5: Commit clean evidence**

Remove account names, URLs containing tokens, machine paths and unpublished article content. Then:

```bash
npm run scan:secrets
git add tests/fixtures/themes docs/verification/rendering-local-smoke.md docs/verification/wechat-copy-visual.md
git commit -m "test: verify rendering and wechat copy"
```

## Phase Acceptance

- 4 内置主题和自定义主题通过安全校验与视觉回归。
- 同一 fixture 重复构建得到字节一致的规范化逻辑 HTML。
- 被动预览没有网络调用。
- 右侧视图在真实 Obsidian 中实时跟随活动 Markdown。
- 无账号富文本复制通过真实微信编辑器核对，本地图片不静默丢失。
- 本阶段没有微信草稿 API 或凭据逻辑。
