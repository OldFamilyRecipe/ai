/**
 * Tests for path validation, extension whitelist, size cap, and magic-byte
 * sniff on `recipe_import_image`.
 *
 * Runner: `node:test` + tsx (NOT Jest).
 *   npx tsx --test src/image-validation.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  validateImagePath,
  sniffImageType,
  MAX_IMAGE_SIZE_BYTES,
  ALLOWED_EXTENSIONS,
  MAGIC_BYTES_LENGTH,
} from "./image-validation.js";

// --- Magic byte fixtures ---------------------------------------------------

function jpegMagic(): Buffer {
  const b = Buffer.alloc(MAGIC_BYTES_LENGTH);
  b[0] = 0xff; b[1] = 0xd8; b[2] = 0xff;
  return b;
}
function pngMagic(): Buffer {
  return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
}
function webpMagic(): Buffer {
  return Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
}
function heicMagic(brand: string = "heic"): Buffer {
  const b = Buffer.alloc(MAGIC_BYTES_LENGTH);
  b[4] = 0x66; b[5] = 0x74; b[6] = 0x79; b[7] = 0x70; // "ftyp"
  b.write(brand, 8, 4, "ascii");
  return b;
}
function textMagic(): Buffer {
  return Buffer.from("hello world!", "ascii");
}

function magicForExt(ext: string): Buffer {
  const e = ext.toLowerCase();
  if (e === ".jpg" || e === ".jpeg") return jpegMagic();
  if (e === ".png") return pngMagic();
  if (e === ".webp") return webpMagic();
  if (e === ".heic") return heicMagic();
  return textMagic();
}

function makeSandbox() {
  const root = mkdtempSync(join(tmpdir(), "ofr-mcp-test-"));
  const home = join(root, "home");
  const cwd = join(root, "cwd");
  writeFileSync(join(root, "marker.txt"), "");
  return {
    root,
    home,
    cwd,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

function optsFor(sb: ReturnType<typeof makeSandbox>, size = 1024) {
  return {
    homeDir: sb.home,
    cwd: sb.cwd,
    statFn: (_p: string) => ({ size }),
    readMagicFn: (p: string, _len: number) => magicForExt(p.slice(p.lastIndexOf("."))),
    realPathFn: (p: string) => p,
  };
}

// --- Layer 1: containment --------------------------------------------------

test("valid path inside homedir is accepted", () => {
  const sb = makeSandbox();
  try {
    const target = join(sb.home, "Photos", "card.jpg");
    const result = validateImagePath(target, optsFor(sb));
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.resolvedPath, target);
  } finally {
    sb.cleanup();
  }
});

test("valid path inside cwd is accepted", () => {
  const sb = makeSandbox();
  try {
    const result = validateImagePath("recipe.png", optsFor(sb, 2048));
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.resolvedPath, join(sb.cwd, "recipe.png"));
  } finally {
    sb.cleanup();
  }
});

test("traversal `../etc/passwd` is rejected", () => {
  const sb = makeSandbox();
  try {
    const result = validateImagePath("../../../../etc/passwd", optsFor(sb));
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /home directory|current working directory/i);
  } finally {
    sb.cleanup();
  }
});

test("absolute `/etc/passwd` is rejected", () => {
  const sb = makeSandbox();
  try {
    const result = validateImagePath("/etc/passwd", optsFor(sb));
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /home directory|current working directory/i);
  } finally {
    sb.cleanup();
  }
});

test("symlink that escapes home is rejected (realPath resolves it)", () => {
  const sb = makeSandbox();
  try {
    // Simulate `~/innocent.png -> /etc/passwd` via realPathFn rewrite.
    const opts = {
      ...optsFor(sb),
      realPathFn: (_p: string) => "/etc/passwd",
    };
    const target = join(sb.home, "innocent.png");
    const result = validateImagePath(target, opts);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /home directory|current working directory/i);
  } finally {
    sb.cleanup();
  }
});

// --- Layer 2: extension whitelist ------------------------------------------

test(".txt extension is rejected", () => {
  const sb = makeSandbox();
  try {
    const target = join(sb.home, "Documents", "secrets.txt");
    const result = validateImagePath(target, optsFor(sb));
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /allowed extensions|image file/i);
  } finally {
    sb.cleanup();
  }
});

test("extension whitelist is case-insensitive", () => {
  const sb = makeSandbox();
  try {
    for (const ext of [".JPG", ".Jpeg", ".PNG", ".WebP", ".HEIC"]) {
      const target = join(sb.home, `card${ext}`);
      const result = validateImagePath(target, optsFor(sb));
      assert.equal(result.ok, true, `expected ${ext} to be accepted`);
    }
  } finally {
    sb.cleanup();
  }
});

// --- Layer 3: size cap -----------------------------------------------------

test("21 MB file is rejected", () => {
  const sb = makeSandbox();
  try {
    const oversized = MAX_IMAGE_SIZE_BYTES + 1024 * 1024;
    const target = join(sb.home, "huge.jpg");
    const result = validateImagePath(target, optsFor(sb, oversized));
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /too large|max 20 MB/i);
  } finally {
    sb.cleanup();
  }
});

test("file at exactly 20 MB is accepted (boundary)", () => {
  const sb = makeSandbox();
  try {
    const target = join(sb.home, "card.jpg");
    const result = validateImagePath(target, optsFor(sb, MAX_IMAGE_SIZE_BYTES));
    assert.equal(result.ok, true);
  } finally {
    sb.cleanup();
  }
});

// --- Layer 4: magic-byte sniff ---------------------------------------------

test("file with .png extension but text content is rejected", () => {
  const sb = makeSandbox();
  try {
    const opts = { ...optsFor(sb), readMagicFn: () => textMagic() };
    const target = join(sb.home, "fake.png");
    const result = validateImagePath(target, opts);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /file header|does not appear/i);
  } finally {
    sb.cleanup();
  }
});

test("file with .png extension but JPEG bytes is rejected (mismatch)", () => {
  const sb = makeSandbox();
  try {
    const opts = { ...optsFor(sb), readMagicFn: () => jpegMagic() };
    const target = join(sb.home, "looks-like-png.png");
    const result = validateImagePath(target, opts);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /does not match|detected: jpeg/i);
  } finally {
    sb.cleanup();
  }
});

test("HEIC with mif1 brand is accepted", () => {
  const sb = makeSandbox();
  try {
    const opts = { ...optsFor(sb), readMagicFn: () => heicMagic("mif1") };
    const target = join(sb.home, "modern.heic");
    const result = validateImagePath(target, opts);
    assert.equal(result.ok, true);
  } finally {
    sb.cleanup();
  }
});

test("HEIC with unknown brand is rejected", () => {
  const sb = makeSandbox();
  try {
    const opts = { ...optsFor(sb), readMagicFn: () => heicMagic("xxxx") };
    const target = join(sb.home, "weird.heic");
    const result = validateImagePath(target, opts);
    assert.equal(result.ok, false);
  } finally {
    sb.cleanup();
  }
});

// --- sniffImageType direct unit tests --------------------------------------

test("sniffImageType identifies each supported family", () => {
  assert.equal(sniffImageType(jpegMagic()), "jpeg");
  assert.equal(sniffImageType(pngMagic()), "png");
  assert.equal(sniffImageType(webpMagic()), "webp");
  assert.equal(sniffImageType(heicMagic("heic")), "heic");
  assert.equal(sniffImageType(heicMagic("mif1")), "heic");
});

test("sniffImageType returns null for non-image bytes", () => {
  assert.equal(sniffImageType(textMagic()), null);
  assert.equal(sniffImageType(Buffer.alloc(MAGIC_BYTES_LENGTH)), null);
});

test("sniffImageType returns null for short buffers", () => {
  assert.equal(sniffImageType(Buffer.from([0xff, 0xd8, 0xff])), null);
});

// --- Misc ------------------------------------------------------------------

test("empty image_path is rejected", () => {
  const result = validateImagePath("");
  assert.equal(result.ok, false);
});

test("ALLOWED_EXTENSIONS exposes expected formats", () => {
  assert.deepEqual(
    Array.from(ALLOWED_EXTENSIONS).sort(),
    [".heic", ".jpeg", ".jpg", ".png", ".webp"],
  );
});
