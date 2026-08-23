# WeChat API IP Whitelist

The公众号 API validates the public source IP used by the computer running Obsidian. The Vault's local IP such as `192.168.x.x` is not the value to enter.

## Configure

1. Sign in to the corresponding公众号后台。
2. Open the development/basic configuration page that shows AppID and AppSecret.
3. Find the API IP whitelist setting.
4. Return to Obsidian settings, save AppID/AppSecret locally, then perform a connection test.
5. If WeChat returns the public egress IP, copy the displayed value into the whitelist and save it in the公众号后台.
6. Run the connection test again.

The plugin does not call a third-party IP lookup service. It only displays an IP when it is returned by the WeChat verification response, so no AppSecret is sent to an IP-check website.

Do not paste AppSecret into a screenshot, issue or article.

## Changes that invalidate the whitelist

- Switching Wi-Fi, hotspot, office/home network or cloud desktop.
- Enabling/disabling VPN, proxy, TUN mode or enterprise gateway.
- ISP dynamic-IP rotation.
- Moving Obsidian to another computer whose traffic exits elsewhere.

If token acquisition reports an IP whitelist error, first compare the current public egress IP with the backend entry. Do not repeatedly reset AppSecret for an IP mismatch.

## Secret reset and local clearing

If AppSecret is reset in the公众号后台, immediately replace it in plugin settings. Changing AppID clears the cached Access Token. To remove local credentials completely, clear/replace the SecretStorage values and restart Obsidian.

The plugin never needs an author-operated relay server; every account owner maintains their own AppID, AppSecret and whitelist.
