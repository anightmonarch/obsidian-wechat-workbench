# Full End-to-End Acceptance Ledger

Checkpoint: 2026-08-24

Environment: macOS Obsidian 1.13.7, isolated Vault `$HOME/workspace/Github/wechat-workbench-test-vault`. The main `commit_note` Vault is outside the development plugin path.

## Acceptance matrix

| Module | Current state | Direct evidence |
| --- | --- | --- |
| Build, typecheck, tests | PASS (automated) | `npm test`: 86 files / 439 tests passed |
| Lint, release assets, secret scan | PASS (automated) | lint 0 errors / 19 existing warnings; release verifier and secret scan pass for 255 files |
| Plugin sync and load | PASS | `sync:test-vault` copied the three runtime assets; repository and isolated-Vault `main.js` have the same SHA-256, then Obsidian was fully restarted into the isolated Vault |
| Workbench shell and tabs | PASS | Real Obsidian preview/settings pages and hidden prototype controls observed |
| Account settings layout/status | PASS | Real settings page shows compact account section, status, guidance, masked secret and disconnect confirmation |
| Real account verification | BLOCKED | WeChat API IP whitelist condition; explicitly excluded by task scope |
| Official-console external link | PASS | Fixed AX `mp.weixin.qq.com/`, tooltip/label, and external-browser action observed |
| Article metadata/source compatibility | PASS | Real save preserved `content_source_url`; source-link editor absent |
| Style workbench | PASS | Real `优雅` + `18px` + `活力橘` selection, right overlay, Esc close and Frontmatter persistence |
| Article first-image cover | PASS | Real prepare/confirm produced 2.35:1 preview and did not add `cover` for default first-image mode |
| Native local-cover upload | PASS | Real macOS picker → `local-test.jpg` → cropped PNG in Vault → confirmed Frontmatter path |
| AI provider UI and failure recovery | PASS (UI) | Real Obsidian 1.13.7 settings page shows two independent OpenAI-compatible cards with complete Endpoint URL, masked SecretStorage field, manually entered model name and no model-list selector |
| AI model discovery | NOT APPLICABLE | Deliberately removed from the approved first-version scope; no model-list Endpoint or remote discovery request is part of the implementation |
| AI text generation with Agnes | PASS (real UI) | Obsidian 1.13.7 generated 3 title candidates, adopted one, generated 1 digest candidate, adopted it, and the isolated note Frontmatter reflected both values |
| AI metadata autosave | PASS (real UI) | Author field showed `待保存` immediately, then `已保存` after debounce while focus stayed on the same input; the test value was restored and persisted |
| AI intelligent-cover generation | PASS (real UI) | After splitting the 35-second text timeout from a 90-second image timeout and restarting Obsidian, Agnes returned a real 2.35:1 candidate in 25 seconds. The candidate did not write a file or change Frontmatter before confirmation; confirmation wrote `cover-283a1bdd.png` and updated `cover` |
| AI supplemental prompt / regenerate / cancel | PASS (real UI + automated) | Real UI retained the supplemental prompt through the confirmation request, exposed `重新生成` after a candidate, cancellation left the adopted cover unchanged, and `文章首图（默认）` then cleared the explicit `cover`. Focused tests cover session-only prompt reuse and cancellation failure handling |
| Agnes provider contract probe | PASS (service only) | 2026-08-24 direct requests: text HTTP 200 with 3 unique titles + 1 digest; image HTTP 200 with HTTPS PNG URL, CDN HTTP 200, PNG signature and 4,736,610-byte response. This does not replace Obsidian UI acceptance |
| Rich clipboard copy | PARTIAL | Independent real evidence is recorded in `doocs-style-workbench-parity.md`; this checkpoint's `pbpaste` readback is not accepted because Computer Use restored clipboard ownership |
| Draft create/update/unchanged skip | BLOCKED | Previous real request reached WeChat, then was rejected by the IP whitelist; no new draft claim is made |
| Publish transaction/recovery semantics | PASS (automated) | Unit, integration and adversarial suites cover frozen artifacts, ambiguity and recovery states |

## Completion decision

The AI content-generation scope is complete: current production code was synced, restarted, and accepted through the real macOS Obsidian path. The project as a whole is not marked complete: the remaining rows are explicit external blockers or require a stronger clipboard evidence path, and they must not be silently promoted to PASS.
