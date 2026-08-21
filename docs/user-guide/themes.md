# 文章样式工作台

样式工作台针对当前打开的文章生效，调整后会实时刷新右侧预览，并自动保存到当前文章的 Frontmatter。预览、复制和同步草稿箱使用同一份编译后的 HTML。

## 主题

样式面板优先显示三套 Doocs 适配主题：经典、优雅、简洁。编辑精选、原生简约、技术文档、苍绿，以及 Vault 自定义主题放在“其他主题”中。切换主题不会删除正文，也不会加载远程 CSS。

字体、字号、主题色、H1–H6 标题样式、代码高亮、图注、首行缩进、两端对齐、代码行号和 Mac 代码块都可以单独组合。

“恢复当前主题默认值”只恢复当前文章当前主题的参数；“设为全局默认”才会改变以后没有文章级样式的笔记。样式调整没有“应用”按钮，选择后立即预览。

代码高亮主题随插件本地打包，不依赖 CDN。插件只使用固定的本地系统字体栈，不接受远程字体或任意 CSS。

## 文章级配置

样式保存为两个字段：

```yaml
wechat-theme-id: doocs-classic
wechat-style:
  version: 1
  theme: doocs-classic
  font: sans-serif
  font-size: 16
  primary-color: "#0F4C81"
  headings:
    h1: default
    h2: border-bottom
  code-theme: github-dark
  code-line-numbers: false
  mac-code-block: true
  image-caption: alt
  paragraph-indent: false
  text-justify: false
```

`wechat-theme-id` 保留为基础主题回退字段。没有 `wechat-style` 的旧文章继续按原有 `wechat-theme-id` 原样渲染，不会因为打开文章而自动迁移。

如果文章来自未来版本的 `wechat-style`，插件会使用全局样式进行预览，但不会覆盖或删除未来版本字段；样式面板会提示升级插件后再修改。

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
