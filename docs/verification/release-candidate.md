# Release Candidate Verification

Version: `0.1.0`

## Automated

| Check | Status |
| --- | --- |
| Unit/integration/adversarial tests | PASS locally, 90 files / 495 tests on 2026-08-27 |
| ESLint | PASS locally with `--max-warnings 0` |
| TypeScript | PASS locally |
| TypeScript against minimum Obsidian API `1.11.4` | PASS in an isolated clean checkout |
| Production bundle | PASS locally |
| Release asset and public-doc verifier | PASS locally |
| Sensitive information scan | PASS locally |
| Clean `npm ci` install | PASS locally |
| `npm audit --omit=dev` | PASS, 0 production vulnerabilities |

## Environment matrix

| Environment | Status | Evidence |
| --- | --- | --- |
| macOS, installed test Vault | PASS | On 2026-08-27 the current build was synced to the isolated Vault; `main.js`, `manifest.json` and `styles.css` matched the source build by SHA-256. Obsidian was reloaded and the plugin settings, article preview and style-panel open/close path were exercised without a remote publish action. |
| Obsidian 1.13.7 desktop pass | PASS | The current build loaded in Obsidian `1.13.7`. The installed plugin card showed version `0.1.0` and author `anightmonarch`; account and AI settings rendered and the workbench preview remained usable. |
| Latest Obsidian status | PASS | The official public desktop changelog listed `1.13.7` as the latest desktop release on 2026-08-27; the current runtime is `1.13.7`. |
| Minimum Obsidian 1.11.4 | PASS | The official macOS `1.11.4` DMG matched the SHA-256 digest published with the GitHub Release and passed Apple code-signature and notarization checks. The current plugin assets matched the isolated Vault copies by SHA-256. In a separate `1.11.4` user-data directory and Vault, the plugin loaded and its demo note, article preview, style panel and settings page were exercised successfully. The isolated API typecheck also passed. |
| Windows | BLOCKED | No Windows host available |
| Linux | BLOCKED | No Linux desktop host available. Docker is installed only as a client and no daemon is running; a container would not replace Obsidian desktop acceptance. |
| Dedicated WeChat account | PARTIAL | Authorized CREATE → UPDATE → SKIP passed with locally stored credentials. Official-backend visual comparison remains outstanding. |
| Real intelligent-cover provider | BLOCKED | Requires explicit per-call disclosure confirmation |

No push, tag, GitHub Release, BRAT beta or Obsidian community submission has been performed.

## Current official release contract

- Plugin folder and release assets: `main.js`, `manifest.json`, and optional `styles.css`.
- GitHub Release tag must exactly match `manifest.json.version`.
- Root `README.md` and release assets must be available from the public repository/release.
- `versions.json` maps plugin versions to minimum Obsidian versions.

Sources checked on 2026-08-27:

- <https://github.com/obsidianmd/obsidian-releases/blob/master/README.md>
- <https://github.com/obsidianmd/obsidian-api>
- <https://obsidian.md/changelog/2026-08-12-desktop-v1.13.7/>
