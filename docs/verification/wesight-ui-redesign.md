# WeSight-style UI verification

- Commit: `d487d48`
- Desktop screenshot observation commit: `f2f52a5`
- Obsidian: `1.13.7`
- Vault: `$HOME/workspace/Github/wechat-workbench-test-vault`
- Platform: macOS desktop
- Scope: UI and local interaction only; no credentials were entered or read, and no WeChat publish action was executed.

## Automated gates

| Gate | Result | Evidence |
| --- | --- | --- |
| Tests | PASS | `npm test` — 60 test files, 217 tests passed; the script builds `main.js` before Vitest |
| Typecheck | PASS | `npm run typecheck` |
| Lint | PASS | `npm run lint` |
| Build | PASS | `npm run build` |
| Release contract | PASS | `npm run verify:release` |
| Sensitive information | PASS | `npm run scan:secrets` — 183 files scanned |
| Vault sync | PASS | `WECHAT_WORKBENCH_TEST_VAULT=... npm run sync:test-vault` — 3 runtime assets synced |

## Desktop UI

The `f2f52a5` build was synced to the isolated Vault, reloaded through Obsidian's third-party plugin manager, and opened from the `Open workbench` command. The corrected `e27fe8d` build was synced afterward, but macOS locked before it could be reloaded and observed.

| Check | Result | Observation |
| --- | --- | --- |
| Right-side ItemView | PASS on `f2f52a5`; current rerun pending | Workbench opened beside the Markdown editor. |
| Brand/header boundary | PASS on `f2f52a5`; current rerun pending | Showed `WeChat Workbench` and a local-settings icon; no account suffix or login UI. |
| Tabs and action bar | PASS on `f2f52a5`; current rerun pending | Showed article preview, publishing settings, `发文章`, `复制`, native theme menu, compact state and overflow menu. |
| Clean smoke note preview | PASS on `f2f52a5`; current rerun pending | `Foundation smoke test` rendered in a white article sheet on a gray preview canvas. |
| Publishing settings | PASS on `f2f52a5`; current rerun pending | Sections `文章信息`, `文章封面`, and `发布状态` were visible. |
| Theme menu | PASS on `f2f52a5`; current rerun pending | Obsidian native menu opened with built-in themes; the current theme was marked selected. |
| Default information boundary | PASS on `f2f52a5`; current rerun pending | No AppID suffix, login text, hash, task ID, media ID or expanded warning list in the default shell. |
| Local account quick panel | BLOCKED on current build | Implemented with official Obsidian `Modal`/`Setting` APIs and covered by automated tests; latest desktop reload is pending unlock. |
| Actual 520px layout | BLOCKED | macOS locked before the width-specific desktop pass. |
| Actual 640px layout | BLOCKED | macOS locked before the width-specific desktop pass. |
| Actual 720px layout | BLOCKED | macOS locked before the width-specific desktop pass. |

The available screenshot captured the full Obsidian window at `1223 × 768`; it is session evidence, not committed because no screenshot artifact was retained in the repository.

## Remaining gaps

- Unlock macOS and repeat the UI pass at 520px, 640px and 720px, including horizontal-overflow checks.
- Reload the current `d487d48` build in the test Vault and repeat the basic UI checks above; the current code has not yet received a fresh desktop observation.
- Run the authorized local公众号 draft CREATE/UPDATE/SKIP test against the configured account and compare the resulting draft in the official backend.
- Verify the minimum supported Obsidian version and Windows/Linux desktop smoke paths.
- Perform the real clipboard paste comparison in a disposable WeChat editor context.
- Do not treat this document as evidence of formal publication; the plugin is draft-only.
