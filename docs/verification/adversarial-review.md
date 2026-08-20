# Adversarial Review

Date: 2026-08-19

Scope: article HTML/CSS, network assets, credentials, cover confirmation, publishing concurrency, and large inputs.

## Reproduced gap

- `COVER_CHANGED_AFTER_CONFIRMATION`: the original frozen publish command copied cover bytes, but did not re-check the current Frontmatter cover path and bytes before network access. A user or concurrent edit could therefore confirm one cover and publish another article state without an explicit mismatch. The coordinator now checks both path and SHA-256 before token access or upload and returns a non-retryable local failure.
- `COVER_PATH_UNSAFE`: manual Vault cover input accepted traversal segments and relied on the host adapter to reject them. The cover workflow now rejects absolute paths, schemes, NUL bytes, and normalized `..` traversal before any file read.
- `WECHAT_ACCOUNT_CHANGED`: a stale confirmation could freeze account A while token retrieval read the newly configured account B. Token retrieval now requires the frozen account hash and re-checks it before caching or returning a refreshed token.
- `PUBLISH_CONFLICT_IN_PROGRESS`: single-flight now shares only an identical transaction fingerprint. A different article/theme/cover snapshot for the same account and note is rejected while the first transaction runs.
- Pending CREATE receipts now include Vault path and transaction fingerprint and block another CREATE until reconciliation.
- Draft change detection now hashes title, author, digest, source URL, body and theme, so Frontmatter-only edits no longer become false SKIP results.
- Cover and unlink confirmations are bound to the originating note and article context. A stale dialog cannot mutate the newly active note.
- Recovery validates note, account and fingerprint, refuses to overwrite a different current draft, supports repair from a known remote result when receipt persistence failed, and reports receipt-resolution failure as `LOCAL_COMMITTED`.
- Fixed official WeChat API endpoints use Obsidian `requestUrl` to remain compatible with VPN/proxy Fake-IP DNS. User-configurable image-provider requests retain the DNS/IP-pinned Node transport with active socket destruction, total/connect/read deadlines and a 32 MiB streamed response ceiling.
- Remote image redirects remain HTTPS and share one end-to-end deadline. Provider URLs cannot contain credentials, query strings or fragments; uploaded image URLs are restricted to the approved WeChat CDN boundary.
- Error redaction covers header/JSON/query, snake_case and camelCase credential forms. Settings expose explicit credential clearing.

## Executable corpus

- `tests/adversarial/html-css.test.ts`
- `tests/adversarial/network-assets.test.ts`
- `tests/adversarial/secret-leakage.test.ts`
- `tests/adversarial/large-input.test.ts`
- Existing transaction tests cover double publish, account mismatch, missing drafts, ambiguous remote effects, and local write recovery.

At the time of this review, 56 test files and 207 tests passed, followed by lint, typecheck, production build, release verification and sensitive-information scan. Later UI hardening, account-entry, editable-article-settings, recovery-safety, Obsidian transport, actionable-token-error and WeChat CDN normalization tests bring the current suite to 62 test files and 240 tests; see the current [WeSight UI evidence](wesight-ui-redesign.md).

No test invokes a real account, formal publish endpoint, deletion endpoint, or mass-send endpoint.
