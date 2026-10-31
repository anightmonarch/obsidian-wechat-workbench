# 公众号保真度修复与 Mermaid 预览交互设计

- 状态：实施中（用户未答复方案询问，按推荐方案 A 执行：预览可交互，微信内图片）
- 日期：2026-09-30
- 前置：`2026-08-18-wechat-workbench-design.md`、`2026-09-30-style-panel-official-alignment-design.md`

## 1. 背景与诊断

用户反馈同步到公众号后与插件预览存在保真度差距：

| 现象 | 根因 |
| --- | --- |
| 标注（callout）左侧圆角断成"＞"形 | 同一 `style` 属性内 `border-left-color`（长属性）与 `border-left`（简写）冲突，微信编辑器丢弃其一，边框定义残缺 |
| 代码块 Mac 圆点消失、排版乱 | 圆点使用 `position: absolute`，微信剥离绝对定位后圆点掉进行首 |
| 代码高亮主题"经常失效" | 同类层叠冲突问题（声明残缺）+ 圆点破坏布局；高亮颜色本身已是内联样式 |
| 独立公式靠左 | `math-display` 外层容器缺 `text-align: center` |
| 代码块长行换行、无复制按钮 | 微信阅读器强制换行（`white-space: pre` 已内联，平台行为）；微信文章禁用一切 JavaScript，真复制按钮在微信内不可能实现（预览内按钮保留） |

平台结论（写入用户文档）：微信内无法实现任何需要 JavaScript 的交互（复制按钮、真切换）；图片的"复制/保存"由微信自带长按菜单提供。

## 2. 方案

### 2.1 样式声明规范化（修复层叠冲突类问题）

在渲染产物规范化阶段（canonicalize）把每个 `style` 属性解析为声明序列，**展开简写为长属性、按出现顺序应用层叠、去重**后仅输出终值长属性。例如 `border-left-color: A; border-left: 4px solid B` 输出 `border-left-width: 4px; border-left-style: solid; border-left-color: B`。任何消费者（微信/浏览器）都无法再拿到残缺定义。

- 展开范围：`border`、`border-left/right/top/bottom`、`margin`、`padding`、`background`（保守：仅展开存在后续长属性覆盖风险的组合；`background` 展开为 color/image/repeat/position/size 需谨慎，仅当同属性流中同时出现 `background` 与 `background-*` 长属性时才展开该流）。
- 不改变视觉结果（层叠语义等价），产物内容哈希变化属预期。

### 2.2 代码块 Mac 圆点去绝对定位

`macCodeBlock` 结构从「`pre` 相对定位 + 圆点绝对定位悬浮 + `code` 顶部大 padding」改为「`code` 内首行块级圆点行」：

```html
<pre class="code-window"><code style="...; padding: 2.25em 1em 1em">
<span class="code-window-dots" style="display: block; height: 0.55em; left→margin-left: 0.9em; margin-bottom: 0.6em; position: static">…三个圆点…</span>
<code 内容…></code></pre>
```

- 圆点行 `display: block` + `margin` 定位，不依赖 `position`；`pre` 去掉 `position: relative`；`code` 的 padding-top 缩小（圆点行占据原空间，视觉等价：需要把 code 的 padding-top 从 2.25em 调整为 1em 并由圆点行 margin 提供间距，或保留 2.25em 由圆点行绝对高度补齐——取实现后黄金样例视觉核对为准）。
- 预览 CSS（styles.css 中 `.code-window-dots` 相关若存在）同步调整；微信产物只依赖内联样式。

### 2.3 独立公式居中

`math.ts` 渲染 display 公式时，外层 `div.math-display` 内联 `text-align: center`（连同现有 projection 样式），微信与预览一致居中。

### 2.4 Mermaid 预览交互（微信内保持图片）

工作台预览层（`render-preview`）对 Mermaid 产物图增强，不影响 `RenderArtifact` 与同步内容：

- 预览渲染时识别 `img[data-asset-kind="generated-diagram"]`（产物 HTML 中图表图与数学式同样携带 asset 标记；如缺失则补上），用 `data-asset-id` 从 artifact.assets 取回 Mermaid 源码。
- 图表容器右上角悬浮控制条（预览专属 DOM，不进产物）：`源码 | 图片` 切换 + `复制源码` + `复制图片`。
- 复制源码：`navigator.clipboard.writeText(源码)`；复制图片：data URL → blob → `navigator.clipboard.write([ClipboardItem])`，失败回退 Notice。
- 微信同步产物保持现状（Mermaid 图片），长按图片由微信自带菜单保存。

### 2.5 明确不做

- 微信内复制按钮 / SMIL 点击切换（平台禁 JS，技术不可行或高失效风险）。
- 阻止微信阅读器对超长代码行强制换行（平台行为）。
- KaTeX 全量内联（间距类样式为 class 依赖，全量内联是独立大工程，另行立项）。

## 3. 测试计划（TDD）

- canonicalize：简写+长属性冲突流 → 去重长属性输出；无冲突流保持原语义。
- compiler/黄金样例：圆点行结构更新（无 `position: absolute`），视觉等价核对。
- math：display 公式容器含 `text-align: center`。
- render-preview：Mermaid 图容器出现切换/复制控件，源码切换与复制动作可用（jsdom + mock clipboard）。
- 黄金样例更新（内容哈希变化属预期）。
