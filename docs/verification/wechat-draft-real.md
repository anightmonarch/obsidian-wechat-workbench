# Real WeChat Draft Verification

Status: `PARTIAL` — the authorized macOS Obsidian CREATE → UPDATE → SKIP API path passed on 2026-08-20. A visual comparison in the official backend remains outstanding.

Never record AppID, AppSecret, Access Token, full media ID, private article text or unpublished screenshots here.

## Checklist

- [x] Token obtained with the current whitelisted public IP.
- [x] One local body image uploaded and replaced by an HTTPS WeChat image URL.
- [x] One 2.35:1 cover uploaded as permanent image material.
- [x] CREATE produced one backend draft without recording its media ID.
- [ ] Backend visual comparison confirms title, digest, hierarchy, links, images and cover.
- [x] UPDATE changed the same associated draft.
- [x] Unchanged rerun produced SKIP without another asset upload or draft mutation.
- [x] Account mismatch blocks before token access in automated coverage.
- [x] Missing associated remote draft blocks recreation in automated coverage.
- [x] A controlled IP allowlist error is shown without exposing credentials.
- [x] No formal publication, mass-send or deletion occurred.

## Evidence

- Obsidian `1.13.7`, macOS desktop, isolated test Vault, synthetic note only.
- The initial token rejection stopped after the account allowlist propagated; a later token request succeeded and its expiry metadata was cached.
- The first asset attempt exposed a compatibility bug: WeChat returned its approved image CDN URL with `http:`. The client now upgrades only an approved `mmbiz.qpic.cn` URL to HTTPS and continues to reject other hosts, credentials and sensitive query keys.
- CREATE and UPDATE both displayed `已同步到草稿箱`; the unchanged rerun displayed `内容未变化`.
- Local verification found two cached media records and the seven expected `wechat-*` association fields. Recovery receipts were retained without recording their values here.
- Credentials remained in Obsidian SecretStorage and were not entered into repository files, test fixtures or this record.
