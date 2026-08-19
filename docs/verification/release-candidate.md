# Release Candidate Verification

Version: `0.1.0`

## Automated

| Check | Status |
| --- | --- |
| Unit/integration/adversarial tests | PASS locally |
| ESLint | PASS locally |
| TypeScript | PASS locally |
| Production bundle | PASS locally |
| Release asset and public-doc verifier | PASS locally |
| Sensitive information scan | PASS locally |
| Clean `npm ci` install | PASS locally |
| `npm audit --omit=dev` | PASS, 0 production vulnerabilities |

## Environment matrix

| Environment | Status | Evidence |
| --- | --- | --- |
| macOS, installed test Vault | PARTIAL | Obsidian 1.13.7 observed the basic UI pass on `f2f52a5`; current `e27fe8d` was synced but not reloaded before the session locked. See [WeSight UI evidence](wesight-ui-redesign.md). |
| Obsidian 1.13.7 desktop pass | PARTIAL | The prior build rendered the smoke note, opened publishing settings, and opened the native theme menu; current-build rerun is pending unlock. See [WeSight UI evidence](wesight-ui-redesign.md). |
| Latest Obsidian status | BLOCKED | Latest-version status has not been independently verified. |
| Minimum Obsidian 1.11.4 | BLOCKED | Not installed in current environment |
| Windows | BLOCKED | No Windows host available |
| Linux | BLOCKED | No Linux desktop host available |
| Dedicated WeChat account | BLOCKED | Requires unlocked Obsidian and backend visual comparison |
| Real intelligent-cover provider | BLOCKED | Requires explicit per-call disclosure confirmation |

No push, tag, GitHub Release, BRAT beta or Obsidian community submission has been performed.

## Current official release contract

- Plugin folder and release assets: `main.js`, `manifest.json`, and optional `styles.css`.
- GitHub Release tag must exactly match `manifest.json.version`.
- Root `README.md` and release assets must be available from the public repository/release.
- `versions.json` maps plugin versions to minimum Obsidian versions.

Sources checked on 2026-08-19:

- <https://github.com/obsidianmd/obsidian-releases/blob/master/README.md>
- <https://github.com/obsidianmd/obsidian-api>
