/**
 * Copyright (c) 2025-2026 Andy Rockwell. All rights reserved.
 *
 * Old Family Recipe MCP — credentials file (XDG-compliant).
 *
 * After the onboarding flow completes, the API key is persisted here so
 * subsequent runs don't need to re-onboard. Resolution order in
 * `auth-resolve.ts`:
 *
 *   1. OFR_API_KEY env var          (explicit override always wins)
 *   2. ~/.config/oldfamilyrecipe/credentials.json
 *   3. PKCE + localhost browser flow → write here → continue
 *   4. RFC 8628 device-code flow    → write here → continue
 *
 * File format (JSON):
 *   {
 *     "api_key":     "ofr_<secret>",
 *     "api_base":    "https://api.oldfamilyrecipe.com",
 *     "user_id":     "<cognito-sub>",
 *     "created_at":  "<ISO8601>"
 *   }
 *
 * File mode: 0o600 (owner read/write only). Atomic write (tmp + rename) so
 * a partial write can't leave the file unreadable.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join, dirname } from "node:path";

export interface StoredCredentials {
  api_key: string;
  api_base: string;
  user_id: string;
  created_at: string;
}

/**
 * Resolve the credentials directory. Honors `XDG_CONFIG_HOME` on POSIX,
 * `APPDATA` on Windows. Tests can override via `OFR_CONFIG_DIR`.
 */
export function credentialsDir(): string {
  const override = process.env.OFR_CONFIG_DIR;
  if (override) return override;

  if (platform() === "win32") {
    const appdata = process.env.APPDATA ?? join(homedir(), "AppData", "Roaming");
    return join(appdata, "oldfamilyrecipe");
  }

  const xdg = process.env.XDG_CONFIG_HOME;
  return xdg && xdg.length > 0
    ? join(xdg, "oldfamilyrecipe")
    : join(homedir(), ".config", "oldfamilyrecipe");
}

export function credentialsPath(): string {
  return join(credentialsDir(), "credentials.json");
}

/**
 * Read stored credentials. Returns null if the file is missing, unreadable,
 * malformed, or missing required fields. Never throws — onboarding handles
 * a null return by triggering the auth flow.
 */
export function readCredentials(): StoredCredentials | null {
  const path = credentialsPath();
  if (!existsSync(path)) return null;

  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isStoredCredentials(parsed)) return null;
  return parsed;
}

/**
 * Write credentials atomically. Creates parent dirs as needed. Mode 0o600
 * on POSIX (no-op on Windows — Windows uses ACLs, not POSIX mode bits).
 */
export function writeCredentials(creds: StoredCredentials): void {
  if (!isStoredCredentials(creds)) {
    throw new Error("writeCredentials: missing required fields");
  }

  const path = credentialsPath();
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true, mode: 0o700 });

  // Atomic write: write to tmp, rename to final. Rename is atomic on POSIX
  // and overwrites on the same volume on Windows.
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmp, JSON.stringify(creds, null, 2), { mode: 0o600 });
  renameSync(tmp, path);
}

function isStoredCredentials(value: unknown): value is StoredCredentials {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.api_key === "string" &&
    v.api_key.length > 0 &&
    typeof v.api_base === "string" &&
    v.api_base.length > 0 &&
    typeof v.user_id === "string" &&
    v.user_id.length > 0 &&
    typeof v.created_at === "string" &&
    v.created_at.length > 0
  );
}
