# WeChat API IP Whitelist

The公众号 API validates the public source IP used by the computer running Obsidian. The Vault's local IP such as `192.168.x.x` is not the value to enter.

## Configure

1. Sign in to the corresponding公众号后台。
2. Open the development/basic configuration page that shows AppID and AppSecret.
3. Find the API IP whitelist setting.
4. Determine the current public egress IPv4 from the same network, VPN and proxy state that Obsidian will use. Compare at least two trusted IP-check services or your router/enterprise gateway record.
5. Add the exact public IPv4 and save.
6. Return to Obsidian settings, save AppID/AppSecret locally, then perform a draft connection test.

Do not paste AppSecret into an IP-check website, screenshot, issue or article.

## Changes that invalidate the whitelist

- Switching Wi-Fi, hotspot, office/home network or cloud desktop.
- Enabling/disabling VPN, proxy, TUN mode or enterprise gateway.
- ISP dynamic-IP rotation.
- Moving Obsidian to another computer whose traffic exits elsewhere.

If token acquisition reports an IP whitelist error, first compare the current public egress IP with the backend entry. Do not repeatedly reset AppSecret for an IP mismatch.

## Secret reset and local clearing

If AppSecret is reset in the公众号后台, immediately replace it in plugin settings. Changing AppID clears the cached Access Token. To remove local credentials completely, clear/replace the SecretStorage values and restart Obsidian.

The plugin never needs an author-operated relay server; every account owner maintains their own AppID, AppSecret and whitelist.
