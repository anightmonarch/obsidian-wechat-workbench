# Privacy

WeChat Workbench has no author-operated server, telemetry, advertising or analytics. Article processing and theme rendering occur locally unless the user explicitly requests a network action.

## Local data

- AppSecret, Access Token and image API key: Obsidian `SecretStorage` only.
- AppID, theme/default settings, non-secret token expiry, media cache hashes/IDs and recovery receipts: plugin `data.json`.
- Draft association, content/theme/cover hashes and sync time: owned `wechat-*` fields in article Frontmatter.
- Generated covers and custom themes: files inside the user's Vault.

Obsidian SecretStorage is a Vault-level credential facility, not a hardware enclave or per-plugin sandbox. Treat every third-party plugin installed in the same Vault as part of the local trust boundary.

## Network destinations

| Trigger | Destination | Data sent |
| --- | --- | --- |
| Obtain token | `api.weixin.qq.com` | AppID and AppSecret |
| Upload images / create, update or inspect drafts | `api.weixin.qq.com` | Access Token, article metadata, final HTML, image bytes, cover bytes and draft media ID when updating |
| Explicit publish with remote body images | The exact HTTPS image hosts referenced by the article | Image GET request only; private/local targets are blocked and DNS is pinned |
| Explicit intelligent-cover generation | User-configured provider base URL | Model, title, digest and at most 1,500 Unicode characters of plain-text body excerpt |
| Provider returns an image URL | The returned HTTPS image host | Image GET request only, under the same private-address and redirect policy |

`mmbiz.qpic.cn` URLs may appear in final article HTML after WeChat image upload. Passive workbench preview does not automatically load remote article images.

Before intelligent-cover generation, the plugin displays the provider URL, model, exact text fields and a third-party cost notice. Cancelling the dialog sends nothing.

## No formal publication

The plugin calls token, material/image and draft APIs only. It does not call formal publish, mass-send or draft deletion APIs.
