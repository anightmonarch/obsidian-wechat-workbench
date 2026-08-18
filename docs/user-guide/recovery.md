# Draft Recovery

WeChat Workbench treats a draft sync as a transaction:

1. Freeze and preflight the article and cover.
2. Obtain a token and inspect an existing association.
3. Upload body images and cover.
4. Create or update the remote draft.
5. Persist a recovery receipt.
6. Update article Frontmatter.

If the remote create/update times out, the result is `AMBIGUOUS`. The plugin never automatically retries this stage because a retry could create a duplicate draft. Use `对账草稿箱`; a unique content/time match repairs the association. Multiple matches require manual confirmation.

If the remote draft succeeded but local Frontmatter failed, the result is `REMOTE_COMMITTED`. Use `修复本地关联`; do not publish again.

`解除草稿关联` deletes only the plugin-owned local `wechat-*` association fields. It never deletes the公众号后台草稿. After unlinking, a later publish is an explicit new CREATE.

Account mismatch and missing associated drafts are blocking states. Switch to the correct account or explicitly unlink only after checking the公众号后台。
