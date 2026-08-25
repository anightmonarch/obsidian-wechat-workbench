# Full End-to-End Acceptance Ledger

Checkpoint: 2026-08-25. The settings UI isolation and verification-feedback updates have fresh automated and runtime-asset evidence; their real Obsidian click path remains pending because reloading can discard unsaved editor content.

Environment: macOS Obsidian 1.13.7, isolated Vault `$HOME/workspace/Github/wechat-workbench-test-vault`. The main `commit_note` Vault is outside the development plugin path.

## Acceptance matrix

| Module | Current state | Direct evidence |
| --- | --- | --- |
| Build, typecheck, tests | PASS (automated) | 2026-08-25: `npm test` rebuilt the plugin, typechecked it, then passed 89 files / 460 tests |
| Lint, release assets, secret scan | PASS (automated) | 2026-08-25: lint completed with no errors; release verifier passed; secret scan passed 265 files |
| Plugin sync and load | PARTIAL | A prior 2026-08-25 `sync:test-vault` copied the three runtime assets and confirmed a matching `main.js` SHA-256; these later source changes still require a final sync and real Obsidian reload before current-runtime acceptance |
| Workbench shell and tabs | PASS | Real Obsidian preview/settings pages and hidden prototype controls observed |
| Account settings layout/status | PARTIAL | The unified account-card layout, 8px action gap, concise AI field copy, inline missing-AppSecret error, left-aligned headings, and wide AI-control CSS passed DOM/CSS tests but need a post-reload Obsidian visual check |
| Account and AI settings refresh isolation | PASS (automated) | `createNonRenderingSettingsAccess` has no workbench-refresh dependency; `main.ts` no longer requests `requestRebuild('settings')`; focused settings tests pass |
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
| AI candidate adoption and narrow layout | PASS (real UI + automated) | In a restarted Obsidian test Vault, adopting a title candidate immediately populated the field and left no title/digest candidate container after autosave. A 120-character no-whitespace digest wrapped inside the publish-settings panel without panel-width growth or a horizontal scrollbar. Automated coverage also discards a late regeneration result after adoption |
| AI intelligent-cover generation | PASS (real UI) | After splitting the 35-second text timeout from a 90-second image timeout and restarting Obsidian, Agnes returned a real 2.35:1 candidate in 25 seconds. The candidate did not write a file or change Frontmatter before confirmation; confirmation wrote `cover-283a1bdd.png` and updated `cover` |
| AI supplemental prompt / regenerate / cancel | PASS (real UI + automated) | Real UI retained the supplemental prompt through the confirmation request, exposed `重新生成` after a candidate, cancellation left the adopted cover unchanged, and `文章首图（默认）` then cleared the explicit `cover`. Focused tests cover session-only prompt reuse and cancellation failure handling |
| Agnes provider contract probe | PASS (service only) | 2026-08-24 direct requests: text HTTP 200 with 3 unique titles + 1 digest; image HTTP 200 with HTTPS PNG URL, CDN HTTP 200, PNG signature and 4,736,610-byte response. This does not replace Obsidian UI acceptance |
| Rich clipboard copy | PARTIAL | Independent real evidence is recorded in `doocs-style-workbench-parity.md`; this checkpoint's `pbpaste` readback is not accepted because Computer Use restored clipboard ownership |
| Draft create/update/unchanged skip | BLOCKED | Previous real request reached WeChat, then was rejected by the IP whitelist; no new draft claim is made |
| Publish transaction/recovery semantics | PASS (automated) | Unit, integration and adversarial suites cover frozen artifacts, ambiguity and recovery states |

## Completion decision

The prior AI content-generation acceptance remains historical evidence. The current settings UI isolation update is not yet accepted through the real macOS Obsidian path: it must be reloaded and checked with a ready workbench before the two `PARTIAL` rows can be promoted. The project as a whole is not marked complete; remaining rows are external blockers or require stronger evidence and must not be silently promoted to PASS.
