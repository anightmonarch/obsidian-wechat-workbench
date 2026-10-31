# 文章样式工作台

样式工作台的配置**全局生效**：在任意文章里调整样式，改动会立即保存为插件的全局默认配置（保存在插件 `data.json` 中），之后打开任何目录下的任何文章，预览、复制和同步草稿箱都使用同一份配置。预览、复制和发布使用同一份编译后的 HTML。

## 主题

样式面板显示三套 Doocs 适配主题：经典、优雅、简洁。切换主题不会删除正文，也不会加载远程 CSS。每个主题**记住自己上次的完整配置**：切回"优雅"时，会载入你上次在优雅主题下使用的颜色、字体和排版参数。

面板区块顺序与官方 Markdown 编辑器一致：主题、字体、字号、行距、段间距、链接色、引用背景、主题色、自定义色、标题、代码主题、图注，以及一组开关（Mac 代码块、行号、外链转引用、首行缩进、两端对齐、字数统计）和重置操作。

- **行距**：1.5–2.05 五档，默认 1.75。
- **段间距**：0.75×–1.35× 五档乘数，按主题自身的节奏整体缩放块级间距，默认 1×。
- **链接色**：微信蓝（`#576b95`，官方默认）、主题色、正文色三选一。
- **引用背景**：跟随主题、无背景、主题色浅底三选一。
- **重置**：红色警示按钮，确认后把当前主题恢复为默认参数。

样式调整没有"应用"按钮，选择后立即预览并保存。

代码高亮主题随插件本地打包，不依赖 CDN。插件只使用固定的本地系统字体栈，不接受远程字体或任意 CSS。

## 发布存档

文章的 Frontmatter 不再决定渲染样式。插件在**草稿发布成功后**，把当时使用的样式快照写入文章 Frontmatter 的 `wechat-style` 字段（`wechat-theme-id` 同步更新），仅作为"这篇发布时用了什么样式"的存档记录，方便核对；它不会反向影响后续渲染。旧文章里残留的样式 Frontmatter 会被忽略，并在下次发布时被新快照覆盖。

## 自定义主题

Custom themes live under `.wechat-workbench/themes` by default:

```text
.wechat-workbench/themes/my-theme/
├── manifest.json
├── theme.css
└── preview.png        # optional
```

Example manifest:

```json
{
  "id": "my-theme",
  "name": "My theme",
  "version": "1.0.0",
  "author": "Author",
  "description": "A scoped article theme"
}
```

Theme IDs use lowercase letters, digits and hyphens. Versions use `x.y.z`.

CSS is parsed before activation. Selectors are scoped under `.wechat-article`; global selectors, pseudo-elements, at-rules, `url()`, executable values, fixed/sticky positioning and excessive z-index are rejected. A rejected custom theme does not replace a valid active version.

Changing a theme rebuilds the deterministic artifact and changes the theme/content hash used for draft update decisions.

自定义主题只能提供经过校验的文章 CSS。样式工作台的组合覆盖会在基础主题之后应用；自定义主题不需要修改插件源码。

Doocs 适配主题的来源、版本和边界见 [`THIRD_PARTY_NOTICES.md`](../../THIRD_PARTY_NOTICES.md)。
