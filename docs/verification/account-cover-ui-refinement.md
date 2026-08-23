# Account and Cover UI Refinement Verification

Verification checkpoint: 2026-08-23

Scope: the approved account settings, official-console navigation, article metadata, cover picker and intelligent-cover provider refinements. All desktop checks use the isolated Vault `$HOME/workspace/Github/wechat-workbench-test-vault`.

## Automated evidence

| Check | Result | Evidence |
| --- | --- | --- |
| Unit, integration, visual and adversarial tests | PASS | `npm test`; 81 files / 413 tests passed |
| TypeScript and production bundle | PASS | `npm run build` |
| Release asset/public contract verification | PASS | `npm run verify:release` |
| Sensitive-information scan | PASS | `npm run scan:secrets` |
| Working-tree whitespace check | PASS | `git diff --check` |

## Real Obsidian evidence

Environment: Obsidian 1.13.7 on macOS, reloaded from the latest build synced to the isolated test Vault.

- Workbench header exposes `跳转到公众号后台` and `mp.weixin.qq.com/`; the former local account-settings icon is absent.
- Plugin settings show the WeSight-aligned compact account section, local IP-whitelist guidance, `打开公众号后台`, AppID/AppSecret fields, explicit `保存账号配置`, `验证连接`, `断开连接`, and `连接状态：待验证`.
- Intelligent-cover settings show `接口协议`, `服务地址`, `图片 API Key`, `可用模型`, and `获取模型`; the protocol menu contains `OpenAI 兼容` and `Anthropic`.
- The cover picker shows only `文章首图（默认）`, `上传本地图片`, and `智能生成封面`. The latter remains disabled until the image service is configured.
- Clicking `使用本地图片` opened the native macOS file picker. No Vault-path text input was shown.
- The publish settings UI contains no `原文链接` field.

Additional real-user checks completed in the same Vault:

- On a note without an existing cover, `文章首图（默认）` produced a 2.35:1 preview and confirmation without adding a `cover` Frontmatter field.
- Selecting `local-test.jpg` through the native picker produced a cropped PNG under `.wechat-workbench/covers/` and wrote that Vault-owned path to the note after confirmation.
- Editing title, author and digest through `保存文章信息` preserved a pre-existing `content_source_url` value.
- `断开连接` opened the confirmation dialog; cancelling left the account state unchanged.
- The AI model request failure path displayed `模型列表获取失败，请检查服务地址和 API Key 后重试。`; the synthetic test key and endpoint were cleared without saving.
- The first disposable public catalog check used `https://openrouter.ai/api/v1` and `synthetic-e2e-key`; the UI initially failed because the machine proxy returned the synthetic DNS answer `198.18.0.24`, which the pinned transport correctly rejected as non-public.
- After adding the narrowly scoped proxy-synthetic DNS fallback, the same real settings flow populated the model selector from `https://openrouter.ai/api/v1/models`; the temporary endpoint/key were discarded without saving.
- Clicking the workbench external-link icon invoked the system external-browser path; the live AX tree exposed `mp.weixin.qq.com/` and Google Chrome was the running default browser.
- The style panel accepted `优雅`, `18px` and `活力橘`; the real screenshot showed the panel as a right-side overlay with no middle blank region. `Escape` closed it, and the note persisted the selected style values.

The existing real rich-clipboard evidence remains in [Doocs parity verification](doocs-style-workbench-parity.md). A second clipboard readback in this checkpoint was not accepted as new evidence because the Computer Use session intermittently restored or switched the system clipboard/window focus; no claim is made from that attempt.

## Not yet accepted by this checkpoint

- A real WeChat token verification was not rerun in this refinement checkpoint. The current network/IP whitelist mismatch is an external environment condition and is excluded from this batch acceptance.
- No real intelligent-cover request was sent. A provider URL, model and API key require explicit user configuration and per-call disclosure confirmation.
- The three cover modes were exercised through the real picker entry point; selecting and confirming a new external image was not performed to avoid changing the user’s test note without an explicit acceptance action.
- Official公众号后台 visual comparison and Windows/Linux desktop checks remain outside this macOS checkpoint.
