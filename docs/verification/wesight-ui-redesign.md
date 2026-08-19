# WeSight-style UI verification

- Commit: `e27fe8d`
- Obsidian: `1.13.7`
- Vault: `$HOME/workspace/Github/wechat-workbench-test-vault`
- Platform: macOS desktop
- Scope: UI and local interaction only; no credentials were entered or read, and no WeChat publish action was executed.

## Automated gates

| Gate | Result | Evidence |
| --- | --- | --- |
| Tests | PASS | `npm test` — 59 test files, 215 tests passed; the script builds `main.js` before Vitest |
| Typecheck | PASS | `npm run typecheck` |
| Lint | PASS | `npm run lint` |
| Build | PASS | `npm run build` |
| Release contract | PASS | `npm run verify:release` |
| Sensitive information | PASS | `npm run scan:secrets` — 181 files scanned |
| Vault sync | PASS | `WECHAT_WORKBENCH_TEST_VAULT=... npm run sync:test-vault` — 3 runtime assets synced |

## Desktop UI

The built plugin was synced to the isolated Vault, reloaded through Obsidian's third-party plugin manager, and opened from the `Open workbench` command.

| Check | Result | Observation |
| --- | --- | --- |
| Right-side ItemView | PASS | Workbench opens beside the Markdown editor. |
| Brand/header boundary | PASS | Shows `WeChat Workbench` and a local-settings icon; no account suffix or login UI. |
| Tabs and action bar | PASS | Shows article preview, publishing settings, `发文章`, `复制`, native theme menu, compact state and overflow menu. |
| Clean smoke note preview | PASS | `Foundation smoke test` rendered in a white article sheet on a gray preview canvas. |
| Publishing settings | PASS | Sections `文章信息`, `文章封面`, and `发布状态` were visible. |
| Theme menu | PASS | Obsidian native menu opened with built-in themes; the current theme was marked selected. |
| Default information boundary | PASS | No AppID suffix, login text, hash, task ID, media ID or expanded warning list in the default shell. |
| Actual 520px layout | BLOCKED | macOS locked before the width-specific desktop pass. |
| Actual 640px layout | BLOCKED | macOS locked before the width-specific desktop pass. |
| Actual 720px layout | BLOCKED | macOS locked before the width-specific desktop pass. |

The available screenshot captured the full Obsidian window at `1223 × 768`; it is session evidence, not committed because no screenshot artifact was retained in the repository.

## Remaining gaps

- Unlock macOS and repeat the UI pass at 520px, 640px and 720px, including horizontal-overflow checks.
- Run the authorized local公众号 draft CREATE/UPDATE/SKIP test against the configured account and compare the resulting draft in the official backend.
- Verify the minimum supported Obsidian version and Windows/Linux desktop smoke paths.
- Perform the real clipboard paste comparison in a disposable WeChat editor context.
- Do not treat this document as evidence of formal publication; the plugin is draft-only.
