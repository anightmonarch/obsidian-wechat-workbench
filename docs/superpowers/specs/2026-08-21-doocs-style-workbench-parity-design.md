# Doocs 样式配置面板复刻设计

- 状态：待用户审查
- 日期：2026-08-21
- 适用版本：`0.2.x`
- 参考项目：[`doocs/md`](https://github.com/doocs/md)，核对提交 `03b4b78f0a218d1a5916f8aa8afe9d4f9048e281`
- 本文仅覆盖样式配置面板，不覆盖 Doocs 编辑器、文件管理、图床、AI 或主题市场
- 本文在样式配置面板范围内取代 `2026-08-21-doocs-style-workbench-design.md` 中与本设计冲突的 UI、字段和验收规则

## 1. 目标与结论

WeChat Workbench 在 Obsidian 右侧 `ItemView` 中复刻 Doocs 截图所示的样式配置能力和主要视觉效果。复刻对象是“样式配置面板及其排版结果”，不是 Doocs Web 应用。

实现必须满足：

- 控件顺序、分组、列数、选中态、间距和交互尽可能接近 Doocs 截图。
- 不引入 Vue、Pinia、Tailwind、shadcn-vue、Reka UI 或 Doocs Web 组件。
- 使用 Obsidian 官方公开 API、DOM 辅助方法和组件语义实现。
- 配置变化实时更新文章预览，不销毁样式面板，不重置滚动位置，不显示“正在保存样式”。
- 预览、复制和公众号草稿正文继续消费同一个不可变 `RenderArtifact`。
- 主题市场、“探索更多主题”、自由 CSS 编辑器和标题自定义 CSS 延后。

## 2. 依据与约束

### 2.1 Doocs 行为依据

本期对照以下官方源码：

- [`RightSlider.vue`](https://github.com/doocs/md/blob/main/apps/web/src/components/editor/RightSlider.vue)：面板顺序、网格、标题双下拉、代码主题下拉、图注按钮和开关列表。
- [`style.ts`](https://github.com/doocs/md/blob/main/packages/shared/src/configs/style.ts)：字体、字号、11 个预设色、标题层级、图注和默认值。
- [`theme.ts`](https://github.com/doocs/md/blob/main/apps/web/src/stores/theme.ts)：切换、重置和配置更新语义。
- [`renderer-impl.ts`](https://github.com/doocs/md/blob/main/packages/core/src/renderer/renderer-impl.ts)：外链转引用和字数统计的正文投影行为。

Doocs 源码许可证为 WTFPL。若实施时移植纯函数或配置数据，应在源码注释和发布前许可证清单中记录来源；不得把 Doocs 运行时组件直接打包进插件。

### 2.2 Obsidian 规范依据

实现遵循：

- [Views](https://docs.obsidian.md/Plugins/User+interface/Views)：使用 `ItemView` 生命周期，视图由 Obsidian 管理，不持有全局叶子引用。
- [HTML elements](https://docs.obsidian.md/Plugins/User+interface/HTML+elements)：使用 `createEl()`、`createDiv()` 和 Obsidian CSS 变量。
- [Modals](https://docs.obsidian.md/Plugins/User+interface/Modals)：危险重置操作使用 `Modal` 确认。
- [Plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines)：避免 `innerHTML`、全局样式、未清理事件和直接修改活动文件 Frontmatter。

样式面板属于自定义 `ItemView` 内容，不使用设置页布局模拟。能由 Obsidian `ButtonComponent`、`DropdownComponent`、`ToggleComponent`、`ColorComponent` 和 `Modal` 表达的控件优先使用这些公开组件；网格和分组使用 DOM 元素及作用域 CSS。

## 3. 本期范围

### 3.1 必须交付

按照截图顺序展示：

1. 主题：经典、优雅、简洁。
2. 字体：无衬线、衬线、等宽。
3. 字号：`14px`、`15px`、`16px`、`17px`、`18px`，同一行展示。
4. 主题色：11 个预设色，三列网格。
5. 自定义色：一个可点击的颜色方块，支持选择任意标准六位十六进制颜色。
6. 标题：左侧选择 H1–H6，右侧选择该层级的标题样式。
7. 代码主题：单个全宽下拉框。
8. 图注：六个选项，两列网格。
9. 开关：Mac 样式、行号、外链转引用、首行缩进、两端对齐、字数统计。
10. 操作：红色重置按钮。

所有配置必须作用于实时预览、富文本复制和草稿发布。图片、代码、标题、链接和普通段落均纳入验收。

### 3.2 明确延后

- “探索更多主题”和主题市场。
- Doocs 文件列表、Markdown 编辑器和中间独立预览列。
- 自由 CSS 编辑器。
- 标题样式中的“自定义 CSS”。
- Alpha 透明度、RGB/HSL/HSV 格式切换；本期自定义色统一规范化为 `#RRGGBB`。
- Doocs 的移动 Web 抽屉；本项目只支持 Obsidian 桌面端。

### 3.3 保留但不在面板展示

- Vault 自定义主题继续由 `ThemeRegistry` 加载，不删除注册表能力。
- 原有全局默认样式能力继续保留在领域层，本期不在截图复刻面板展示“设为全局默认”。
- 旧 `wechat-theme-id` 和 `wechat-style` v1 文章继续可用。

## 4. UI 结构

### 4.1 面板外壳

样式按钮保持在预览工具栏右侧，按钮文字为“样式”。点击后在当前工作台右侧打开覆盖式面板：

- 面板覆盖预览右侧区域，不压缩或重新计算预览文章宽度。
- 面板根节点在打开期间只创建一次。
- 头部固定，内容区独立滚动；滚动文章预览时面板位置不动。
- 关闭样式面板不销毁文章预览。
- 面板宽度使用响应式 CSS：普通宽度约 `22rem`，宽 Leaf 可扩展到 `30rem`，不超过视图宽度。
- 面板背景、边框和文字使用 Obsidian CSS 变量；Doocs 选中边框使用插件现有绿色强调色。

结构：

```text
┌──────────────────────────────────┐
│ 文章样式                    关闭 │  固定头部
├──────────────────────────────────┤
│ 主题                             │
│ [经典] [优雅] [简洁]             │
│                                  │
│ 字体                             │
│ [无衬线] [衬线] [等宽]           │
│                                  │
│ 字号                             │
│ [14] [15] [16] [17] [18]         │
│                                  │
│ 主题色 / 自定义色                │  内容区独立滚动
│ 标题 [H2 ▼] [默认 ▼]             │
│ 代码主题 [github-dark       ▼]   │
│ 图注                             │
│ Mac 样式                    ●    │
│ 行号                        ○    │
│ 外链转引用                  ●    │
│ 首行缩进                    ○    │
│ 两端对齐                    ●    │
│ 字数统计                    ○    │
│                                  │
│ 操作                             │
│ [重置]                           │
└──────────────────────────────────┘
```

### 4.2 选项按钮

- 主题和字体使用三列等宽网格。
- 字号使用五列等宽网格，正常桌面宽度不换行。
- 主题色使用三列网格，按钮内为颜色圆点和中文名称。
- 图注使用两列网格。
- 未选中：背景、边框和文字使用 Obsidian 默认变量。
- 已选中：清晰边框和轻量背景，不使用整块高饱和绿色。
- 所有按钮保持相同高度，不因文字变化抖动。
- 每个按钮使用稳定 `data-*` 标识和 `aria-pressed`。

### 4.3 自定义色

- 使用 Obsidian `ColorComponent`，外观限定为截图中的单个颜色方块。
- 颜色变化立即触发 `patch({ primaryColor })`。
- 只接受并保存大写六位十六进制值，例如 `#0F4C81`。
- 选中预设色时颜色方块同步更新；选择自定义色时预设色按钮全部取消选中，除非值恰好匹配预设色。

### 4.4 标题双下拉

标题区域只展示一行：

- 左侧 `DropdownComponent`：`H1`–`H6`，默认选中 `H2`。
- 右侧 `DropdownComponent`：默认、主题色文字、下边框、左边框。
- 切换左侧层级只改变面板本地选择，不触发文章配置保存。
- 切换右侧样式只更新当前选中层级，例如：

```ts
patch({ headingStyles: { h2: 'border-bottom' } });
```

- 外部状态更新后，当前层级选择保持不变，右侧下拉同步显示该层级的新配置。
- 下拉控件明确设置高度、内边距和行高，文字必须完整、垂直居中，不再沿用旧六行 `<select>` 样式。

### 4.5 代码主题和图注

- 代码主题使用一个全宽 `DropdownComponent`，选项来自本地 `CodeThemeRegistry`。
- 不从 CDN 加载代码主题。
- 图注不使用下拉框，改为两列按钮：`title 优先`、`alt 优先`、`只显示 title`、`只显示 alt`、`文件名`、`不显示`。

### 4.6 开关和重置

- 六个开关逐行排列，左侧文字左对齐，右侧使用 `ToggleComponent`。
- 整行不伪装成灰色大按钮；标签区域和开关区域视觉分离。
- 点击标签或开关均可切换，键盘可聚焦。
- 重置使用 `ButtonComponent.setWarning()` 或等价的 Obsidian 警告按钮样式。
- 点击重置先打开 `Modal`，明确提示将恢复当前文章的样式默认值；确认后才执行。
- 面板不显示保存状态、校验状态、连接状态、文章名称或内部诊断。

## 5. 状态与生命周期

### 5.1 DOM 常驻

`StyleWorkbench.render()` 只负责首次挂载；之后 `update()` 只修改：

- `aria-pressed` 和按钮选中类。
- Obsidian 控件的值。
- 开关状态。
- 自定义色方块。
- 不支持版本时的必要阻断提示。

禁止在普通样式变化时调用 `destroy()`、`replaceChildren()` 或重新构造整个面板。`scrollTop`、焦点和下拉选择必须保留。

只有以下情况允许销毁：

- 用户点击关闭。
- `ItemView.onClose()`。
- 插件卸载。
- 样式面板所在容器被 Obsidian 销毁。

### 5.2 事件管理

- Obsidian 组件实例由 `StyleWorkbench` 保存并在 `destroy()` 中释放引用。
- DOM 事件使用集中清理器或 Obsidian `Component.registerDomEvent()`。
- Escape 关闭事件只注册一次。
- 不管理 WorkspaceLeaf 全局引用。
- 切换笔记时更新现有面板，不把旧笔记的防抖保存写入新笔记。

### 5.3 实时更新

```text
用户操作
  → StyleWorkbenchActions.patch()
  → patchArticleStyle()
  → 内存 previewStyleOverride
  → 防抖 StyleCompiler / RenderArtifactBuilder
  → ArticlePreviewRenderer 更新文章 DOM
  → 防抖 Frontmatter 保存
```

- 控件选中态在点击后同步更新，不等待磁盘保存。
- 新 `RenderArtifact` 完成前保留上一份稳定预览。
- 过期 generation 不得覆盖最新样式。
- 样式保存不显示 Toast 或面板内“正在保存”；失败时只显示可操作的失败提示。

## 6. 样式配置模型

新增外链转引用和字数统计后，文章配置升级为 v2：

```ts
interface ArticleStyleConfig {
  version: 2;
  themeId: string;
  fontFamily: 'sans-serif' | 'serif' | 'monospace';
  fontSize: 14 | 15 | 16 | 17 | 18;
  primaryColor: string;
  headingStyles: Readonly<Partial<Record<
    'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6',
    'default' | 'color-only' | 'border-bottom' | 'border-left'
  >>>;
  codeThemeId: string;
  showCodeLineNumbers: boolean;
  macCodeBlock: boolean;
  imageCaption: 'title-alt' | 'alt-title' | 'title' | 'alt' | 'filename' | 'none';
  externalLinkCitation: boolean;
  paragraphIndent: boolean;
  textJustify: boolean;
  wordCount: boolean;
}
```

默认值与截图一致：

- 经典主题。
- 无衬线。
- `16px`。
- 经典蓝 `#0F4C81`。
- H1–H6 为默认。
- `github-dark`。
- Mac 样式开启。
- 行号关闭。
- 图注仅 `alt`。
- 外链转引用关闭。
- 首行缩进关闭。
- 两端对齐关闭。
- 字数统计关闭。

### 6.1 兼容规则

- 读取 v1 时补充 `externalLinkCitation: false`、`wordCount: false`，得到内存中的 v2 配置。
- 用户未修改旧文章时不主动写回。
- 用户首次修改后序列化为 v2。
- v3 及更高版本仍进入“不支持版本”保护分支，禁止覆盖。
- `primaryColor` 继续严格校验 `#RRGGBB`。
- 配置序列化字段顺序固定，继续参与样式哈希和规范 HTML 确定性。

Frontmatter 新增：

```yaml
wechat-style:
  version: 2
  external-link-citation: false
  word-count: false
```

其他现有字段保持不变。

## 7. 渲染行为

文章正文图片保留主题既有的轻圆角，不添加 `box-shadow`。预览、复制和草稿发布继续消费同一份无阴影内联样式。

- 列表规范化时移除 `ol`、`ul` 的直属空白文本节点，避免公众号编辑器把标签间换行解释为空列表项。
- Mermaid 在本地生成高像素密度 PNG，并以文章内容区全宽、自适应高度展示；预览、复制和草稿发布保持相同尺寸语义。
- KaTeX 公式只保留一份可见 HTML 投影，禁止 MathML 与 HTML 分支同时显示造成公式重复。
- 已勾选的 GFM 待办项在预览、复制和草稿正文中统一显示删除线，未勾选项保持原样。
- Obsidian callout 投影为独立的图标、标题和正文节点；标题与正文分行显示。`tip` 使用浅青色提示底色，不跟随公众号主色变成绿色。

### 7.1 外链转引用

开启后：

- `mp.weixin.qq.com` 链接保持普通链接，不生成引用。
- 显示文本等于完整 URL 的裸链接不重复生成引用编号。
- 其他外链在正文链接后追加 `<sup>[n]</sup>`。
- 同一 URL 只分配一个编号。
- 文章末尾追加“引用链接”标题和按编号排列的链接列表。
- 所有节点使用 DOM API 创建，不拼接未经转义的 HTML。
- 关闭后不生成编号和文末引用区。

### 7.2 字数统计

开启后在正文最前方生成 Doocs 同语义的提示块：

```text
字数 {words}，阅读大约需 {minutes} 分钟
```

- 中日韩字符按字符计数；拉丁文本按单词计数。
- 阅读速度固定为每分钟 200 个计数单位，与 Doocs 当前实现一致。
- `minutes` 向上取整。
- 空文章不生成提示块。
- 统计源为原始 Markdown 正文，不包含插件生成的引用区、图注或统计文字本身。

### 7.3 处理顺序

`RenderArtifactBuilder` 的结构处理顺序固定为：

```text
Markdown 安全渲染
→ callout 转换
→ 提取原始 plainText
→ 字数统计投影
→ 外链引用投影
→ 图片图注投影
→ 图片/公式/Mermaid 资源提取
→ 代码高亮与窗口结构
→ 主题 CSS 内联
→ HTML 规范化和哈希
```

预览、复制和草稿发布都从该结果读取，不允许 UI 另做一套临时 HTML。

## 8. CSS 与响应式规则

- 所有面板选择器以 `.wechat-workbench__style-` 开头。
- 不覆盖全局 `select`、`button`、`input` 或 `.setting-item`。
- 宿主 UI 使用 `--background-primary`、`--background-secondary`、`--background-modifier-border`、`--text-normal`、`--text-muted`、`--interactive-accent` 等变量。
- 11 个预设色属于用户内容配置，可作为受校验的 CSS 自定义属性写入色点；布局值写入 `styles.css`，不散落在 TypeScript。
- 面板内容宽度大于等于 `20rem` 时保持 Doocs 列数；小于该宽度时允许主题色标签隐藏，但字号仍保持五列。
- 下拉框高度至少 `2.5rem`；不要同时设置冲突的固定 `height` 和同值 `line-height`。
- 面板内容区使用 `overflow-y: auto`；根节点和头部不随文章预览滚动。
- 打开样式面板后，预览画布宽度不改变；面板使用覆盖层和阴影表达层级。

## 9. 错误处理

- 不支持的配置版本：面板只读并显示升级提示。
- 自定义颜色无效：拒绝写入并保留上一个有效值，不清空预览。
- 代码主题不存在：解析时回退 `github-dark`，不发起网络请求。
- 样式编译失败：保留上一份稳定 `RenderArtifact`，提示“当前样式无法应用，已恢复上一次效果”。
- Frontmatter 保存失败：配置保留为未保存状态并允许重试，不显示持续保存动画。
- 重置取消：不改变任何状态。

## 10. 验收标准

### 10.1 UI

- 主题 3 列、字体 3 列、字号 5 列、主题色 3 列、图注 2 列。
- 自定义色可点击并实时更新。
- 标题只出现两个下拉框，不再出现 H1–H6 六行控件。
- 代码主题为全宽下拉框。
- 六个配置项全部左侧文字、右侧开关。
- 只有“重置”操作；无主题市场、全局默认按钮、保存状态、连接状态和文章名称。
- 下拉框文字完整且垂直居中。
- 连续点击任意控件 20 次，面板根节点、滚动位置和焦点不被重建。

### 10.2 渲染

- 三主题、三字体、五字号、11 个预设色和自定义色均即时生效。
- H1–H6 可分别配置，标题间距不出现异常空白。
- 代码块 1 行、2 行和多行内容行距一致，Mac 圆点与正文保持安全间距。
- 图注六种模式对本地 PNG、JPEG、远程图片占位和无 alt/title 图片均有确定结果。
- 外链引用去重、排号稳定，微信链接不被转换。
- 字数统计结果与固定 Doocs 样例一致。

### 10.3 完整链路

- 同一配置下，预览和富文本复制使用同一 `RenderArtifact.contentHash`。
- 草稿发布消费冻结的同一产物，正文包含相同标题、代码、图注、引用和统计样式。
- 本地图片、远程图片、公式和 Mermaid 不因新增投影失效。
- v1 配置可读取，修改后安全写为 v2；未知更高版本不被覆盖。

### 10.4 验证环境

- 单元测试：配置、投影、控件更新、重置。
- 黄金样例：三套 Doocs 主题。
- 视觉测试：面板关闭、顶部、标题/代码区、底部开关区，自定义色选择后状态。
- 隔离 Vault：`/tmp/wechat-workbench-checkpoint-1`。
- 真实 Obsidian：当前稳定版和最低支持版本各一次桌面冒烟。
- 真实复制：粘贴到公众号编辑器核对文本、图片和代码。
- 草稿箱：使用专用测试账号创建或更新草稿，不执行正式群发。

## 11. 交付边界

本设计完成后应产出：

- v2 样式配置与兼容迁移。
- Doocs 截图范围的 Obsidian 原生样式面板。
- 外链转引用和字数统计渲染。
- 更新后的单元、集成、黄金和视觉测试。
- 隔离 Vault 与真实 Obsidian 验证记录。

不产出主题市场、自由 CSS、Vue 运行时或第二套 Markdown 编辑器。
