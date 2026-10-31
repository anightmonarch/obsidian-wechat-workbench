# 样式面板对齐官方编辑器验收记录

## 验收范围

- 仓库：`obsidian-wechat-workbench`
- 设计：`docs/superpowers/specs/2026-09-30-style-panel-official-alignment-design.md`
- 代码状态：本地工作区实现，尚未提交（按用户要求等待本地功能验证通过后统一提交）
- 公开发布：未执行（无 `git push`、Release、插件市场提交）

## 自动化门禁

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| TypeScript 类型检查 | PASS | `npm run typecheck`（含 `tests/`，`noUncheckedIndexedAccess` 严格模式）无错误 |
| ESLint | PASS | `npm run lint`（`eslint . --max-warnings 0`）：0 error、0 warning |
| 单元与集成测试 | PASS | `npx vitest run`：106 个测试文件、622 个测试全部通过 |
| 生产构建 | PASS | `npm run build`：`tsc --noEmit` + esbuild production 成功 |
| Release 资产校验 | PASS | `npm run verify:release`：发布资产与公共契约校验通过 |
| 敏感信息扫描 | PASS | `npm run scan:secrets`：318 个文件通过 |

## 实现对照

| 需求 | 实现 | 测试证据 |
| --- | --- | --- |
| 选中态配色对齐官方（未选中白卡细边框、选中主题色边框+描边+浅染色） | `styles.css` 选项令牌重构：`--wechat-style-accent` 注入面板根，选中 = accent 边框 + `color-mix` 20% 环 + 8% 浅染色底；消除 1px→2px 的宽度跳动 | `tests/visual/workbench-visual.test.ts` 契约更新 |
| 开关行对齐官方（纯文字 + 小开关，无灰底） | `.wechat-workbench__style-switch` 透明背景、36px 行高、40×22 开关 | 视觉契约 + `style-workbench.test.ts` switch 语义 |
| 面板区块顺序与官方一致 | 主题→字体→字号→行距→段间距→链接色→引用背景→主题色→自定义色→标题→代码主题→图注→开关组→重置 | `style-workbench.test.ts` 标题顺序断言 |
| 新增行距/段间距/链接色/引用背景四组配置 | `ArticleStyleConfig` v2→v3 新增 `lineHeight`/`blockSpacing`/`linkColor`/`blockquoteBackground`；面板新增四组控件 | `style-config.test.ts`、`style-compiler.test.ts`、`style-workbench.test.ts` |
| 段间距编译期缩放（微信安全，无 `var(--`） | `StyleCompiler.scaleVerticalMargins`：主题 CSS 纵向 margin 乘以系数，`blockSpacing=1` 字节不变；编译产物无 CSS 变量 | `style-compiler.test.ts`（1.35×/0.75× 缩放断言 + `var(--` 禁用断言） |
| 链接色默认微信蓝 `#576b95`（官方默认） | 编译器按 `linkColor` 输出；黄金样例同步更新 | `style-compiler.test.ts` 三态断言；`tests/golden/doocs-*.html` |
| 全局唯一持久化（面板改动即全局默认） | `StyleResolver` 仅依据全局 `defaultStyle`，Frontmatter 覆盖退役；`WorkbenchController.applyStyleConfig` 立即 `setGlobalDefault` + 重建预览；三态保存机（pending/debounce/saving/saved/unsaved）移除 | `style-resolver.test.ts`、`style-workflow.test.ts`、`tests/integration/workbench.test.ts` |
| 每主题记忆各自配置（官方 themeSettings 语义） | `StyleWorkflow.configForTheme(themeId)` = `recentStyles[themeId] ?? 主题默认`；切主题即载入 | `style-workflow.test.ts`、集成测试 `loads the remembered theme config` |
| 发布时样式快照存档 | `executePublish` 在 `REMOTE_COMMITTED`/`LOCAL_COMMITTED` 后 best-effort 写 `wechat-style` Frontmatter，失败不影响发布结果 | 集成测试 `records the style snapshot into frontmatter after a successful publish` |
| 设置迁移 | 插件 `schemaVersion` 7→8；旧 `defaultStyle`/`recentStyles` 自动补齐 v3 字段默认值 | `settings-store.test.ts` v7→v8 升级测试 |
| 重置为红色警示 + 确认弹窗 | `wechat-workbench__style-reset--destructive` + 既有 `StyleResetModal` | `style-workbench.test.ts` |

## 桌面端到端验证（macOS 真机，2026-09-30）

方式：为隔离测试 Vault 启动独立 Obsidian 实例（独立用户配置目录 + CDP 调试端口），通过 DevTools 协议驱动真实 UI 完成交互；用户主 Vault（`commit_note`）全程未触碰。Obsidian 版本 1.13.7。

| 验证点 | 结果 | 证据 |
| --- | --- | --- |
| 插件在测试 Vault 真实加载 | PASS | 信任对话框接受后侧边栏出现"打开 WeChat Workbench"，工作台视图正常打开 |
| 设置迁移 6→8（磁盘 v6 旧数据起步） | PASS | 首次样式点击后 `data.json` 落盘 `schemaVersion: 8`、`defaultStyle.version: 3`（含 `lineHeight`/`blockSpacing`/`linkColor`/`blockquoteBackground` 默认值），`social` 字段同步补齐 |
| 面板区块顺序与官方一致 | PASS | 真实 DOM 标题序列：主题→字体→字号→行距→段间距→链接色→引用背景→主题色→自定义色→标题→代码主题→图注→操作 |
| 选中态配色（亮色） | PASS | 未选中 = 白底 `rgb(255,255,255)` + 浅灰边框；选中 = 主题色边框 `rgb(15,76,129)` + 20% 主题色描边 + 8% 浅染色底 |
| 选中态配色（暗色） | PASS | 未选中 = `rgb(28,28,28)` 深色卡 + `rgb(51,51,51)` 边框；选中项主题色边框清晰可辨 |
| Obsidian 原生按钮样式覆盖问题 | 修复 | 真机发现 `--interactive-normal` 灰色以更高优先级污染未选中按钮与重置按钮（用户截图问题的根因）；样式面板按钮规则全部加 `button` 元素限定后，重置按钮恢复红色 `rgb(233,49,71)`、开关行恢复透明背景 |
| 主题色选择即时生效 + 全局落盘 | PASS | 点击"翡翠绿"后：面板 accent 变量与所有选中框边框变绿、预览 h1/标注即时变绿、`defaultStyle.primaryColor = "#009874"` 写入磁盘 |
| 行距即时生效 | PASS | 点击 1.9 后磁盘 `lineHeight: 1.9`，预览段落 `line-height: 30.4px`（= 1.9 × 16px） |
| 段间距编译期缩放 | PASS | 点击 0.75× 后预览段落 `margin-top: 15px`（= 1.25em × 0.75 × 16px，精确命中） |
| 每主题记忆（官方 themeSettings 语义） | PASS | 切"优雅"载入其记忆配置（蓝/1.75）；切回"经典"完整恢复绿色 + 1.9 —— 记忆闭环 |
| 旧 Frontmatter 覆盖被忽略（全局唯一来源） | PASS | 测试笔记带 `wechat-theme-id: doocs-grace` + `wechat-style` v2 旧字段，预览仍按全局配置渲染 |
| 开关切即时生效 | PASS | "行号"切换后磁盘 `showCodeLineNumbers: true`，预览出现行号 |
| 重置（红色警示 + 确认弹窗） | PASS | 确认后磁盘恢复全部默认值（经典蓝/1.75/1×/关行号/微信蓝）；弹窗文案已同步改为全局语义 |
| 测试后清理 | 完成 | 测试 Vault 外观设置还原；隔离 Obsidian 实例已关闭；主实例未受影响 |

截图证据：`/tmp/e2e-05-panel-light.png`（亮色面板）、`/tmp/e2e-07-green.png`（翡翠绿联动）、`/tmp/e2e-08-panel-dark.png`（暗色面板）。

## 发布对话框与失败提示优化（2026-09-30 第二轮）

需求：同步对话框删除"主题/图片"行与橙色警告条；封面行直接渲染封面图（点击可预览大图、不显示文件名）；IP 白名单错误中的 IP 支持一键复制。

| 验证点 | 结果 | 证据 |
| --- | --- | --- |
| 对话框只保留 操作/标题/摘要/封面 | PASS | 真机 DOM：行标签序列 `["操作","标题","摘要","封面"]`，无主题/图片文本、无 `publish-warning` 橙条 |
| 封面实时渲染 | PASS | 真机 `img[data-testid="publish-cover-thumb"]` `naturalWidth > 0`（data URL 实图），文件名不再显示 |
| 封面点击预览大图 | PASS | 真机点击缩略图后 `wechat-workbench__cover-preview-modal` 打开并展示完整封面 |
| IP 一键复制 | PASS（单元） | jsdom 以真实 40164 报文渲染，`publish-copy-address` 芯片出现、点击调用 `clipboard.writeText('198.51.100.7')`、失败分支有兜底 Notice |
| 全量门禁 | PASS | 624 测试、typecheck、lint、build、verify:release 全绿 |

实现：`PublishDialogInput` 新增 `coverPath`（发布工作流传递封面 Vault 路径），视图经预览资源解析器转 data URL；失败弹窗把消息中的 IPv4 渲染为复制芯片（`navigator.clipboard` + Notice 反馈）。

## ⚠️ 事件记录：测试 Vault 的 AppID 被覆盖（需手工恢复）

在尝试端到端复现 40164（IP 白名单）时，为构造真实 token 请求，我在隔离 Obsidian 实例中通过设置界面写入了**假的 AppID**（`wxfake0000000000`）。该设置保存在测试 Vault 共享的 `data.json` 中，覆盖了原有 AppID，且本机无快照可恢复（无 git、无 Time Machine 本地快照）。

- 影响：仅测试 Vault 插件设置中的 `appId`（非密钥）；`accountHash` 随之改变，导致打开旧关联文章时提示账号不一致。
- 未受影响：笔记 Frontmatter 关联字段（已核实完好）、AppSecret（保存在你主 Obsidian 配置的 SecretStorage 中，隔离实例的写入已随配置目录删除）、公众号后台草稿。
- 恢复方式：在测试 Vault 的插件设置中重新填入正确的 AppID 并保存即可，`accountHash` 会重新计算并恢复与旧关联的匹配。
- 教训已吸取：后续任何涉及共享配置的 E2E 前先备份 `data.json`。

## 公众号保真度修复与 Mermaid 预览交互（2026-09-30 第三轮）

设计：`docs/superpowers/specs/2026-09-30-wechat-fidelity-mermaid-toggle-design.md`。方案按推荐选项执行（用户询问未答复）：预览内 Mermaid 可交互，微信内保持图片；平台限制（微信禁 JS）已写入设计文档。

| 验证点 | 结果 | 证据 |
| --- | --- | --- |
| 样式声明规范化（简写/长属性冲突修复） | PASS | `canonicalize.ts` 新增展开+层叠+去重；黄金样例与 5 个新单测；真机标注 style 为完整长属性三件套（`border-left-width/style/color`），无简写残留 |
| 代码块 Mac 圆点去绝对定位 | PASS | 编译器圆点行改为块级 flex；真机 computed `position: static`、`display: flex`，红黄绿圆点在代码区首行正常显示 |
| 代码块横向滚动（禁断词） | PASS | 根因是根节点 `overflow-wrap: anywhere` 继承进代码块；`pre > code` 补 `overflow-wrap: normal; word-break: keep-all; white-space: pre; overflow-x: auto`（提升到结构层，全部主题生效）；真机 computed 四项全部命中 |
| 独立公式居中 | PASS | `math-display` 容器内联 `text-align: center; margin: 1.25em 0`；真机 computed `textAlign: center`，截图可见公式居中 |
| Mermaid 控件不遮挡图形（用户反馈后重设计） | PASS | 控制条从悬浮改为图形上方独立一行（几何检测 `overlaps: false`，留白 22.5px），配色改为浅色描边幽灵按钮，真机截图确认“复制富文本”节点完整可见 |
| Mermaid 预览切换/复制 | PASS | 预览图右上角悬浮「查看源码 / 复制源码 / 复制图片」；真机切换互斥生效、复制源码得到完整 flowchart 文本、复制图片写入系统剪贴板（写入失败有兜底提示，焦点被抢占场景已复现并确认重试成功）；控件仅存在于预览 DOM，`canonicalHtml` 不含任何预览标记 |
| 全量门禁 | PASS | 630 测试（含 5 个规范化新测试 + Mermaid 交互测试）、typecheck、lint、build、verify:release、scan:secrets 全绿 |
| 测试环境 | 完成 | 隔离实例关闭、配置目录删除；本轮未改动任何设置（data.json 已先备份至 `/tmp/data.json.backup`，未需还原） |

截图证据：`/tmp/e2e-17-mermaid-final.png`（Mermaid 控件+流程图）、`/tmp/e2e-18-code-final.png`（圆点+代码块+居中公式）。

## 微信端代码换行/滚动修复（2026-10-01 第四轮）

用户在公众号后台实测发现：代码块行结构坍缩（两行并一行再折行）。根因：微信编辑器改写 `pre/code` 的 `white-space`，依赖 `white-space: pre` 保留的换行符全部坍缩——这是与主题/内联无关的平台行为。

| 验证点 | 结果 | 证据 |
| --- | --- | --- |
| 代码行结构显式化 | PASS | `code.ts` 统一将每行投影为 `span.code-line-block`（`display: block; white-space: pre` 经编译器 CSS 内联），行结构不再依赖任何 white-space 处理；行号模式保持 `.code-line` flex 行 |
| 横向滚动容器 | PASS | 每个 `pre` 包裹 `section.code-scroll`（`overflow-x: auto`，公众号图文已验证的横向滑动方案）；真机截图确认长行被裁切而非折行 |
| 预览复制兼容 | PASS | 预览复制按钮同时识别 `.code-line-content` 与 `.code-line-block`，跨行拼接正确（jsdom 断言） |
| 公式居中复核 | PASS | 真机 `textAlign: center`；用户截图中的左对齐来自旧构建同步结果，需用新构建重新同步核对 |
| 全量门禁 | PASS | 630 测试、typecheck、lint、build、verify:release 全绿；黄金样例已更新 |

## 关于 Mermaid 切换/复制按钮的平台结论

公众号草稿 API（addDraft）的正文白名单仅含 section/p/span/img/pre/code/br/hr/strong/em/table 等排版标签，**不含 button/svg/script**；微信文章运行时不执行任何 JavaScript。因此"可点击的按钮"（切换、一键复制）在 API 同步路径下不可能存在于微信文章中——预览中的三个按钮是预览层专属交互。微信内最接近的体验：长按图片调用微信自带菜单保存/识图；如需"源码随文发布"，可另行评估在图片下方附等宽源码文本段（当前未实现，避免未经确认改变文章内容）。

## 尚未完成的桌面门禁

- 真实微信公众号账号的发布链路验收（本轮修复的实际微信渲染效果需随下一次真实同步核对：标注圆角、代码圆点、公式居中、代码横向滚动）。
- Windows、Linux 桌面冒烟测试。
