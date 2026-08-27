# 工作台“正在排版”生命周期修复验证

日期：2026-08-26

测试 Vault：`$HOME/workspace/Github/wechat-workbench-test-vault`
Obsidian：1.13.7（macOS）

## 根因

工作台控制器此前对“读取快照 → 读取本地图片 → 构建渲染产物”没有总截止时间。任一步底层 Promise 若不返回，`showLoading()` 后既不会进入 `showArtifact()`，也不会进入 `showError()`，右侧发布设置会永久显示“正在排版…”。

同时，`ItemView.onClose()` 未等待控制器异步停止结束。快速关闭或恢复工作台时，旧停止流程可与新启动交叉，导致订阅与渲染代际的生命周期不完整。

## 自动验证

- `tests/integration/workbench.test.ts`：构建 Promise 永不返回时，15 秒后必须调用 `showError('Article rendering timed out.')`；旧实现测试失败。
- `tests/unit/ui/workbench-view.test.ts`：视图关闭必须等待控制器 `stop()` 完成；旧实现测试失败。
- 全量门禁：`npm test` 为 90 个测试文件、478 项测试通过；`npm run verify:release` 通过；`npm run scan:secrets` 通过。
- `npm run lint`：0 error，30 条既有 warning（UI 文案 sentence case 与 schema 兼容弃用提示）。

## 实机验证

1. 构建后通过 `sync:test-vault` 同步 3 个运行资产到隔离 Vault。
2. 重载 `wechat-workbench` 插件。
3. 打开截图对应笔记 `Codex 又又又重置了！！！.md` 的“发布设置”。
4. 验证标题、摘要、封面与发布状态均已渲染；页面不存在“正在排版…”。

未读取或展示任何 SecretStorage 中的 API Key。
