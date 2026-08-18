# WeChat Workbench WeChat Draft Transaction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 直接从用户本机安全调用微信公众平台，完成图片和封面素材上传、草稿创建/更新/无变化跳过，以及远端结果未知和本地写入失败后的恢复。

**Architecture:** `WeChatClient` 只封装微信协议；`PublishCoordinator` 冻结产物并驱动显式状态机；`PublishStateStore` 分开保存恢复回执和文章 Frontmatter。所有网络请求经过可替换 transport，CI 使用本地假服务，真实账号只用于人工验收。

**Tech Stack:** Obsidian `requestUrl`、Node.js HTTPS/DNS、Web `FormData` 或确定性 multipart 编码、Vitest 假 HTTP 服务、微信 stable token/素材/草稿 API。

## Global Constraints

- AppSecret 和 Access Token 只从 `SecretStore` 读取；不得进入 `data.json`、Frontmatter、日志、报告和测试快照。
- 微信 API 主机固定为 `https://api.weixin.qq.com`，不允许用户改写。
- 网络只由测试账号、加载资源、复制微信资源模式或发布动作触发。
- 同一笔记同一账号 single-flight。
- 草稿创建/更新请求超时且结果未知时进入 `AMBIGUOUS`，不得自动重试。
- 远端成功后先写恢复回执，再写 Frontmatter。
- 插件只创建或更新草稿，不调用正式发布或群发接口。

---

## File Map

```text
src/wechat/http-transport.ts             微信 HTTP 抽象
src/wechat/obsidian-http-transport.ts    requestUrl 实现
src/wechat/token-service.ts              stable token 与缓存
src/wechat/multipart.ts                  确定性 multipart
src/wechat/wechat-client.ts              素材和草稿协议
src/wechat/errors.ts                     错误映射与脱敏
src/security/network-policy.ts            URL/DNS/重定向策略
src/security/remote-image-fetcher.ts      受控远程图片读取
src/publish/publish-types.ts              状态、命令、结果
src/publish/publish-decision.ts           创建/更新/跳过决策
src/publish/publish-state-store.ts        恢复回执与 Frontmatter
src/publish/publish-coordinator.ts        事务编排
src/publish/asset-upload-service.ts       图片/封面上传与缓存
src/ui/publish-dialog.ts                  最终确认
src/ui/publish-progress.ts                阶段进度
src/ui/publish-report-modal.ts            报告与恢复动作
tests/unit/wechat/*.test.ts               协议测试
tests/unit/security/*.test.ts             网络安全测试
tests/unit/publish/*.test.ts              事务测试
tests/integration/wechat-fake-server.test.ts 假微信服务
```

### Task 1: Redacted HTTP Transport and Stable Token

**Files:**
- Create: `src/wechat/http-transport.ts`
- Create: `src/wechat/obsidian-http-transport.ts`
- Create: `src/wechat/token-service.ts`
- Create: `src/wechat/errors.ts`
- Create: `tests/unit/wechat/token-service.test.ts`
- Create: `tests/unit/wechat/errors.test.ts`

**Interfaces:**
- Produces: `HttpTransport.request<T>(request): Promise<HttpResponse<T>>`.
- Produces: `TokenService.getValidToken({ forceRefresh? }): Promise<string>` and `clear()`.
- Produces: `toPublicError(error, stage): PublicError` with redacted URL/body/headers.

- [ ] **Step 1: Write failing token cache and redaction tests**

```ts
it('reuses a token until sixty seconds before expiry', async () => {
  secrets.set('accessToken', 'token-one');
  settings.accessTokenExpiresAt = clock.now() + 61_000;
  expect(await service.getValidToken()).toBe('token-one');
  expect(http.request).not.toHaveBeenCalled();
});

it('redacts tokens in query strings and secrets in bodies', () => {
  const publicError = toPublicError(new Error('https://api.weixin.qq.com/x?access_token=abc secret=xyz'), 'TOKEN');
  expect(JSON.stringify(publicError)).not.toMatch(/abc|xyz/);
});
```

- [ ] **Step 2: Run and verify missing service failure**

```bash
npm test -- tests/unit/wechat/token-service.test.ts tests/unit/wechat/errors.test.ts
```

- [ ] **Step 3: Implement stable token flow**

Call only:

```ts
POST https://api.weixin.qq.com/cgi-bin/stable_token
{
  grant_type: 'client_credential',
  appid,
  secret: appSecret,
  force_refresh: forceRefresh,
}
```

On success store token in SecretStorage and `expiresAt = now + expires_in * 1000` in non-secret settings. Use a per-account in-memory refresh promise to collapse concurrent refreshes. Parse every nonzero `errcode` into `PublicError` containing stage, `errcode`, `errmsg`, optional `rid`, remoteEffect `NONE`, retryability and next action; redact access-token query values before any logging.

- [ ] **Step 4: Run unit and type checks**

```bash
npm test -- tests/unit/wechat
npm run typecheck
npm run lint
```

- [ ] **Step 5: Scan and commit**

```bash
npm run scan:secrets
git add src/wechat tests/unit/wechat
git commit -m "feat: add redacted wechat token transport"
```

### Task 2: Remote Image Network Policy

**Files:**
- Create: `src/security/network-policy.ts`
- Create: `src/security/remote-image-fetcher.ts`
- Create: `tests/unit/security/network-policy.test.ts`
- Create: `tests/unit/security/remote-image-fetcher.test.ts`

**Interfaces:**
- Produces: `NetworkPolicy.resolveAndValidate(url): Promise<ValidatedTarget>`.
- Produces: `RemoteImageFetcher.fetch(url): Promise<ValidatedImage>`.

- [ ] **Step 1: Write failing SSRF and MIME-spoof tests**

```ts
it.each(['http://127.0.0.1/a', 'http://[::1]/a', 'http://169.254.169.254/a', 'http://10.0.0.1/a'])
  ('blocks private target %s', async url => {
    await expect(policy.resolveAndValidate(url)).rejects.toMatchObject({ code: 'REMOTE_URL_BLOCKED' });
  });

it('revalidates every redirect target', async () => {
  server.redirect('/public', 'http://127.0.0.1/private');
  await expect(fetcher.fetch(server.url('/public'))).rejects.toMatchObject({ code: 'REMOTE_REDIRECT_BLOCKED' });
});
```

- [ ] **Step 2: Run and verify missing policy failure**

```bash
npm test -- tests/unit/security
```

- [ ] **Step 3: Implement fail-closed DNS, redirect and image validation**

Allow HTTP/HTTPS input but require HTTPS for final publish URLs. Resolve all A/AAAA records before connect and reject loopback, private, link-local, multicast, documentation and reserved ranges. Pin the chosen public address for the connection, retain the original hostname for TLS SNI/certificate checks, and repeat validation after each of at most 3 redirects. Set 5s connect, 15s read, 20s total timeout and 10 MiB response limit. Accept PNG/JPEG/GIF/WebP only when both header and magic bytes agree.

- [ ] **Step 4: Run adversarial network tests**

```bash
npm test -- tests/unit/security
npm run typecheck
```

- [ ] **Step 5: Scan and commit**

```bash
npm run scan:secrets
git add src/security tests/unit/security
git commit -m "feat: secure remote image loading"
```

### Task 3: Deterministic Multipart, Media Upload, and Cache

**Files:**
- Create: `src/wechat/multipart.ts`
- Create: `src/publish/asset-upload-service.ts`
- Create: `src/publish/asset-cache.ts`
- Create: `tests/unit/wechat/multipart.test.ts`
- Create: `tests/unit/publish/asset-upload-service.test.ts`
- Modify: `src/settings/model.ts`
- Modify: `src/settings/settings-store.ts`

**Interfaces:**
- Produces: `encodeMultipart(parts, boundary): Uint8Array`.
- Produces: `AssetUploadService.resolveBodyAssets(artifact, account): Promise<ResolvedArtifact>`.
- Produces: `uploadCover(image): Promise<{ mediaId: string; url?: string }>`.

- [ ] **Step 1: Write failing cache and upload tests**

```ts
it('uploads identical body image once per account and content hash', async () => {
  await service.resolveBodyAssets(artifactWithSameImageTwice, accountA);
  expect(client.uploadBodyImage).toHaveBeenCalledTimes(1);
});

it('does not share media cache across accounts', async () => {
  await service.resolveBodyAssets(artifact, accountA);
  await service.resolveBodyAssets(artifact, accountB);
  expect(client.uploadBodyImage).toHaveBeenCalledTimes(2);
});
```

- [ ] **Step 2: Run and verify missing uploader failure**

```bash
npm test -- tests/unit/wechat/multipart.test.ts tests/unit/publish/asset-upload-service.test.ts
```

- [ ] **Step 3: Implement media protocols and bounded cache**

Body images call `/cgi-bin/media/uploadimg`; covers call `/cgi-bin/material/add_material?type=image`. Multipart uses CRLF, quoted safe filenames, explicit content type, deterministic boundary supplied by caller in tests, and no token in logs. Cache keys are `accountHash:kind:sha256(bytes)`, values contain only remote media ID/URL, created time and last-used time. Keep at most 500 entries and evict least recently used entries; never cache failed responses.

- [ ] **Step 4: Run upload and settings tests**

```bash
npm test -- tests/unit/wechat tests/unit/publish/asset-upload-service.test.ts tests/unit/settings
npm run typecheck
```

- [ ] **Step 5: Scan and commit**

```bash
npm run scan:secrets
git add src/wechat src/publish/asset-upload-service.ts src/publish/asset-cache.ts src/settings tests/unit/wechat tests/unit/publish/asset-upload-service.test.ts
git commit -m "feat: upload and reuse wechat media"
```

### Task 4: WeChat Draft Client and Protocol Fixtures

**Files:**
- Create: `src/wechat/wechat-client.ts`
- Create: `src/wechat/wechat-types.ts`
- Create: `tests/unit/wechat/wechat-client.test.ts`
- Create: `tests/fixtures/wechat/*.json`
- Create: `tests/integration/wechat-fake-server.test.ts`

**Interfaces:**
- Produces: `addDraft(article): Promise<DraftReceipt>`.
- Produces: `updateDraft(mediaId, article): Promise<DraftReceipt>`.
- Produces: `getDraft(mediaId): Promise<RemoteDraft | null>`.
- Produces: `listRecentDrafts(offset, count): Promise<RemoteDraftPage>`.

- [ ] **Step 1: Write exact payload and error fixture tests**

```ts
it('sends one article with resolved HTTPS images and cover media id', async () => {
  await client.addDraft(article);
  expect(http.lastJson.articles).toEqual([{
    title: article.title,
    author: article.author,
    digest: article.digest,
    content: article.html,
    content_source_url: article.contentSourceUrl,
    thumb_media_id: article.coverMediaId,
    need_open_comment: 0,
    only_fans_can_comment: 0,
  }]);
});
```

- [ ] **Step 2: Run and verify missing client failure**

```bash
npm test -- tests/unit/wechat/wechat-client.test.ts tests/integration/wechat-fake-server.test.ts
```

- [ ] **Step 3: Implement only the approved draft endpoints**

Use `/cgi-bin/draft/add`, `/cgi-bin/draft/update`, `/cgi-bin/draft/get`, `/cgi-bin/draft/batchget`. Reject final article HTML containing unresolved slots, non-HTTPS image sources or empty sanitized body before transport. Define current preflight constants as title 64 characters, author 8 characters and digest 120 characters; keep them in one exported object and cover boundary tests. Do not implement free publish, mass send or draft deletion.

- [ ] **Step 4: Run fake-server protocol tests**

```bash
npm test -- tests/unit/wechat tests/integration/wechat-fake-server.test.ts
npm run typecheck
```

- [ ] **Step 5: Scan fixtures and commit**

Verify every fixture uses clearly synthetic IDs such as `TEST_MEDIA_ID`, then:

```bash
npm run scan:secrets
git add src/wechat tests/unit/wechat tests/integration/wechat-fake-server.test.ts tests/fixtures/wechat
git commit -m "feat: add wechat draft protocol client"
```

### Task 5: Publish State Store and Safe Frontmatter Merge

**Files:**
- Create: `src/publish/publish-state-store.ts`
- Create: `src/publish/frontmatter-fields.ts`
- Create: `src/publish/recovery-receipt-store.ts`
- Create: `tests/unit/publish/publish-state-store.test.ts`
- Create: `tests/unit/publish/recovery-receipt-store.test.ts`

**Interfaces:**
- Produces: `PublishStateStore.read(file)`, `commit(file, state)`, `unlink(file)`.
- Produces: `RecoveryReceiptStore.record(receipt)`, `resolve(taskId)`, `listUnresolved()`.

- [ ] **Step 1: Write failing preservation and remote-first recovery tests**

```ts
it('updates owned fields without deleting unknown frontmatter', async () => {
  await store.commit(file, syncedState);
  expect(frontmatter).toMatchObject({ custom_user_field: 'keep-me', 'wechat-draft-id': 'TEST_MEDIA_ID' });
});

it('retains a recovery receipt when frontmatter commit fails', async () => {
  receipts.record(remoteReceipt);
  fileManager.processFrontMatter.mockRejectedValue(new Error('read only'));
  await expect(store.commit(file, syncedState)).rejects.toMatchObject({ code: 'LOCAL_STATE_WRITE_FAILED' });
  expect(receipts.listUnresolved()).toContainEqual(remoteReceipt);
});
```

- [ ] **Step 2: Run and verify missing stores fail**

```bash
npm test -- tests/unit/publish/publish-state-store.test.ts tests/unit/publish/recovery-receipt-store.test.ts
```

- [ ] **Step 3: Implement owned-field merge and capped reports**

Use Obsidian `fileManager.processFrontMatter`. Own only the seven `wechat-*` fields from the design. `unlink()` removes local association fields but never calls WeChat. Recovery receipts in plugin data contain task ID, account hash, media ID, operation, final content/theme/cover hashes, remote timestamp and status; they contain no article body, title, credential or full remote response. Keep unresolved receipts until resolved and at most 20 resolved report summaries.

- [ ] **Step 4: Run store and settings migration tests**

```bash
npm test -- tests/unit/publish tests/unit/settings
npm run typecheck
```

- [ ] **Step 5: Scan and commit**

```bash
npm run scan:secrets
git add src/publish tests/unit/publish
git commit -m "feat: persist recoverable draft state"
```

### Task 6: Publish Decision and Transaction State Machine

**Files:**
- Create: `src/publish/publish-types.ts`
- Create: `src/publish/publish-decision.ts`
- Create: `src/publish/publish-coordinator.ts`
- Create: `src/publish/reconcile-ambiguous.ts`
- Create: `tests/unit/publish/publish-decision.test.ts`
- Create: `tests/unit/publish/publish-coordinator.test.ts`
- Create: `tests/unit/publish/reconcile-ambiguous.test.ts`

**Interfaces:**
- Produces: `decidePublish(localState, remoteState, hashes): PublishDecision`.
- Produces: `PublishCoordinator.publish(command): Promise<PublishOutcome>`.
- States: `PREPARING`, `UPLOADING_ASSETS`, `READY_TO_COMMIT`, `REMOTE_COMMITTED`, `LOCAL_COMMITTED`, `FAILED`, `AMBIGUOUS`.

- [ ] **Step 1: Write the state transition matrix tests**

```ts
it.each([
  [null, 'changed', 'CREATE'],
  ['same-account', 'same', 'SKIP'],
  ['same-account', 'changed', 'UPDATE'],
  ['other-account', 'changed', 'BLOCK_ACCOUNT_MISMATCH'],
])('chooses the expected action', (association, hashState, expected) => {
  expect(decide(association, hashState).kind).toBe(expected);
});

it('does not retry a timed-out draft create', async () => {
  client.addDraft.mockRejectedValue(ambiguousTimeout());
  const outcome = await coordinator.publish(command);
  expect(outcome.state).toBe('AMBIGUOUS');
  expect(client.addDraft).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run and verify missing coordinator failure**

```bash
npm test -- tests/unit/publish/publish-decision.test.ts tests/unit/publish/publish-coordinator.test.ts tests/unit/publish/reconcile-ambiguous.test.ts
```

- [ ] **Step 3: Implement frozen-artifact single-flight orchestration**

Key execution order:

```ts
const frozen = freezeConfirmedArtifact(command.artifact);
await preflight.assertPublishable(frozen, command.account);
const token = await tokens.getValidToken();
const resolved = await assets.resolveForWeChat(frozen, token);
await finalValidator.assertReady(resolved);
const remote = await commitDraft(decision, resolved);
receipts.record(remote);
await stateStore.commit(command.file, remote.toLocalState());
```

Single-flight key is `accountHash:vaultPath`. Errors before `READY_TO_COMMIT` are safe failures. A timeout during add/update becomes `AMBIGUOUS`. Update reconciliation reads the known draft ID and compares normalized final HTML. Create reconciliation lists recent drafts within the request window and requires exactly one title/content match; zero or multiple matches require user confirmation.

- [ ] **Step 4: Run full publish fault matrix**

```bash
npm test -- tests/unit/publish tests/unit/wechat tests/integration/wechat-fake-server.test.ts
npm run typecheck
```

Cover token failure, image failure, final validation failure, create success, update success, no-change, account mismatch, missing remote draft, ambiguous add, ambiguous update, remote success/local failure and edits after freeze.

- [ ] **Step 5: Scan and commit**

```bash
npm run scan:secrets
git add src/publish tests/unit/publish
git commit -m "feat: add recoverable draft transaction"
```

### Task 7: Publish Confirmation, Progress, Reports, and Recovery UI

**Files:**
- Create: `src/ui/publish-dialog.ts`
- Create: `src/ui/publish-progress.ts`
- Create: `src/ui/publish-report-modal.ts`
- Create: `tests/unit/ui/publish-dialog.test.ts`
- Create: `tests/integration/publish-ui.test.ts`
- Modify: `src/ui/workbench-view.ts`
- Modify: `src/preflight/preflight-engine.ts`
- Modify: `styles.css`

**Interfaces:**
- Consumes: `PublishCoordinator`, `PublishOutcome`, `PreflightReport`.
- Produces: explicit user commands for publish, reconcile, retry-safe-stage and unlink-local-association.

- [ ] **Step 1: Write failing confirmation and ambiguous-state tests**

```ts
it('shows account, create/update action, hashes, cover and network summary before commit', () => {
  const model = buildPublishDialogModel(command);
  expect(model).toMatchObject({ action: 'UPDATE', sendsArticle: true, formalPublish: false });
});

it('never offers automatic retry for AMBIGUOUS create', () => {
  expect(actionsFor(ambiguousCreate)).not.toContain('RETRY');
  expect(actionsFor(ambiguousCreate)).toContain('RECONCILE');
});
```

- [ ] **Step 2: Run and verify missing UI failure**

```bash
npm test -- tests/unit/ui/publish-dialog.test.ts tests/integration/publish-ui.test.ts
```

- [ ] **Step 3: Implement native modal flow**

The button label is always `发布到草稿箱`. Confirmation shows account AppID suffix, CREATE/UPDATE/SKIP, title, digest, theme version, image count, cover, destination hosts and “不会正式群发”. Progress maps one-to-one to state machine stages. Report shows stage, public error, `errcode/errmsg/rid`, remote effect, safe retry and next action. Never render raw request URL/body/headers.

- [ ] **Step 4: Run UI, state and build checks**

```bash
npm test -- tests/unit/ui tests/integration/publish-ui.test.ts tests/unit/publish
npm run lint
npm run typecheck
npm run build
```

- [ ] **Step 5: Scan and commit**

```bash
npm run scan:secrets
git add src/ui src/preflight styles.css tests/unit/ui tests/integration/publish-ui.test.ts
git commit -m "feat: add draft publishing workflow"
```

### Task 8: Dedicated WeChat Account Verification

**Files:**
- Create: `docs/verification/wechat-draft-real.md`
- Create: `docs/user-guide/wechat-ip-whitelist.md`
- Modify: `README.md`

**Interfaces:**
- Produces: real-account evidence without credentials or unpublished content.

- [ ] **Step 1: Write the whitelist and real-test checklist**

Guide must cover AppID/AppSecret location, exact public IP entry, connection test, dynamic IP/VPN/proxy changes, secret reset and credential clearing. Checklist covers token, body image, cover material, create, update, no-change, account mismatch, remote draft missing and backend visual comparison.

- [ ] **Step 2: Run the complete automated phase suite**

```bash
npm test
npm run lint
npm run typecheck
npm run build
npm run verify:release
npm run scan:secrets
```

- [ ] **Step 3: Execute CREATE and verify in the WeChat backend**

Use a synthetic test article and dedicated account. Confirm title, digest, body structure, all image URLs, cover and no formal publication. Record only redacted media ID suffix and timestamps.

- [ ] **Step 4: Execute UPDATE, SKIP and one controlled failure**

Change content and verify the same draft updates; rerun unchanged and verify no remote call; remove the current IP from the whitelist temporarily or use a fake server to demonstrate the exact IP error without exposing credentials. Restore the test environment after evidence capture.

- [ ] **Step 5: Scan and commit clean evidence**

```bash
npm run scan:secrets
git add README.md docs/user-guide/wechat-ip-whitelist.md docs/verification/wechat-draft-real.md
git commit -m "test: verify real wechat draft workflow"
```

## Phase Acceptance

- Token、素材和草稿协议通过假服务测试。
- SSRF、重定向、MIME、大小和超时策略通过对抗测试。
- 创建、更新、跳过、账号不匹配和草稿丢失决策正确。
- AMBIGUOUS 不自动重试，远端成功/本地失败可恢复。
- 专用测试号完成真实创建、更新和后台视觉核对。
- 未调用正式发布、群发或删除草稿接口。
