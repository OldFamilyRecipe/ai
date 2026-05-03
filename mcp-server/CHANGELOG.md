# Changelog

All notable changes to `@oldfamilyrecipe/mcp-server` will be documented here.

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
