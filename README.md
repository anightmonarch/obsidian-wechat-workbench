# WeChat Workbench

WeChat Workbench 是一个 Obsidian 桌面端微信公众号工作台：在 Vault 中写 Markdown，在右侧实时查看公众号排版，复制富文本或 HTML，并将文章明确同步到公众号后台草稿箱。

项目当前是本地验证中的 `0.1.0` 候选版本，尚未提交 Obsidian 社区插件市场，也未创建公开 Release。

## 能力范围

- 4 套内置主题，以及经过隔离和校验的 Vault 自定义主题。
- Markdown、GFM 表格、Callout、代码高亮、KaTeX、Mermaid 确定性渲染。
- 活动笔记 400 ms 防抖实时预览；被动预览不加载远程图片。
- 一键复制公众号富文本，或复制可审计的 HTML 源码。
- 文章、正文首图、插件默认图、本地 Vault 图片和可选智能生成封面；统一裁剪为 2.35:1，确认后才写入文章。
- 本机直连微信公众号 API，支持创建草稿、更新已关联草稿、无变化跳过和失败恢复。
- 单账号 UI；AppSecret、Access Token、图片 API Key 保存到 Obsidian `SecretStorage`。

插件不会调用正式发布、群发或删除草稿接口，不提供作者云端，不含遥测、广告、AI 写作或正文自动改写。

## 限制

- 仅支持 Obsidian 桌面端；`manifest.json` 声明 `isDesktopOnly: true`。
- 首版只提供单公众号账号 UI。
- 微信 API 需要公众号权限和当前公网出口 IP 白名单。
- 智能封面是可选功能，需自行配置兼容图片生成接口和密钥。
- Windows、Linux、最低版本 Obsidian 和真实账号验收状态以[发布候选记录](docs/verification/release-candidate.md)为准。

## 安装与本地验证

要求 Node.js 22.13 或更高版本。开发插件可以直接安装到独立测试 Vault，无需 GitHub Release，也无需等待 Obsidian 社区审核。

```bash
npm ci
npm test
npm run lint
npm run typecheck
npm run build
WECHAT_WORKBENCH_TEST_VAULT=/absolute/path/to/test-vault npm run sync:test-vault
```

然后在测试 Vault 中打开“设置 → 第三方插件”，关闭安全模式并启用 `WeChat Workbench`。详细步骤见[入门指南](docs/user-guide/getting-started.md)。

## 公众号账号

点击工作台右上角账号入口可快速填写 AppID、保存或清除 AppSecret；完整主题、封面和图片服务选项仍在 Obsidian 的 `WeChat Workbench` 插件设置页中。AppSecret 保存到 `SecretStorage`，插件按需获取并缓存 Access Token；普通设置、文章 Frontmatter、日志和恢复报告都不保存密钥。

发布前请完成[公众号 IP 白名单配置](docs/user-guide/wechat-ip-whitelist.md)。工作台的“发文章”按钮会先打开草稿同步确认，最终只同步到公众号后台草稿箱，不会正式群发；确认框不展示账号尾号、哈希或接口主机等实现细节。

## 使用入口

- 点击左侧 Ribbon 的报纸图标，或运行命令 `Open workbench`。
- 在右侧工作台选择主题并检查阻断项/警告项。
- `复制` 写入公众号富文本剪贴板；更多菜单可复制 HTML 源码。
- `发布设置` 查看文章信息、选择或生成封面，以及查看草稿关联状态。
- `发文章` 只创建或更新后台草稿，不会正式群发。

## 文档

- [入门与本地安装](docs/user-guide/getting-started.md)
- [自定义主题](docs/user-guide/themes.md)
- [文章封面](docs/user-guide/covers.md)
- [草稿恢复](docs/user-guide/recovery.md)
- [IP 白名单](docs/user-guide/wechat-ip-whitelist.md)
- [隐私说明](PRIVACY.md)
- [安全策略](SECURITY.md)

许可证：[MIT](LICENSE)。
