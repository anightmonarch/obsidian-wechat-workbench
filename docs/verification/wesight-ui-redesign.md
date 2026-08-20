# WeSight-style UI verification

- Verified build: current `codex/foundation` working tree on 2026-08-20
- Baseline account-settings commit: `d487d48`
- Obsidian: `1.13.7`
- Vault: `$HOME/workspace/Github/wechat-workbench-test-vault`
- Platform: macOS desktop
- Scope: UI, local Frontmatter editing, local clipboard interaction and an authorized live draft attempt using credentials already stored in Obsidian SecretStorage. No credential value was entered into tools or persisted by the repository.

## Automated gates

| Gate | Result | Evidence |
| --- | --- | --- |
| Tests | PASS | `npm test` — 62 test files, 240 tests passed; the script builds `main.js` before Vitest |
| Typecheck | PASS | `npm run typecheck` |
| Lint | PASS | `npm run lint` |
| Build | PASS | `npm run build` |
| Release contract | PASS | `npm run verify:release` |
| Sensitive information | PASS | `npm run scan:secrets` — 187 files scanned |
| Vault sync | PASS | `WECHAT_WORKBENCH_TEST_VAULT=... npm run sync:test-vault` — 3 runtime assets synced |

## Desktop UI

The current build was synced to the isolated Vault and reloaded through Obsidian. The active-note, tab, form, copy and draft-confirmation paths were exercised in the real desktop UI.

| Check | Result | Observation |
| --- | --- | --- |
| Right-side ItemView | PASS | Workbench remained inside the movable Obsidian right-side `ItemView`. |
| Brand/header boundary | PASS | Showed `WeChat Workbench` and the local-settings icon; no account suffix or login UI. |
| Preview tab label | PASS | The selected tab showed the fixed label `文章预览`; the active note name was not appended. |
| Built-in theme labels | PASS | The current selection showed `苍绿`; the native menu listed `编辑精选`, `原生简约`, `技术文档`, and `苍绿` while retaining the existing theme IDs. |
| Preview actions | PASS | Only `发文章`, `复制`, and the native theme menu were visible; there was no `需处理`, check count, overflow menu or HTML-source action. |
| Clean smoke note preview | PASS | `Foundation smoke test` and `Workbench copy smoke` rendered in a white article sheet on a gray preview canvas. |
| Publishing settings | PASS | `文章信息`, `文章封面`, and `发布状态` were visible. Title, author, digest and source URL were editable. |
| Settings-tab information boundary | PASS | The preview action bar and connection row were visually absent, including after saving and automatic re-render. |
| Article metadata save | PASS | Author and digest were edited in the plugin, saved to the isolated note Frontmatter and reflected in Obsidian. |
| Copy button | PASS with qualification | A note containing one readable local image showed `已复制公众号富文本`; immediate clipboard text readback matched the article. The real clipboard HTML flavor has not been independently inspected in a WeChat editor. |
| Missing local image handling | PASS | A cloned note with three absent source-Vault images kept the button clickable and returned a short Chinese action error instead of exposing preflight diagnostics. |
| Draft entry | PASS | `发文章` opened the draft synchronization confirmation with title, digest, theme, image count and cover. |
| Fixed WeChat transport | PASS | The original pinned-DNS transport rejected a local Fake-IP DNS result before sending credentials. Fixed official WeChat API calls now use Obsidian `requestUrl`; arbitrary remote article images remain behind DNS pinning and SSRF checks. |
| Authorized live CREATE | PASS | After allowlist propagation, token retrieval, one local body-image upload, permanent cover upload, draft creation and local association all completed. The UI showed `已同步到草稿箱`; no formal publication endpoint was called. |
| Authorized live UPDATE | PASS | A synthetic body edit updated the same associated draft. The UI showed `已同步到草稿箱`, and the local content hash and sync time changed. |
| Authorized unchanged rerun | PASS | Repeating the flow without another edit returned `内容未变化`; cached body/cover assets were reused and the draft was not mutated. |
| WeChat image URL normalization | PASS | The live API returned an approved WeChat CDN URL using `http:`. The client now upgrades that approved host to HTTPS while continuing to reject external hosts, credentials and sensitive query keys. |
| Default information boundary | PASS | No AppID suffix, login text, diagnostic code, task ID, media ID, English validation list or expanded warning list appeared in the normal shell. |
| Actual 520px layout | BLOCKED | macOS locked before the width-specific desktop pass. |
| Actual 640px layout | BLOCKED | macOS locked before the width-specific desktop pass. |
| Actual 720px layout | BLOCKED | macOS locked before the width-specific desktop pass. |

The desktop screenshots are session evidence only and are not committed to the repository.

## Remaining gaps

- Repeat the UI pass at 520px, 640px and 720px, including horizontal-overflow checks.
- Compare the resulting synthetic draft visually in the official backend; the API path and same-draft association are verified, but a backend screenshot comparison is not recorded.
- Verify the minimum supported Obsidian version and Windows/Linux desktop smoke paths.
- Perform the real clipboard paste comparison in a disposable WeChat editor context.
- Do not treat this document as evidence of formal publication; the plugin is draft-only.
