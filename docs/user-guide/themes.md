# Themes

Four built-in themes ship with the plugin. Custom themes live under `.wechat-workbench/themes` by default:

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
