export const WECHAT_FRONTMATTER_FIELDS = Object.freeze({
  draftId: 'wechat-draft-id',
  accountId: 'wechat-account-id',
  contentHash: 'wechat-content-hash',
  themeId: 'wechat-theme-id',
  themeVersion: 'wechat-theme-version',
  coverHash: 'wechat-cover-hash',
  syncedAt: 'wechat-synced-at',
} as const);

export const WECHAT_OWNED_FRONTMATTER_KEYS = Object.freeze(
  Object.values(WECHAT_FRONTMATTER_FIELDS),
);
