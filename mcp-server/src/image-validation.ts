/**
 * Path + size + extension + content validation for `recipe_import_image`.
 *
 * Hardens the tool against prompt-injection attacks where an LLM is
 * coaxed by untrusted recipe-page content into reading sensitive local
 * files (`/etc/passwd`, SSH keys, etc.) and forwarding them to the
 * OFR API as base64.
 *
 * Four layers of defense, applied before `fs.readFileSync`:
 *  1. Path containment — resolved REAL path (symlinks followed) MUST
 *     be inside `os.homedir()` OR `process.cwd()`. Defeats symlink
 *     pivots like `~/innocent.png -> /etc/passwd` and `..` traversal.
 *  2. Extension whitelist — only common image formats accepted, case
 *     insensitive: `.jpg`, `.jpeg`, `.png`, `.webp`, `.heic`.
 *  3. Size cap — hard reject if the file is larger than 20 MB. The
 *     check happens BEFORE the file is read, so a malicious large file
 *     never gets buffered.
 *  4. Magic-byte sniff — read first 12 bytes and verify the file is a
 *     real image whose format matches its extension. Defeats trivial
 *     renames like `cp ~/.ssh/id_rsa /tmp/cute.png`.
 */

import { statSync, openSync, readSync, closeSync, realpathSync } from "fs";
import { homedir } from "os";
import { resolve, relative, extname, isAbsolute } from "path";

export const MAX_IMAGE_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB
export const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".heic"]);
export const MAGIC_BYTES_LENGTH = 12;

export type ImageFamily = "jpeg" | "png" | "webp" | "heic";

const EXT_TO_FAMILY: Record<string, ImageFamily> = {
  ".jpg": "jpeg",
  ".jpeg": "jpeg",
  ".png": "png",
  ".webp": "webp",
  ".heic": "heic",
};

// HEIF brands accepted under the .heic extension. ISO/IEC 23008-12.
const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "heim", "heis", "hevm", "hevs", "mif1", "msf1"]);

export type ValidationOk = { ok: true; resolvedPath: string };
export type ValidationErr = { ok: false; error: string };
export type ValidationResult = ValidationOk | ValidationErr;

type StatFn = (path: string) => { size: number };
type ReadMagicFn = (path: string, length: number) => Buffer;
type RealPathFn = (path: string) => string;

/**
 * Returns true if `target` is the same as `root` or nested inside it.
 * Uses `path.relative` so a `..` cannot smuggle past the check.
 */
function isInside(root: string, target: string): boolean {
  const rel = relative(root, target);
  if (rel === "") return true;
  if (rel.startsWith("..")) return false;
  if (isAbsolute(rel)) return false;
  return true;
}

function defaultReadMagic(path: string, length: number): Buffer {
  const fd = openSync(path, "r");
  try {
    const buf = Buffer.alloc(length);
    readSync(fd, buf, 0, length, 0);
    return buf;
  } finally {
    closeSync(fd);
  }
}

function defaultRealPath(path: string): string {
  // realpathSync throws ENOENT for missing paths. Swallow and return the
  // input so the downstream stat call surfaces the missing-file error
  // consistently with the pre-symlink-resolution behavior.
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

/**
 * Inspect the first 12 bytes of a file buffer and return which image
 * family it belongs to, or null if it doesn't match any supported
 * format.
 */
export function sniffImageType(buf: Buffer): ImageFamily | null {
  if (buf.length < 12) return null;

  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) {
    return "png";
  }

  // WebP: "RIFF" .... "WEBP" (bytes 0-3 and 8-11)
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) {
    return "webp";
  }

  // HEIC family: bytes 4-7 = "ftyp", bytes 8-11 = brand code
  if (buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) {
    const brand = buf.slice(8, 12).toString("ascii");
    if (HEIC_BRANDS.has(brand)) return "heic";
  }

  return null;
}

/**
 * Validate an image path supplied to `recipe_import_image`.
 *
 * Caller passes optional `homeDir`, `cwd`, `statFn`, `readMagicFn`, and
 * `realPathFn` overrides for tests.
 */
export function validateImagePath(
  imagePath: string,
  opts?: {
    homeDir?: string;
    cwd?: string;
    statFn?: StatFn;
    readMagicFn?: ReadMagicFn;
    realPathFn?: RealPathFn;
  },
): ValidationResult {
  if (!imagePath || typeof imagePath !== "string") {
    return { ok: false, error: "image_path is required and must be a string." };
  }

  const home = opts?.homeDir ?? homedir();
  const cwd = opts?.cwd ?? process.cwd();
  const stat = opts?.statFn ?? ((p: string) => statSync(p));
  const readMagic = opts?.readMagicFn ?? defaultReadMagic;
  const realPath = opts?.realPathFn ?? defaultRealPath;

  // Resolve string path against cwd, then follow symlinks. Subsequent
  // checks all operate on the on-disk real path so a symlink inside
  // home cannot smuggle the read out of the sandbox.
  const resolved = realPath(resolve(cwd, imagePath));

  // Layer 1: containment.
  if (!isInside(home, resolved) && !isInside(cwd, resolved)) {
    return {
      ok: false,
      error:
        `image_path must be inside your home directory or the current working directory. ` +
        `Got: ${imagePath} (resolved: ${resolved}).`,
    };
  }

  // Layer 2: extension whitelist (case-insensitive).
  const ext = extname(resolved).toLowerCase();
  const family = EXT_TO_FAMILY[ext];
  if (!family) {
    return {
      ok: false,
      error:
        `image_path must point to an image file. Allowed extensions: ` +
        `${Array.from(ALLOWED_EXTENSIONS).join(", ")}. Got: ${ext || "(none)"}.`,
    };
  }

  // Layer 3: size cap. statSync throws if missing — bubble up.
  let size: number;
  try {
    size = stat(resolved).size;
  } catch (err) {
    return {
      ok: false,
      error: `Could not stat image at ${imagePath}: ${(err as Error).message}`,
    };
  }
  if (size > MAX_IMAGE_SIZE_BYTES) {
    const mb = (size / (1024 * 1024)).toFixed(1);
    return {
      ok: false,
      error:
        `Image is too large: ${mb} MB (max 20 MB). ` +
        `Try a smaller resolution or compress the photo.`,
    };
  }

  // Layer 4: magic-byte sniff. Cheap (12 bytes) and runs only after the
  // size check, so we never read the head of an oversized file.
  let magic: Buffer;
  try {
    magic = readMagic(resolved, MAGIC_BYTES_LENGTH);
  } catch (err) {
    return {
      ok: false,
      error: `Could not read image header at ${imagePath}: ${(err as Error).message}`,
    };
  }
  const detected = sniffImageType(magic);
  if (detected === null) {
    return {
      ok: false,
      error:
        `image_path does not appear to be an image — file header doesn't match ` +
        `JPEG, PNG, WebP, or HEIC.`,
    };
  }
  if (detected !== family) {
    return {
      ok: false,
      error:
        `image_path extension ${ext} does not match the file's actual content ` +
        `(detected: ${detected}). Rename the file to match its real format.`,
    };
  }

  return { ok: true, resolvedPath: resolved };
}
