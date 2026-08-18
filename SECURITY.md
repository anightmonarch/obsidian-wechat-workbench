# Security Policy

## Supported version

Security fixes currently target the latest source revision and the latest published release after public release begins.

## Reporting a vulnerability

Use the repository's private GitHub Security Advisory channel. Do not place credentials, unpublished article content, exploit payloads, account identifiers or private draft IDs in a public issue.

Include the affected version, operating system, Obsidian version, minimal reproduction, expected/actual result and whether a remote request or draft mutation occurred. Redact AppSecret, Access Token, image API keys and full media IDs.

If private reporting is temporarily unavailable, open a public issue containing only a request for a private contact channel; do not include exploit details.

## Credential response

If a credential may have been exposed:

1. Reset the AppSecret or image-provider key at its provider.
2. Remove the old value from Obsidian SecretStorage by clearing/replacing it in plugin settings.
3. Restart Obsidian so no in-memory token remains.
4. Review the公众号后台、图片服务用量和本机日志。
5. Never commit a recovered credential or paste it into an issue.

The repository's `npm run scan:secrets` check is a release gate, not a substitute for rotation.
