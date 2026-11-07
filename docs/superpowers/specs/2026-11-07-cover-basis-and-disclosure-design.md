# 封面生成依据简化与披露诚实化设计(2026-11-07)

## 背景

2026-11-07 模块验收(见 `docs/verification/2026-11-07-modules-acceptance.md`)发现两个问题:

1. **P1 披露失真**:封面确认弹窗在标题/摘要未勾选时显示"仅视觉主题,不发送标题或摘要",但 Codex 后端实际会把未勾选的标题/摘要以"主题参考"形式发送;API 后端则相反,未勾选时发送空字符串。两个后端行为不一致,且与披露文案矛盾。
2. **P3 披露卡不实时刷新**:补充要求文本框输入后,披露卡内容只在下一次 `onOpen()` 时更新。

## 决策(用户确认)

- 封面生成的**内容依据 = 标题 + 摘要**,不使用全文(文章正文过于琐碎,不适合直接作为封面依据)。
- 标题或摘要**为空时阻断生成**,并提示用户先填写或用 AI 生成。
- 勾选框"标题/摘要"仅控制**是否把对应文字绘制进图**,不再影响是否发送。

## 行为定义

### 生成依据与绘制分离

- `CoverWorkflow.prepareAi`:无论 `codex` 还是 `api` 后端,一律把 `artifact.metadata.title/digest` 完整传给生成器;`selection.includeTitle/includeDigest` 仅作为绘制标记透传。
- 前置校验:`artifact.metadata.title` 或 `artifact.metadata.digest` 为空白时,抛 `CoverGenerationError('COVER_TITLE_DIGEST_REQUIRED')`。该错误在两个后端分支之前统一抛出。

### 入口引导

- `workbench-view.generateAiCover`:打开确认弹窗前检查 `disclosure.payload.title/digest`,为空则 Notice 提示"请先在『发布设置 → 文章信息』中填写或生成标题与摘要",不打开弹窗。

### 披露文案诚实化

- `disclosureCard` 的 `sentFields` 恒含「标题」「摘要」(作为生成依据);补充要求非空时追加「补充封面要求」。
- 文案区分:`勾选项将绘制到图中` vs `仅作生成依据,不绘制到图中`。
- 移除误导性回退文案"仅视觉主题,不发送标题或摘要"。

### 披露卡实时刷新

- 文本框 `input` 事件只更新披露卡容器内容,不重绘整个弹窗(避免输入焦点丢失)。

## 兼容性

- `buildAiCoverDisclosure` / `buildCodexCoverDisclosure` 的 `sentFields` 模型字段(`title/digest/supplementalPrompt`)不变,仅 UI 渲染语义调整。
- `COVER_TITLE_DIGEST_REQUIRED` 加入 `aiCoverFailureMessage` 映射,兜底提示与入口引导一致。
- 不修改 Frontmatter 结构与发布流程。
