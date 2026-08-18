# Covers

Open an article and click `文章封面`. Available sources are:

- Current article Frontmatter cover.
- First local body image.
- Plugin-wide default Vault image.
- A manually entered Vault image path.
- Optional intelligent generation through a user-configured compatible provider.

Every source is decoded locally, rejected above 20 MiB encoded input, center-cropped without upscaling to an exact 47:20 (2.35:1) ratio and saved as a content-addressed PNG under `.wechat-workbench/covers/`.

Selecting or generating a candidate does not modify the article. The preview must be confirmed before the plugin writes the candidate Vault path to `cover` Frontmatter. An unconfirmed generated file cannot replace the currently referenced cover.

Before intelligent generation, the confirmation dialog lists provider URL, model, title, digest, body excerpt and cost warning. The body excerpt is plain text and capped at 1,500 Unicode characters. Vault path, account data and公众号 credentials are not sent.

Publishing freezes cover path, bytes and hash, then re-checks path and bytes before token access. If the cover changes, publishing stops with `COVER_CHANGED_AFTER_CONFIRMATION`.
