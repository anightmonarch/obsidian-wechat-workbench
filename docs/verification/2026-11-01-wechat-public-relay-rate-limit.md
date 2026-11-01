# Public WeChat API relay — IP + AppID rate limit evidence

**Date (Asia/Shanghai):** 2026-11-01  
**Host:** `121.196.229.165:18080`  
**Stack:** nginx/1.26.3 (`/usr/local/nginx`) + local Python 3.6 AppID hop on `127.0.0.1:18081`

## Auth (unchanged, fail closed)

- Missing/invalid `X-WeChat-Proxy-Key` / `X-WeChat-Proxy-Secret` → **401**
- Credentials map: `/usr/local/nginx/wechat-api-relay.credentials.map` (mode 600)
- Confirmed after reload: unauthenticated `GET /cgi-bin/token` → 401 JSON `unauthorized wechat api relay`

## Rate limits (ops-owned)

| Dimension | Mechanism | Threshold | HTTP on breach |
| --- | --- | --- | --- |
| Client IP | nginx `limit_req_zone $binary_remote_addr zone=wx_proxy_ip:10m rate=30r/m` + `burst=20 nodelay` | 30 req/min (burst 20) | **429** (`limit_req_status 429`) |
| AppID | `wechat-appid-ratelimit.service` → `/opt/wechat-api-relay/wechat_appid_ratelimit_proxy.py` | 60 req/min per AppID (env `WECHAT_APPID_RATE_PER_MIN`) | **429** JSON `rate limit exceeded (appid)` |

AppID is parsed from query `appid=` or JSON body field `appid` (covers `cgi-bin/stable_token`). Calls without AppID skip the AppID counter (IP limit still applies at nginx).

## Verification runs (no secrets recorded)

1. **Unauth burst (40):** all **401**
2. **Authenticated IP burst (80) from client:** `{200: 23, 429: 57}` — IP zone engaged
3. **Local AppID hop POST stable_token synthetic appid (80):** `{200: 60, 429: 20}` — first 429 body `rate limit exceeded (appid)`; edge still 401 without headers

## Files on host

- `/usr/local/nginx/wechat-api-relay.conf` (backed up as `*.bak.<timestamp>`)
- `/opt/wechat-api-relay/wechat_appid_ratelimit_proxy.py`
- `/etc/systemd/system/wechat-appid-ratelimit.service` (enabled)

## Notes

- This nginx build has **no Lua/njs**; AppID body parsing required the local Python hop.
- Shared plugin-embedded AK/SK remain extractable; rate limit + monitoring are the real controls.
- No Access Key / Secret values are stored in this note.
