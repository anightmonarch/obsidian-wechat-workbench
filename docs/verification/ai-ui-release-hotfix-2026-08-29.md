# AI UI 与发布版本一致性热修验证

日期：2026-08-29

## 问题台账

| 编号 | 结论 | 状态 | 证据 |
| --- | --- | --- | --- |
| HOTFIX-001 | 图片服务未配置时，封面入口没有与标题/摘要一致的原位反馈 | FIXED | `workbench-publish-settings.test.ts` 先失败后通过；无配置时不调用生成回调，只显示固定安全文案 |
| HOTFIX-002 | Agnes 等 OpenAI-compatible 服务可能返回三行/列表标题，旧解析器仅接受 `titles` JSON 对象 | FIXED | `openai-text-generator.test.ts` 的 JSON 数组、三行文本和编号列表用例先失败后通过；解释段落和错误数量继续拒绝 |
| HOTFIX-003 | 长摘要候选在窄侧栏中可能溢出灰色背景 | FIXED | CSS 契约新增 `height: auto`、`overflow: visible` 和既有正常换行；视觉测试先失败后通过 |
| HOTFIX-004 | 截图中的样式面板看似旧版 | VERIFIED_NOT_A_ROLLBACK | 当前源码和隔离 Vault 真机均包含主题、字体、字号、主题色、标题、代码主题、图注及六个开关；新开面板从“主题”开始。原截图为面板滚动到下半段 |
| HOTFIX-005 | 主 Vault、公开 Release 和源码构建均声明 `0.1.0`，但 `main.js` 哈希不同 | CONFIRMED | 主 Vault `3e1f197e...`；公开 Release `d31335c9...`；热修前源码构建 `7eea150f...`。Git reflog 无 reset/rebase 回退 |
| HOTFIX-006 | 智能封面在线生成仍未形成成功预览证据 | PARTIAL | 当前实现已将鉴权、限流、模型拒绝、超时、连接、下载和输出格式映射为不同安全提示；本次尚未取得真实候选图预览，不记录为通过 |
| HOTFIX-007 | 用户认为插件已进入 Obsidian 社区插件市场 | NOT_LISTED | 读取官方 `obsidianmd/obsidian-releases` 的 `community-plugins.json` 无 `wechat-workbench` 条目，且未找到对应 PR。GitHub 公开 Release 不等于社区目录收录 |

## TDD 证据

### 配置反馈与候选布局

首次运行：

```text
Test Files  2 failed (2)
Tests       2 failed | 14 passed (16)
```

修复后：

```text
Test Files  2 passed (2)
Tests       16 passed (16)
```

### 标题格式兼容

首次运行：

```text
Test Files  1 failed (1)
Tests       3 failed | 10 passed (13)
```

修复后：

```text
Test Files  1 passed (1)
Tests       13 passed (13)
```

## 全量自动化门禁

```text
Test Files  91 passed (91)
Tests       526 passed (526)
lint        passed with zero warnings
typecheck   passed
verify      Release assets verified; public contracts verified
npm audit   found 0 vulnerabilities
secrets     Sensitive information scan passed (277 files)
```

## 隔离 Vault 运行时

- Vault：`/Users/wangboshi/workspace/Github/wechat-workbench-test-vault`
- Obsidian：`1.13.7`
- 同步后仓库与 Vault 资产 SHA-256 一致：
  - `main.js`: `bc0b7c3f92c10aa1ab9071ec257b517f0205a405a28518214dc84514b6fbafb7`
  - `manifest.json`: `89fc46d6a10a73c57265905de7be0a404d06e395682ef18edd3d13f13df52b7f`
  - `styles.css`: `2dfc7ea3844ea1eb7f605d58e2d061d99e88fc7583b971945d4eb302b725f00b`
- 使用 Obsidian `Force Reload` 重载后，新开样式面板首先显示主题、字体、字号和主题色，后续控件完整。
- 未在 `commit_note` 主 Vault 写入测试凭据、修改文章或执行生成请求。

## 发布前剩余门槛

1. 将版本统一升级到 `0.1.1` 后重新构建，重新计算最终三资产哈希。
2. 在线封面若未出现候选预览，只能记录明确的安全错误分类，不得宣称生图链路通过。
3. GitHub Release 发布后下载三份资产复核哈希。
4. 官方社区插件清单仍无条目时，只能报告 GitHub Release/BRAT 更新可用，不能声称社区市场自动更新可用。
