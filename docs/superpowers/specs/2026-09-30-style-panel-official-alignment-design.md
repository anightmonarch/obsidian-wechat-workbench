# 样式面板对齐官方编辑器设计

- 状态：实施中（用户确认"全局唯一来源"持久化语义；UI 以 doocs/md 官方 RightSlider 为准）
- 日期：2026-09-30
- 参考：官方源码 `doocs/md` `apps/web/src/components/editor/RightSlider.vue`、`stores/theme.ts`、`packages/shared/src/configs/style.ts`（本地克隆于 `/tmp/doocs-md`）
- 前置设计：`2026-08-18-wechat-workbench-design.md`

## 1. 问题与结论

当前插件"文章样式"面板存在三类问题：

1. **选中态配色颠倒**：未选中项渲染为大灰块，选中项反而是白底黑框，视觉重量与官方相反。
2. **交互与官方不一致**：缺少行距、段间距、链接色、引用背景四组配置；开关行是整行灰底按钮；重置按钮非红色警示样式；区块顺序不同。
3. **持久化语义错误**：面板每次修改防抖写入**单篇笔记** Frontmatter（`wechat-style`），全局默认（`defaultStyle`）没有任何 UI 入口；官方是**全局唯一配置、改动立即生效并持久化**，对所有文章一视同仁。

结论（用户已确认）：**全局唯一来源**。面板改动只更新全局默认配置，所有文章（含旧笔记）渲染一律跟随全局；发布时把当时样式快照写入 Frontmatter 仅作存档，不反向影响渲染。

## 2. 目标与非目标

### 2.1 目标

- 面板 UI、区块顺序、选中态、开关行、重置按钮与官方 RightSlider 一致（用 Obsidian CSS 变量适配明暗主题）。
- 新增四组配置并接入编译器：行距、段间距、链接色、引用背景。
- 全局唯一持久化：改动立即写入 `defaultStyle`（data.json）+ `recentStyles[themeId]`（每主题记忆）；预览立即刷新。
- 发布事务成功后 best-effort 写入 `wechat-style` Frontmatter 作为发布时样式存档。
- 配置 schema：`ArticleStyleConfig` version 2→3；插件 settings `schemaVersion` 7→8，旧数据自动补齐新字段默认值。

### 2.2 非目标

- 不做官方"探索更多主题"市场入口与自定义 CSS 编辑器（插件无此基础设施）。
- 不做标题样式 `custom` 选项（依赖 CSS 编辑器）。
- 不做"每篇文章固定样式"入口；Frontmatter 覆盖通道退役为发布存档（如未来需要可再加固）。
- 不改变主题包的排版设计本身（除块级纵向 margin 乘数化）。

## 3. 数据模型

### 3.1 `ArticleStyleConfig` version 3 新增字段

```ts
export type LineHeight = 1.5 | 1.65 | 1.75 | 1.9 | 2.05;          // 默认 1.75
export type BlockSpacing = 0.75 | 0.9 | 1 | 1.15 | 1.35;          // 默认 1，主题节奏乘数
export type LinkColorMode = 'wechat-blue' | 'primary' | 'inherit'; // 默认 'wechat-blue'
export type BlockquoteBackground = 'default' | 'transparent' | 'primary'; // 默认 'default'
```

- 解析：`parseArticleStyle` 接受 v1/v2/v3，统一升级为 v3（缺失新字段补默认值）；序列化统一输出 v3。
- 默认值变化：链接色默认从"跟随主题色"改为官方默认**微信蓝 `#576b95`**（旧用户升级后正文链接变为微信蓝，属预期对齐）。
- settings `schemaVersion` 7→8：`sanitizeSettings` 对 `defaultStyle` 与 `recentStyles` 每项做 v3 收敛；`social` 读取条件保持 `>= 7`。

### 3.2 Frontmatter 语义变更

- `wechat-style` 不再作为渲染来源；`wechat-theme-id`（legacy）同样忽略。
- 渲染来源只有全局 `defaultStyle`。
- 发布事务远端提交成功后，best-effort 把当前配置写入 `wechat-style`（v3 快照），写入失败不影响发布结果。
- 旧笔记残留的样式 Frontmatter 保留不清理（下次发布时被新快照覆盖）。

## 4. 渲染编译

`StyleCompiler.styleOverrides` 调整：

- `.wechat-article { line-height: <config.lineHeight>; --wechat-block-spacing: <config.blockSpacing>; }`（替换硬编码 1.75）。
- 链接色：
  - `wechat-blue` → `.wechat-article a { color: #576b95; }`
  - `primary` → `color: ${primaryColor}`（现行为）
  - `inherit` → `color: inherit`
- 引用背景：
  - `default` → 不输出（主题自带背景生效）
  - `transparent` → `.wechat-article blockquote { background: transparent; }`
  - `primary` → `background: color-mix(in srgb, ${primaryColor} 8%, transparent)`
- 段间距：微信编辑器会剥离 CSS 自定义属性，编译产物禁止出现 `var(--`（既有视觉契约），因此不采用官方的 `--md-block-spacing` 变量方案，改为**编译期缩放**——编译器遍历主题 CSS 的 `margin` 声明，把纵向分量乘以 `config.blockSpacing`（四舍五入到 4 位小数），横向分量与 `auto`/`0` 不变；`blockSpacing = 1` 时输出与原主题字节一致。编译器自身的插图/阅读摘要结构化 margin 同步缩放。
- 相同输入 + 主题版本 + 渲染器版本 → 字节一致输出的不变量保持（新字段纳入输入集）。

## 5. 工作流与控制器

### 5.1 `StyleWorkflow`

- `resolve()`：只依据全局 `defaultStyle`，返回 `source: 'global'`；删除 article/legacy/unsupported-fallback 分支。
- `setGlobalDefault(config)`：写 `defaultStyle` + `recentStyles[config.themeId]`（成为面板唯一保存路径）。
- 新增 `configForTheme(themeId)`：返回 `recentStyles[themeId] ?? defaultStyleForTheme(themeId)`，实现官方"每个主题记住自己上次的完整配置"。
- `reset(themeId)` 保留（重置当前主题为该主题默认配置）。
- 新增 `snapshotForPublish(file, config)`：经 `StyleFrontmatterStore` 写入发布快照（Frontmatter 存储保留，语义改为发布存档记录）。

### 5.2 `WorkbenchController`

- `updateStyle(patch)`：合并配置后立即 `setGlobalDefault` + rebuild 预览；删除 `pendingStyleSave`/`flushStyleSave`/防抖定时器/`styleSaveStatus` 三态机与 `unsupported-fallback` 拦截。
- `selectStyleTheme(themeId)`：取 `configForTheme(themeId)` 后走同一保存路径（切换主题即载入该主题记忆配置）。
- `resetStyle()`：确认弹窗后 `setGlobalDefault(reset(themeId))` + rebuild。
- `executePublish` 远端提交成功后调用 `snapshotForPublish`（best-effort，吞错）。
- 视图接口 `showStyleStatus` 三态签名移除；`showStyleMessage` 保留用于错误提示。

## 6. 面板 UI（对齐官方 RightSlider）

区块顺序与网格（与官方一致）：

1. 主题（3 列）— 无"探索更多主题"入口
2. 字体（3 列）
3. 字号（5 列，title 提示 更小/稍小/推荐/稍大/更大）
4. 行距（5 列，新增）
5. 段间距（5 列 0.75×/0.9×/1×/1.15×/1.35×，新增）
6. 链接色（3 列 微信蓝/主题色/正文色，新增）
7. 引用背景（3 列 跟随主题/无背景/主题色，新增）
8. 主题色（3 列，色点 + 文字）
9. 自定义色（原生 color input，保留）
10. 标题（两个下拉，保留）
11. 代码主题（下拉，保留）
12. 图注（2 列）
13. 开关组：Mac 样式/行号/外链转引用/首行缩进/两端对齐/字数统计 — 纯文字 + 小开关，无灰底整行按钮
14. 操作：重置 = 红色 destructive 按钮 + 既有确认弹窗

### 6.1 选中态（修复配色颠倒）

面板根元素注入 `--wechat-style-accent: <当前主题色>`：

- 未选中：`background: var(--background-primary)`；`border: 1px solid var(--background-modifier-border)`；hover 轻染。
- 选中：`background: var(--background-secondary)`；`border-color: var(--wechat-style-accent)`；`box-shadow: 0 0 0 1px color-mix(in srgb, var(--wechat-style-accent) 20%, transparent)`（对应官方 `bg-accent + border-primary + ring-1 ring-primary/20`）。

### 6.2 开关行

`display:flex; justify-content:space-between;` 无背景无边框；右侧紧凑开关（约 40×22，圆角胶囊，on 态用 `--text-normal` 中性色，与官方 shadcn Switch 一致）；保留 `role="switch"`/`aria-checked` 与既有 data-testid。

### 6.3 布局节奏

面板 `padding: 16px`、区块间 16px、区块标题到内容 8px、标题 14px medium（对齐官方 `p-4 space-y-4 space-y-2 text-sm font-medium`）。

## 7. 测试计划（TDD，先失败测试后实现）

- `style-config`：v3 默认值、v1/v2→v3 升级、序列化往返、新字段类型收敛。
- `style-compiler`：行高变量、段间距变量、链接色三态、引用背景三态、不变式（同输入字节一致）。
- `style-resolver`：Frontmatter 被忽略、恒返回全局。
- `style-workflow`：`setGlobalDefault` 同步 `recentStyles`、`configForTheme` 主题记忆、`snapshotForPublish` 写入。
- `settings-store`：schemaVersion 7→8、旧 `defaultStyle` 补齐新字段。
- 主题黄金样例：calc 乘数与新变量后的编译输出更新。
- 控制器：改动即全局保存、主题切换载入记忆配置、发布成功写样式快照、无三态状态机。
- UI：新增四组控件、区块顺序、开关 aria、重置 destructive。

## 8. 验证门禁

`npm run typecheck`、`npm run lint --max-warnings 0`、`npm test`、`npm run build`、`npm run verify:release` 全部通过；证据记入 `docs/verification/`。不执行任何 Git 提交（用户要求统一验证后自行提交）。
