# WeChat Workbench 组合式样式工作台设计

- 状态：待用户书面审阅
- 日期：2026-08-21
- 适用版本：`0.2.x`
- 参考项目：[`doocs/md`](https://github.com/doocs/md)，固定参考提交 `fd136f79f84cf8f9c6206ef864fb318b16390171`
- 参考许可证：WTFPL；复用或适配的第三方内容必须记录来源，发布前单独完成依赖与素材许可证审计

## 1. 结论

WeChat Workbench 一期新增“组合式样式工作台”，目标是在 Obsidian 内复现 Doocs Markdown Editor 的样式排版组合能力和主要视觉效果，而不是嵌入或重做 Doocs 整个编辑器。

正文继续由 Obsidian Markdown 编辑器管理。插件复用现有右侧 `ItemView`、实时预览、复制和公众号草稿发布链路，只移植以下样式能力：

- 经典、优雅、简洁三套基础主题。
- 字体、字号、主题色、标题、代码、图注和段落设置。
- 用户调整后的文章级持久化与显式全局默认。
- 所有设置对预览即时生效，并由同一个不可变 `RenderArtifact` 服务复制和草稿发布。

一期不提供自由 CSS 编辑器，不引入 Vue、Pinia、CodeMirror，不复制 Doocs 的文件管理、图床、AI、主题市场、分享或导出功能。

## 2. 设计依据

### 2.1 当前项目基础

当前代码已具备以下可复用能力：

- `ThemeRegistry` 统一加载内置主题与 Vault 自定义主题包。
- `ThemeValidator` 将主题限制在 `.wechat-article`，并阻止全局选择器、外部资源和危险 CSS。
- `RenderArtifactBuilder` 使用 `juice` 把主题 CSS 转成公众号可用的行内样式。
- `NoteSnapshotService` 已支持从 `wechat-theme-id` 读取文章主题。
- 现有编辑精选、原生简约、技术文档、苍绿及 Vault 自定义主题已经构成公开兼容面，不能因新增样式工作台而消失。
- 预览、复制和草稿发布共享同一个不可变渲染产物。

当前缺口：

- 四套内置主题只有少量静态规则，不能组合字体、字号、颜色等参数。
- 主题切换只写入 `WorkbenchController` 内存覆盖，未持久化到文章。
- 现有主题菜单不能承载组合式样式编辑。
- 当前渲染 HTML 的类名和 Doocs 不一致，Doocs CSS 不能原样复制后直接生效。

### 2.2 Doocs 可复用边界

Doocs 样式系统由基础 CSS、主题 CSS、动态变量、标题覆盖和用户 CSS 分层合并。其高可用性主要来自组合能力，而不是主题数量。

本项目只适配其公开的样式表面和主题视觉：

- `default`、`grace`、`simple` 基础主题。
- 三组系统字体栈、五档字号、十一种预设色和自定义色。
- H1–H6 标题样式、代码主题、代码行号、Mac 代码块、图片图注、首行缩进和两端对齐。

不得直接复制后运行 Doocs 的 Web 应用。不得在被动预览阶段请求 Doocs 使用的远程代码主题 CDN；一期需要的代码主题 CSS 必须随插件本地打包。

## 3. 产品范围

### 3.1 一期必须交付

- 经典、优雅、简洁三套经过本项目 HTML 结构适配的内置主题。
- 现有四套内置主题和 Vault 自定义主题继续可选；三套 Doocs 主题作为组合式样式工作台的主入口。
- 无衬线、衬线、等宽三种字体。
- `14px`、`15px`、`16px`、`17px`、`18px` 五档字号。
- 经典蓝、翡翠绿、活力橘、柠檬黄、薰衣紫、天空蓝、玫瑰金、橄榄绿、石墨黑、雾烟灰、樱花粉及自定义颜色。
- H1–H6 分级标题配置：默认、主题色文字、下边框、左边框。
- 与 Doocs 同名的代码主题选择；资源全部本地打包。
- 代码行号和 Mac 窗口样式。
- 图片图注：`title` 优先、`alt` 优先、仅 `title`、仅 `alt`、文件名、不显示。
- 首行缩进和两端对齐。
- 实时预览、文章级自动保存、恢复主题默认值和设为全局默认。
- 旧 `wechat-theme-id` 兼容迁移。
- 真实公众号编辑器复制核对和草稿箱发布核对。

### 3.2 明确不做

- 不嵌入 Doocs CodeMirror 编辑器，不维护第二份正文状态。
- 不实现 Doocs 文件列表、版本管理、文件夹、同步和云存储。
- 不实现图床管理、AI 助手、模板、主题市场、分享页、PDF 或图片导出。
- 不开放任意 CSS 文本编辑器。
- 不自动抓取任意公众号文章并将其样式声明为系统内置主题。
- 不改变公众号凭据、封面、复制、草稿事务或恢复协议。
- 不执行公众号正式群发。

## 4. 样式领域模型

### 4.1 基础主题

```ts
type ComposableBuiltinThemeId = 'doocs-classic' | 'doocs-grace' | 'doocs-simple';

interface BaseThemeDefinition {
  id: string;
  name: string;
  version: string;
  css: string;
  source: 'builtin' | 'vault';
  composable: boolean;
}
```

三套 Doocs 主题标记为 `composable: true` 并作为主入口。现有四套内置主题与通过校验的 Vault 自定义主题继续进入同一注册表；组合覆盖层可以应用于这些主题，但 Doocs 视觉一致性的验收只针对三套 Doocs 主题。

基础主题只表达稳定的结构样式，不直接保存某篇文章的字体、字号和颜色选择。主题 CSS 必须使用本项目支持的语义元素和类名，例如 `.wechat-article`、`.callout`、`.hljs` 和图注结构。

### 4.2 用户样式配置

```ts
interface ArticleStyleConfig {
  version: 1;
  themeId: string;
  fontFamily: 'sans-serif' | 'serif' | 'monospace';
  fontSize: 14 | 15 | 16 | 17 | 18;
  primaryColor: string;
  headingStyles: Partial<Record<'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6',
    'default' | 'color-only' | 'border-bottom' | 'border-left'>>;
  codeThemeId: string;
  showCodeLineNumbers: boolean;
  macCodeBlock: boolean;
  imageCaption: 'title-alt' | 'alt-title' | 'title' | 'alt' | 'filename' | 'none';
  paragraphIndent: boolean;
  textJustify: boolean;
}
```

所有枚举均使用稳定 ID；UI 只显示中文名称。`primaryColor` 一期只接受标准六位十六进制颜色。字体只能从本地系统字体栈中选择，代码主题只能从本地允许列表中选择。

### 4.3 编译主题

```ts
interface CompiledTheme {
  baseThemeId: string;
  baseThemeVersion: string;
  config: Readonly<ArticleStyleConfig>;
  css: string;
  contentHash: string;
}
```

`StyleCompiler` 将基础主题和用户配置编译为不依赖运行时 CSS 变量的确定性 CSS。相同基础主题版本和规范化配置必须得到字节一致的 CSS 与 `contentHash`。

`CompiledTheme` 适配现有 `ThemeDefinition`/`RenderArtifactBuilder` 契约。最终仍由 `juice` 生成行内样式，不能把 `:root`、外部 `url()`、远程字体或未解析的主题变量带入公众号正文。

## 5. 配置优先级与持久化

### 5.1 优先级

从高到低：

1. 当前文章 `wechat-style` 完整配置。
2. 没有 `wechat-style` 的旧文章继续按 `wechat-theme-id` 对应主题原样渲染，不自动叠加新样式或改写 Frontmatter。
3. 插件全局默认样式。
4. 内置经典主题默认值。

### 5.2 文章 Frontmatter

```yaml
wechat-style:
  version: 1
  theme: doocs-classic
  font: sans-serif
  font-size: 16
  primary-color: "#0F4C81"
  headings:
    h1: default
    h2: border-bottom
  code-theme: github
  code-line-numbers: false
  mac-code-block: true
  image-caption: alt
  paragraph-indent: false
  text-justify: false
```

规则：

- 保存完整规范化配置，不保存编译后 CSS、HTML 或哈希。
- `wechat-style` 存在且版本有效时优先读取。
- 没有 `wechat-style` 时兼容读取 `wechat-theme-id`。
- 用户首次调整老文章或选择组合主题后才创建 `wechat-style`，不能仅因打开文章而静默迁移。
- 写入新配置时同步维护 `wechat-theme-id` 为基础主题 ID，作为当前主题注册表的回退字段；旧插件不认识新增主题 ID 时仍可能回退到其默认主题，不承诺新主题向旧版本反向兼容。
- 未知字段原样保留；不改写或删除用户其他 Frontmatter 字段。
- Frontmatter 写入必须绑定开始操作时的文件路径和修改上下文，不能把旧面板配置写入新打开的文章。

### 5.3 全局设置

插件 `data.json` 保存：

- 全局默认 `ArticleStyleConfig`。
- 每个基础主题最近一次使用的参数。
- 样式数据 schema 版本。

样式面板调整默认只影响当前文章。只有用户点击 `设为全局默认` 才更新全局默认。切换基础主题时恢复该主题最近使用的参数，但只有当前激活主题的完整配置写入文章。

### 5.4 自动保存

- 样式变化立即更新内存配置并触发预览。
- Frontmatter 写入使用防抖合并，避免每次点击都产生磁盘写入和重复渲染。
- 切换活动文件、关闭工作台或插件卸载前刷新待保存配置。
- 规范化配置与已保存配置相同时不写文件。
- 插件自身写入触发 Vault `modify` 事件时必须去重，不能形成重建或保存循环。
- 保存失败不回滚已成功渲染的预览，但必须标记未保存并允许安全重试。

## 6. 渲染与数据流

```text
Obsidian Markdown
        ↓
NoteSnapshotService
        ↓
StyleConfigResolver ← Frontmatter / global defaults / built-in defaults
        ↓
StyleCompiler ← BaseThemeRegistry / local code themes
        ↓
CompiledTheme
        ↓
RenderArtifactBuilder
        ↓
RenderArtifact
   ├── ArticlePreviewRenderer
   ├── ClipboardService
   └── PublishCoordinator
```

### 6.1 实时更新

- 样式控件变化后立即更新面板选中状态。
- 连续变化合并为一次待执行编译，不并行堆积完整文章渲染。
- 新渲染完成前保留上一份稳定预览，不清空文章画布。
- 每个构建带单调递增 generation；过期结果不能覆盖更新配置后的结果。
- 样式更新不重新读取不相关的公众号账号、封面或草稿状态。

### 6.2 确定性与发布冻结

- 样式配置先规范化，再参与 `CompiledTheme.contentHash`。
- `RenderArtifact.theme` 记录基础主题 ID、版本和编译主题哈希。
- 复制和发布只能消费当前成功构建的 `RenderArtifact`。
- 发布开始后冻结本次 `RenderArtifact`；用户继续调整样式只影响下一次操作。
- 相同文章、资源、渲染器版本和样式配置必须产生相同规范 HTML 与内容哈希。

### 6.3 Doocs CSS 适配

适配过程：

1. 从固定 Doocs 提交读取基础主题规则。
2. 只保留本项目渲染结构能够表达的语义。
3. 将 `#output`、Doocs 专有类名映射到 `.wechat-article` 及本项目现有类名。
4. 将字体、字号、主题色和标题选项编译为具体 CSS 值。
5. 移除远程资源、浏览器交互样式和公众号不支持的规则。
6. 通过现有主题安全校验、HTML 清洗和黄金样例测试。

“视觉一致”不等于原样复制 CSS。必须以公众号编辑器最终保留的行内样式为准。

## 7. 样式工作台 UI

### 7.1 入口

现有预览页工具栏变为：

```text
[发文章] [复制] [样式]
```

`样式` 取代当前简单主题菜单。发布设置页继续隐藏预览工具栏和连接状态行。

### 7.2 宽屏布局

```text
┌──────────────实时文章预览──────────────┬──────样式设置──────┐
│                                       │ 主题               │
│ 当前稳定 RenderArtifact               │ 经典 / 优雅 / 简洁 │
│                                       │ 字体 / 字号 / 主色 │
│ 设置变化后自动更新                     │ 标题 / 代码        │
│                                       │ 图注 / 段落        │
└───────────────────────────────────────┴────────────────────┘
```

- 工作台宽度足够时，预览与样式设置并排显示。
- 预览占据剩余空间，样式面板保持适合点击的最小宽度。
- 用户拖动 Obsidian leaf 宽度时布局自动响应，不依赖私有 Workspace API。

### 7.3 窄屏布局

- 样式设置以右侧覆盖面板打开，不把预览和设置强压成两个不可用窄栏。
- 覆盖面板可通过关闭按钮和 Escape 关闭。
- 关闭后立即显示当前配置对应的完整预览。
- 面板滚动不影响底层文章滚动位置。

### 7.4 控件顺序

固定顺序：

1. 主题。
2. 字体。
3. 字号。
4. 主题色。
5. 标题。
6. 代码。
7. 图注。
8. 段落。
9. 恢复当前主题默认值与设为全局默认。

主题区优先展示经典、优雅、简洁，现有内置主题和 Vault 自定义主题放入“其他主题”；不得隐藏用户已经使用的主题。主题、字体、字号和预设色使用紧凑按钮组；标题、代码和图注使用 Obsidian 原生下拉或菜单语义；布尔设置使用原生开关。自定义颜色使用 Obsidian 支持的颜色输入，不显示原始 CSS。

### 7.5 交互原则

- 不提供“应用”或“保存”按钮；有效修改即时预览并自动保存。
- `恢复当前主题默认值` 只重置当前文章当前主题参数，需要确认后执行。
- `设为全局默认` 显式更新全局默认，不修改其他文章已有的 `wechat-style`。
- 切换主题后恢复该主题最近使用的参数。
- 不展示 CSS、配置哈希、内部 ID、英文诊断、渲染 generation 或发布检查。
- 控件有中文标签、键盘焦点、`aria-label`、选中状态和禁用状态。
- 插件外壳使用 Obsidian CSS 变量；文章主题样式继续与外壳隔离。

## 8. 异常处理

### 8.1 配置异常

- 非法自定义颜色：不提交新值，恢复上一个有效颜色。
- 未知枚举或缺失字段：只对该字段使用默认值，其余有效配置继续生效。
- 未知代码主题：回退本地默认代码主题。
- 不支持的未来 schema：保留原始 Frontmatter，不覆盖；使用全局默认预览并提示升级插件。

### 8.2 编译与渲染异常

- 样式编译失败：保留最后一次成功预览，提示“当前样式无法应用，已恢复上一次效果”。
- 新配置构建失败：不得把失败产物暴露给复制或发布。
- 单个 Doocs 选择器无法适配：在开发期测试中报告；运行时不向用户展示 CSS 细节。
- 本地代码主题资源缺失：回退默认主题并记录已脱敏开发日志。

### 8.3 保存异常

- Frontmatter 保存失败：保留内存预览，显示“样式尚未保存”，提供重试。
- 保存期间切换文章：写入必须仍绑定原文章；上下文失效时取消，不写入新文章。
- 插件关闭前刷新失败：不得阻止 Obsidian 关闭；下次打开按磁盘最后成功配置恢复。

用户界面不展示堆栈、CSS 解析错误、哈希或英文校验文本。内部错误继续保留稳定错误码，便于测试和排查。

## 9. 安全、隐私与许可证

- 样式工作台完全本地运行，不新增网络请求、遥测或作者托管服务。
- 自定义色、枚举和主题资源都必须经过允许列表或格式校验。
- 不允许用户样式注入 JavaScript、`@import`、外部 `url()`、全局选择器或危险定位。
- 代码主题随插件打包，不在预览时访问 Doocs CDN。
- 不把文章正文、样式配置或公众号凭据发送给 Doocs。
- AppID、AppSecret、Access Token 和图片生成凭据的现有本地存储边界不变。
- 新增 `THIRD_PARTY_NOTICES.md` 或等价说明，记录 Doocs 固定提交、WTFPL 许可证和保留的主题作者信息。
- 正式发布前审计所有实际打包的代码主题、字体声明、素材和依赖许可证。

## 10. 测试与验收

### 10.1 单元测试

- `StyleConfigResolver` 的四级优先级和逐字段回退。
- `StyleCompiler` 对全部基础主题和每个配置维度的输出。
- 相同输入的 CSS 与哈希确定性。
- 自定义颜色、未知枚举、缺失字段和未来 schema。
- Doocs 选择器到本项目结构的映射。
- 代码主题本地允许列表与资源完整性。
- Frontmatter 序列化、兼容读取和未知字段保留。

### 10.2 集成测试

- 旧 `wechat-theme-id` 文章能够按原主题预览；只打开或编辑正文不会产生 `wechat-style`。
- 用户首次调整样式后才写入 `wechat-style`，且现有四套内置主题和 Vault 自定义主题仍可选择。
- 调整当前文章、切换文件、重新打开后恢复相同配置。
- `设为全局默认` 只影响无文章级配置的文章。
- 三个基础主题分别保留最近参数。
- 快速连续修改时只有最新 generation 生效。
- 插件自身 Frontmatter 写入不会形成保存循环。
- 保存失败后预览可用且能够安全重试。
- 复制和草稿发布消费与当前预览相同的主题哈希和内容哈希。
- 发布期间继续改样式不会改变已冻结命令。

### 10.3 黄金样例

建立一篇覆盖以下元素的固定文章：

- H1–H6。
- 普通段落、粗体、斜体、链接和行内代码。
- 有序列表、无序列表和嵌套列表。
- 引用和 Obsidian callout。
- 代码块、表格和分割线。
- 本地图片、远程图片占位和六种图注输入。
- 数学公式和 Mermaid 占位/生成资源。

经典、优雅、简洁分别生成规范 HTML 黄金文件。任何黄金文件更新必须解释对应设计变化，不能为通过测试无条件覆盖快照。

### 10.4 视觉验收

- 同一篇黄金文章、相同设置分别在固定提交的 Doocs 和本插件中截图。
- 逐项核对标题、段落、引用、列表、代码、表格、图片、图注和分割线。
- 在宽屏并排和窄屏覆盖模式下验证无横向溢出、遮挡和不可点击控件。
- 检查浅色、深色 Obsidian 外壳；公众号文章画布保持发布语义。
- 复制到真实公众号编辑器并截图核对最终保留样式。
- 在专用测试公众号创建草稿并核对后台最终排版，不执行正式群发。
- macOS 完成全链路；Windows、Linux 至少验证布局、系统字体和本地代码主题。

### 10.5 工程门槛

- 生产行为先写失败测试，再写最小实现。
- 运行单元、集成、黄金、视觉契约和对抗性测试。
- 运行 TypeScript 类型检查、lint、构建、发布资产校验、依赖审计和敏感信息扫描。
- 在隔离测试 Vault 安装，不加载到 `commit_note` 主 Vault。
- 验证证据写入 `docs/verification/`。

## 11. 模块边界与预计改动面

新增或拆分职责：

- `src/styles/style-config.ts`：样式配置类型、默认值和规范化。
- `src/styles/style-config-resolver.ts`：文章、旧主题和全局默认优先级。
- `src/styles/style-compiler.ts`：基础主题与参数编译。
- `src/styles/code-theme-registry.ts`：本地代码主题允许列表和 CSS。
- `src/styles/style-state-store.ts`：文章级与全局样式持久化协调。
- `src/ui/style-workbench.ts`：样式面板 DOM 与交互，不承载编译逻辑。

需要调整：

- `src/domain/theme.ts`：表达编译主题元数据。
- `src/themes/builtin/`：加入三套适配主题并保留来源。
- `src/render/note-snapshot-service.ts`：读取 `wechat-style` 与旧字段回退。
- `src/render/artifact-builder.ts`：接收编译主题，但不承担配置解析。
- `src/settings/model.ts` 与 `settings-store.ts`：增加 schema 迁移、全局默认和每主题最近参数。
- `src/ui/workbench-controller.ts`：管理样式 generation、自动保存和当前稳定产物。
- `src/ui/workbench-view.ts`：把简单主题菜单替换为样式工作台入口和响应式容器。
- `styles.css`：增加样式面板外壳，不把文章主题写入插件全局 CSS。

不得把样式编译、Frontmatter 写入、渲染、复制和发布重新混入一个 UI 文件。

## 12. 实施顺序

1. 建立样式配置类型、默认值、规范化和迁移测试。
2. 适配经典、优雅、简洁主题，建立编译器和黄金 HTML。
3. 打包本地代码主题并补齐代码、图注和段落渲染结构。
4. 实现文章级持久化、全局默认和旧主题迁移。
5. 接入 WorkbenchController，保证 generation、最后稳定预览和发布冻结。
6. 实现样式工作台宽屏并排和窄屏覆盖 UI。
7. 完成自动测试、真实 Obsidian 视觉测试、公众号复制和草稿核对。
8. 完成第三方许可证、依赖、安全和发布资产审计。

## 13. 完成定义

只有同时满足以下条件，一期才算完成：

- 用户能在 Obsidian 中组合调整全部一期样式项，并即时看到稳定预览。
- 关闭并重新打开文章后，文章样式完整恢复。
- 用户能显式设为全局默认，且既有文章不会被意外改版。
- 三套基础主题在标准文章上的主要排版效果与固定 Doocs 参考提交一致。
- 预览、复制和草稿发布使用同一个样式哈希和内容产物。
- 无被动远程样式请求、凭据泄漏或不安全 CSS 注入。
- 所有工程门槛和真实桌面/公众号验收有可核查证据。
