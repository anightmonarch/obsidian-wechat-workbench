# Foundation Local Obsidian Smoke Test

- 阶段：Foundation
- 测试 Vault：`<TEST_VAULT>`
- 目标插件目录：`<TEST_VAULT>/.obsidian/plugins/wechat-workbench/`
- 正式社区审核：不需要
- 测试时间：2026-08-19 00:54:12 +0800
- macOS：26.3.2 (25D2150)
- 本机 Obsidian 安装版本：1.12.7

## 自动化前置

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| 单元与集成测试 | PASS | 7 files, 16 tests, 0 failures |
| ESLint | PASS | 0 errors, 0 warnings |
| TypeScript | PASS | `tsc --noEmit`, exit 0 |
| 生产构建 | PASS | `main.js` 生成成功 |
| Release 资产 | PASS | `main.js`、`manifest.json`、`styles.css` 校验通过 |
| 敏感信息 | PASS | 35 files，0 findings |

## 真实 Obsidian 检查

| 检查 | 结果 | 观察 |
| --- | --- | --- |
| 运行目录只有 `main.js`、`manifest.json`、`styles.css` | PASS | 源与目标 SHA-256 逐项一致 |
| 插件出现在“已安装插件”列表 | BLOCKED | Mac 锁屏，尚未操作 UI |
| 插件可以启用 | BLOCKED | Mac 锁屏，尚未操作 UI |
| Ribbon 图标打开右侧工作台 | BLOCKED | Mac 锁屏，尚未操作 UI |
| 命令面板打开工作台且复用同一 leaf | BLOCKED | Mac 锁屏，尚未操作 UI |
| 工作台可移动、缩放和关闭 | BLOCKED | Mac 锁屏，尚未操作 UI |
| 关闭后可重新打开 | BLOCKED | Mac 锁屏，尚未操作 UI |
| 重启 Obsidian 后工作区恢复 | BLOCKED | Mac 锁屏，尚未操作 UI |
| AppID 普通设置可持久化 | BLOCKED | Mac 锁屏，尚未操作 UI |
| Secret 只显示“已配置/未配置”，不回显值 | BLOCKED | Mac 锁屏，尚未操作 UI |
| 修改 manifest 后必须重启才能生效 | BLOCKED | Mac 锁屏，尚未操作 UI |

## 记录规则

- 每项记录 Obsidian 版本、macOS 版本、时间和实际观察。
- 只有真实操作验证成功才标记 `PASS`。
- 环境缺失标记 `BLOCKED`，不得写成通过。
- 截图不得包含真实账号、密钥、未发布文章内容或本机私有绝对路径。
