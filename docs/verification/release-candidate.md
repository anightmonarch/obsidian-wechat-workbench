# Release Candidate Verification

Version: `0.1.1`

## Automated

| Check | Status |
| --- | --- |
| Unit/integration/adversarial tests | PASS locally, 91 files / 526 tests on 2026-08-29 |
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
| macOS, installed test Vault | PASS | On 2026-08-29 the current build was synced to the isolated Vault; `main.js`, `manifest.json` and `styles.css` matched the source build by SHA-256. Obsidian was force-reloaded and the article preview, publish settings and complete style-panel control set were exercised without a remote publish action. |
| Obsidian 1.13.7 desktop pass | PASS | The `0.1.1` runtime build loaded in Obsidian `1.13.7`; the style panel opened at its theme/font/size controls and retained the complete lower control set. |
| Latest Obsidian status | PASS | The official public desktop changelog listed `1.13.7` as the latest desktop release on 2026-08-27; the current runtime is `1.13.7`. |
| Minimum Obsidian 1.11.4 | PASS | The official macOS `1.11.4` DMG matched the SHA-256 digest published with the GitHub Release and passed Apple code-signature and notarization checks. The current plugin assets matched the isolated Vault copies by SHA-256. In a separate `1.11.4` user-data directory and Vault, the plugin loaded and its demo note, article preview, style panel and settings page were exercised successfully. The isolated API typecheck also passed. |
| Windows | BLOCKED | No Windows host available |
| Linux | BLOCKED | No Linux desktop host available. Docker is installed only as a client and no daemon is running; a container would not replace Obsidian desktop acceptance. |
| Dedicated WeChat account | PARTIAL | Authorized CREATE → UPDATE → SKIP passed with locally stored credentials. Official-backend visual comparison remains outstanding. |
| Real intelligent-cover provider | PARTIAL | Failure classification and secret-safe UI mapping are covered; this candidate does not yet have a successful generated-image preview receipt. |

## Final local asset hashes

- `main.js`: `bc0b7c3f92c10aa1ab9071ec257b517f0205a405a28518214dc84514b6fbafb7`
- `manifest.json`: `5493fbaae05a684b994a9f6fdd217b119c1930dfe3a39a99649c7990ead365e0`
- `styles.css`: `2dfc7ea3844ea1eb7f605d58e2d061d99e88fc7583b971945d4eb302b725f00b`

The `0.1.1` push, tag and GitHub Release remain pending until the release commit is created. The official community plugin directory still has no `wechat-workbench` entry.

## Current official release contract

- Plugin folder and release assets: `main.js`, `manifest.json`, and optional `styles.css`.
- GitHub Release tag must exactly match `manifest.json.version`.
- Root `README.md` and release assets must be available from the public repository/release.
- `versions.json` maps plugin versions to minimum Obsidian versions.

Sources checked again on 2026-08-29:

- <https://github.com/obsidianmd/obsidian-releases/blob/master/README.md>
- <https://github.com/obsidianmd/obsidian-api>
- <https://obsidian.md/changelog/2026-08-12-desktop-v1.13.7/>
