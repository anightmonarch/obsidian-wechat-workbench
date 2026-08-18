# WeChat Workbench

WeChat Workbench 是一个 Obsidian 桌面端微信公众号发布工作台。项目当前处于分阶段开发和本地验证阶段，尚未公开发布。

## 当前能力

- 符合 Obsidian 社区插件 manifest 规范的桌面端插件骨架。
- 默认在右侧打开并复用 `ItemView`。
- 本地普通设置与 Obsidian `SecretStorage` 分离。
- 4 套内置主题、安全的 Vault 自定义主题。
- Markdown、GFM 表格、Callout、代码、KaTeX 和 Mermaid 确定性渲染。
- 活动笔记 400 ms 防抖实时预览，远程图片被动预览零网络。
- 复制公众号富文本和 HTML 源码，不配置公众号账号也可使用。
- 复制前执行阻断项/警告项预检，本地图片采用全有或全无处理。
- 可把运行资产同步到独立测试 Vault，无需社区审核。

封面生成和微信公众号草稿事务仍在后续阶段实现；真实 Obsidian 与微信编辑器验收尚未完成。

## 本地开发

要求 Node.js 22.13 或更高版本。

```bash
npm install
npm test
npm run lint
npm run typecheck
npm run build
```

必须使用独立测试 Vault，不得在日常主 Vault 中加载开发插件。构建完成后运行：

```bash
WECHAT_WORKBENCH_TEST_VAULT=/absolute/path/to/test-vault npm run sync:test-vault
```

同步目标：

```text
<TEST_VAULT>/.obsidian/plugins/wechat-workbench/
├── main.js
├── manifest.json
└── styles.css
```

在 Obsidian 中开启社区插件并启用 `WeChat Workbench` 即可本地测试。此过程不需要 GitHub Release，也不需要 Obsidian 社区审核。

## 安全边界

- 不把开发插件加载到用户主 Vault。
- AppSecret、Access Token 和图片 API Key 只能进入 Obsidian `SecretStorage`。
- 插件不维护作者云端，不加入遥测或广告。
- 当前阶段不执行微信公众号正式发布或群发。

详细设计见 [`docs/superpowers/specs/2026-08-18-wechat-workbench-design.md`](docs/superpowers/specs/2026-08-18-wechat-workbench-design.md)。
