# 重新收录申诉邮件(已发送,2026-11-08 11:47,经 Gmail 从 anightmonarch.cool@gmail.com 发至 plugins@obsidian.md)

- 收件人:`plugins@obsidian.md`
- 抄送:无
- 主题:`Re-listing request: WeChat Workbench (removed 2026-11-07) — disclosure fixed in v0.2.1`

---

Subject: Re-listing request: WeChat Workbench (removed 2026-11-07) — disclosure fixed in v0.2.1

Hi Obsidian team,

I'm the developer of "WeChat Workbench" (id: `wechat-workbench`, repo: `anightmonarch/obsidian-wechat-workbench`), which was removed from the Community directory on 2026-11-07, right after I published v0.2.0.

I believe I understand why, and I want to fix it rather than argue:

1. v0.2.0 introduced an optional built-in relay for the WeChat Official Account API. The relay address was hardcoded (a bare IP over plain HTTP), and the bundled build contained a shared access key/secret for it.
2. Even worse, my README still claimed "No author-operated relay service" — a leftover from earlier versions that directly contradicted the code. Network use was therefore not disclosed the way your policies require.

What I changed in v0.2.1 (released today):

- Removed the built-in relay entirely. The distribution contains no relay address and no embedded credentials.
- Relay usage is now fully opt-in and user-configured: users enter their own relay base URL and credentials in the plugin settings (secret stored in Obsidian SecretStorage). The default mode connects directly to `api.weixin.qq.com` over HTTPS.
- Settings stored under the removed `public_relay` mode migrate back to the direct connection.
- README (EN + zh-CN), PRIVACY.md and SECURITY.md now disclose network usage accurately: which remote services are contacted, what data flows through a user-configured relay, and the plain-HTTP risk.
- Full test suite (629 unit/golden tests) passes; the bundled `main.js` contains no relay address or embedded credentials.

I sincerely apologize for shipping the contradictory disclosure in the first place. Could you please let me know if anything else is required, and whether the plugin can be re-listed? I'm happy to make further changes if needed.

Best regards,
anightmonarch (一宿君)
https://github.com/anightmonarch/obsidian-wechat-workbench
