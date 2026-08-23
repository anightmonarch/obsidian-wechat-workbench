# Full End-to-End Acceptance Ledger

Checkpoint: 2026-08-24

Environment: macOS Obsidian 1.13.7, isolated Vault `$HOME/workspace/Github/wechat-workbench-test-vault`. The main `commit_note` Vault is outside the development plugin path.

## Acceptance matrix

| Module | Current state | Direct evidence |
| --- | --- | --- |
| Build, typecheck, tests | PASS (automated) | `npm test`: 85 files / 437 tests passed |
| Lint, release assets, secret scan | PASS (automated) | lint 0 errors / 20 warnings; release verifier and secret scan pass for 253 files |
| Plugin sync and load | PASS | `sync:test-vault` copied the three runtime assets; real window title identifies the isolated Vault |
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
| AI text generation with Agnes | BLOCKED (desktop) | Settings were prepared in the isolated Vault, but the final real request was not sent because Computer Use hit macOS lock; no provider success claim is made |
| AI intelligent-cover generation | BLOCKED (desktop) | Agnes image request contract and session flows pass automated tests; final real disclosure → generation → preview → adopt flow remains pending because Computer Use hit macOS lock |
| AI supplemental prompt / regenerate / cancel | PASS (automated), PENDING (real UI) | 28 focused cover tests verify 500-character session-only prompt, reuse on regeneration, cancellation without false failure, and first-image reset |
| Agnes provider contract probe | PASS (service only) | 2026-08-24 direct requests: text HTTP 200 with 3 unique titles + 1 digest; image HTTP 200 with HTTPS PNG URL, CDN HTTP 200, PNG signature and 4,736,610-byte response. This does not replace Obsidian UI acceptance |
| Rich clipboard copy | PARTIAL | Independent real evidence is recorded in `doocs-style-workbench-parity.md`; this checkpoint's `pbpaste` readback is not accepted because Computer Use restored clipboard ownership |
| Draft create/update/unchanged skip | BLOCKED | Previous real request reached WeChat, then was rejected by the IP whitelist; no new draft claim is made |
| Publish transaction/recovery semantics | PASS (automated) | Unit, integration and adversarial suites cover frozen artifacts, ambiguity and recovery states |

## Completion decision

The project is not marked complete. All local UI and cover paths exercised in the fixed Vault are passing. The remaining rows are either explicit external blockers or require a stronger clipboard/provider evidence path; they must not be silently promoted to PASS.
