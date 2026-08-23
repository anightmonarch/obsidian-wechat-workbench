# Covers

Open an article and click `文章封面`. The picker exposes exactly three sources:

- `文章首图（默认）`: use the first usable image in the article body. This is a preview-time default and does not write a new `cover` field by itself.
- `上传本地图片`: open the native file picker, import the selected image into the Vault-owned cover directory, then preview and confirm it.
- `智能生成封面`: generate a candidate through the configured image service after the provider, model, content sent and possible cost are disclosed.

Every source is decoded locally, rejected above 20 MiB encoded input, center-cropped without upscaling to an exact 47:20 (2.35:1) ratio and saved as a content-addressed PNG under `.wechat-workbench/covers/`.

Selecting or generating a candidate does not modify the article. The preview must be confirmed before the plugin writes a locally owned candidate Vault path to `cover` Frontmatter. The first-image default is rendered from the current article and is not persisted unless the user explicitly confirms it as the cover. An unconfirmed generated file cannot replace the currently referenced cover.

Before intelligent generation, the confirmation dialog lists provider URL, model, title, digest, body excerpt and cost warning. The body excerpt is plain text and capped at 1,500 Unicode characters. Vault path, account data and公众号 credentials are not sent.

Publishing freezes cover path, bytes and hash, then re-checks path and bytes before token access. If the cover changes, publishing stops with `COVER_CHANGED_AFTER_CONFIRMATION`.
