# Rendering Local Obsidian Smoke Test

- 阶段：Rendering and Workbench UI
- 测试 Vault：`<TEST_VAULT>`
- 正式社区审核：不需要
- 测试时间：2026-08-19

## 自动化检查

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| 单元与集成测试 | PASS | 22 files, 68 tests, 0 failures |
| ESLint | PASS | 0 errors, 0 warnings |
| TypeScript | PASS | `tsc --noEmit`, exit 0 |
| 生产构建 | PASS | `main.js` 生成成功 |
| Release 资产 | PASS | `main.js`、`manifest.json`、`styles.css` 校验通过 |
| 敏感信息 | PASS | 91 files，0 findings |
| 运行资产同步 | PASS | 3 files synced to isolated Vault |

## 真实 Obsidian 检查

| 检查 | 结果 | 观察 |
| --- | --- | --- |
| 插件加载与启用 | BLOCKED | macOS 锁屏，尚未操作 UI |
| 活动 Markdown 400 ms 内刷新 | BLOCKED | macOS 锁屏，尚未操作 UI |
| 320/360/480/640 px 宽度 | BLOCKED | macOS 锁屏，尚未操作 UI |
| 浅色/深色与 100/125/150% 缩放 | BLOCKED | macOS 锁屏，尚未操作 UI |
| 4 个内置主题切换 | BLOCKED | macOS 锁屏，尚未操作 UI |
| 自定义主题发现与应用 | BLOCKED | macOS 锁屏，尚未操作 UI |
| 远程图片无被动请求 | BLOCKED | 自动化通过，真实 UI 尚未观察 |
| 本地图片、公式、Mermaid 预览 | BLOCKED | macOS 锁屏，尚未操作 UI |

`BLOCKED` 不等于通过。电脑解锁后必须在同一测试 Vault 补做并记录实际观察。
