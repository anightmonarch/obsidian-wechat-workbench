# Full End-to-End Acceptance Ledger

Checkpoint: 2026-08-23

Environment: macOS Obsidian 1.13.7, isolated Vault `$HOME/workspace/Github/wechat-workbench-test-vault`. The main `commit_note` Vault is outside the development plugin path.

## Acceptance matrix

| Module | Current state | Direct evidence |
| --- | --- | --- |
| Build, typecheck, tests | PASS | `npm test`: 81 files / 413 tests passed |
| Lint, release assets, secret scan | PASS | lint 0 errors / 15 warnings; release verifier and secret scan pass |
| Plugin sync and load | PASS | `sync:test-vault` copied the three runtime assets; real window title identifies the isolated Vault |
| Workbench shell and tabs | PASS | Real Obsidian preview/settings pages and hidden prototype controls observed |
| Account settings layout/status | PASS | Real settings page shows compact account section, status, guidance, masked secret and disconnect confirmation |
| Real account verification | BLOCKED | WeChat API IP whitelist condition; explicitly excluded by task scope |
| Official-console external link | PASS | Fixed AX `mp.weixin.qq.com/`, tooltip/label, and external-browser action observed |
| Article metadata/source compatibility | PASS | Real save preserved `content_source_url`; source-link editor absent |
| Style workbench | PASS | Real `优雅` + `18px` + `活力橘` selection, right overlay, Esc close and Frontmatter persistence |
| Article first-image cover | PASS | Real prepare/confirm produced 2.35:1 preview and did not add `cover` for default first-image mode |
| Native local-cover upload | PASS | Real macOS picker → `local-test.jpg` → cropped PNG in Vault → confirmed Frontmatter path |
| AI provider UI and failure recovery | PASS | Real OpenAI/Anthropic selector, custom endpoint fields, masked key and failure message |
| AI model discovery success | PASS | After the narrowly scoped proxy-synthetic DNS fallback, the real settings UI fetched `https://openrouter.ai/api/v1/models` with disposable `synthetic-e2e-key` and populated the model selector; the endpoint/key were discarded without saving |
| AI intelligent-cover generation | BLOCKED | Requires explicit configured image service and per-call disclosure confirmation |
| Rich clipboard copy | PARTIAL | Independent real evidence is recorded in `doocs-style-workbench-parity.md`; this checkpoint's `pbpaste` readback is not accepted because Computer Use restored clipboard ownership |
| Draft create/update/unchanged skip | BLOCKED | Previous real request reached WeChat, then was rejected by the IP whitelist; no new draft claim is made |
| Publish transaction/recovery semantics | PASS (automated) | Unit, integration and adversarial suites cover frozen artifacts, ambiguity and recovery states |

## Completion decision

The project is not marked complete. All local UI and cover paths exercised in the fixed Vault are passing. The remaining rows are either explicit external blockers or require a stronger clipboard/provider evidence path; they must not be silently promoted to PASS.
