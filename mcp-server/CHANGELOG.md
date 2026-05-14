# Changelog

All notable changes to `@oldfamilyrecipe/mcp-server` will be documented here.

## [0.3.0] - 2026-05-13

### Added — first-run onboarding

- **One-click browser auth (PKCE + localhost) on first run.** Running
  `npx @oldfamilyrecipe/mcp-server` with no API key now opens a browser
  to `oldfamilyrecipe.com/cli-auth`, the user clicks Approve, and the
  CLI catches the redirect on a one-shot `127.0.0.1` listener. No more
  "get a 401 → go find the API keys page → copy/paste → restart"
  friction.
- **RFC 8628 device-code flow as a headless fallback.** Triggered
  automatically when the browser can't be opened (no display, no
  `DISPLAY`, port bind failure) or explicitly opted into via
  `OFR_NO_BROWSER=1`. Prints a user code + `oldfamilyrecipe.com/device`
  URL and polls until the user approves.
- **XDG-compliant credentials file at
  `~/.config/oldfamilyrecipe/credentials.json`** (mode `0600`,
  atomic write). Honors `XDG_CONFIG_HOME` on POSIX and `APPDATA` on
  Windows. Override the location for tests/sandboxing with
  `OFR_CONFIG_DIR=/path/to/dir`.
- **New auth-resolution chain in `auth-resolve.ts`** — first hit wins:
  `OFR_API_KEY` env var → credentials file → PKCE+browser → device flow.
- 33 new unit tests covering the resolution precedence, PKCE primitives,
  CSRF state validation, RFC 8628 state machine (pending / slow_down /
  expired / approved), credentials round-trip + 0600 mode.

### Backward compatibility

- **`OFR_API_KEY=ofr_xxx` env var still works exactly as before.** It's
  the first step in the resolution chain — power users with the env var
  set will see zero behavior change. The new browser/device flows only
  kick in when the env var is empty AND there's no stored credentials
  file. Existing MCP clients (Claude Desktop, Cursor, etc.) with
  `"env": { "OFR_API_KEY": "ofr_..." }` configured do not need to be
  changed.
- The friendly "OFR_API_KEY is not configured" tool-call response is
  preserved as a final safety net — if onboarding fails (e.g.,
  sandboxed CI with no browser AND no env var AND no device-flow
  network), the server still starts and the user sees a helpful message
  instead of a cryptic 401.

### Internal

- New `config.ts` module (`configFromEnv`, `DEFAULT_API_BASE`) so the
  resolver can be unit-tested without importing `index.ts`.
- Test runner now uses `--test-force-exit` (the PKCE tests bind a real
  localhost server; `undici`'s keep-alive socket pool pins the event
  loop open until forced shut).

## [0.2.0] — 2026-05-03

### Added
- **`family_invite`** tool now accepts an optional `relationship` parameter
  (string, max 40 chars). Captures how the invitee is related to the inviter
  (e.g. `sister`, `spouse`, `cousin`, or any free-text value). Always
  optional; empty / whitespace-only / non-string values are silently coerced
  to null and never block the invite. Mirrors the consumer-side schema
  shipped in monorepo migration 026 (PR #677).
- **`family_tree`** tool — new read-only tool that returns the invite graph
  for the caller's tenant. Each `FamilyTreeNode` includes `userId`, `name`,
  `email`, `role`, `joinedAt`, `invitedBy`, and the new
  `relationshipToInviter: string | null` field. Null for the root node and
  for legacy users who joined before relationship capture.
- Protocol spec (`spec/README.md`, `spec/openapi.yaml`) updated with a new
  Family Sharing section, the canonical relationship lexicon, the
  `FamilyTreeNode` schema, and the `GET /family/tree` endpoint definition.
  Schema parity with the consumer API as of 2026-05-03.

### Notes
- This is a non-breaking, additive schema change. SDK consumers reading
  responses from older API revisions will see `relationshipToInviter: null`
  (or the field absent) — clients MUST handle null gracefully.
- 11 new unit tests in `src/handlers.test.ts` covering relationship
  forwarding, normalization (trim + 40-char cap), absence omission, and
  the `family_tree` happy-path / empty / error responses. 59 tests total,
  up from 48.

## [0.1.5] — 2026-05-01

### Security
- **Symlink resolution.** Layer 1 (path containment) now operates on the
  symlink-resolved real path, defeating pivots like
  `~/innocent.png -> /etc/passwd` that previously passed the string-level
  containment check.
- **Magic-byte sniff (Layer 4).** Reads the first 12 bytes and verifies the
  file is a real image whose detected format matches its declared
  extension. Defeats trivial renames such as
  `cp ~/.ssh/id_rsa /tmp/cute.png` — the rename bypasses the extension
  whitelist but the SSH key has no JPEG/PNG/WebP/HEIC header. Supported
  HEIC brands: `heic`, `heix`, `hevc`, `heim`, `heis`, `hevm`, `hevs`,
  `mif1`, `msf1`.
- New unit tests in `src/image-validation.test.ts` cover the new layers
  (symlink-escapes-home, extension/content mismatch, text-content-as-image,
  HEIC brand acceptance, direct `sniffImageType` cases). 18 tests total,
  up from 10. Run with `npm test`.

## [0.1.4] — 2026-04-30

### Security
- **`recipe_import_image` path hardening.** Added three layers of validation
  before reading any file from disk, to defend against prompt-injection
  attacks where a malicious recipe page could try to coax the LLM into
  reading sensitive local files (`/etc/passwd`, SSH keys, etc.) and
  forwarding them as base64 to the OFR API:
  1. **Path containment** — `image_path` must resolve inside
     `os.homedir()` or `process.cwd()`. `..` traversal and absolute
     paths outside those roots are rejected.
  2. **Extension whitelist** — only `.jpg`, `.jpeg`, `.png`, `.webp`,
     `.heic` accepted (case-insensitive).
  3. **Size cap** — files larger than 20 MB are rejected before being
     read, so large files never get buffered.
- New unit tests in `src/image-validation.test.ts` cover the happy paths
  (homedir, cwd, case-insensitive extensions, 20 MB boundary) and the
  reject paths (`../etc/passwd`, `/etc/passwd`, `.txt` extension, 21 MB
  file, empty input). Run with `npm test`.

## [0.1.3] — 2026-04-29

- Graceful onboarding when `OFR_API_KEY` is missing — surfaces a friendly
  message in chat instead of silent 401s.

## [0.1.2] and earlier

- See git history.
