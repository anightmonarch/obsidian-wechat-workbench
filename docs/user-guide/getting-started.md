# Getting Started

## Requirements

- Obsidian desktop 1.11.4 or newer.
- Node.js 22.13 or newer for source builds.
- A separate test Vault for development builds.

## Build and install locally

```bash
git clone https://github.com/reference-project/obsidian-wechat-workbench.git
cd obsidian-wechat-workbench
npm ci
npm test
npm run build
WECHAT_WORKBENCH_TEST_VAULT=/absolute/path/to/test-vault npm run sync:test-vault
```

The sync command writes only these runtime files:

```text
<TEST_VAULT>/.obsidian/plugins/wechat-workbench/
├── main.js
├── manifest.json
└── styles.css
```

Open the test Vault, go to “设置 → 第三方插件”, disable safe mode if prompted, reload plugins and enable `WeChat Workbench`. Local installation does not require community review.

## Configure one account

1. Open “设置 → WeChat Workbench”.
2. Enter the公众号 AppID.
3. Enter AppSecret and click save. The field is intentionally blank after saving.
4. Complete the [IP whitelist](wechat-ip-whitelist.md).
5. Open a Markdown note and open `WeChat Workbench` from the Ribbon or command palette.

Account configuration is optional for preview, themes and copy. It is required only for draft synchronization.

## Article Frontmatter

```yaml
---
title: Article title
author: Author
digest: Short digest
cover: .wechat-workbench/covers/article-12345678/cover-abcdef12.png
content_source_url: https://example.com/source
wechat-theme-id: native
---
```

The plugin owns only documented `wechat-*` draft fields. Unknown Frontmatter fields are preserved.
