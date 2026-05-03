# Changelog

All notable changes to `@oldfamilyrecipe/mcp-server` will be documented here.

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
