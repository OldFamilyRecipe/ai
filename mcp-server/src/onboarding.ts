/**
 * Copyright (c) 2025-2026 Andy Rockwell. All rights reserved.
 *
 * Old Family Recipe MCP — RFC 8628 Device Authorization Grant client.
 *
 * Drives the onboarding flow when no API key is configured and the PKCE
 * + browser path is unavailable (no display, --no-browser, port bind
 * failure):
 *
 *   1. POST /v1/device/code  → device_code + user_code + verification_uri
 *   2. Print the user_code + URL to stderr (stdio MCP can't talk to chat)
 *   3. POST /v1/device/token every `interval` seconds
 *      - "authorization_pending" → keep polling
 *      - "slow_down"             → double the interval and keep polling
 *      - "expired_token"         → fail with a clear restart instruction
 *      - access_token returned   → return StoredCredentials, caller persists
 *   4. Caller writes the credentials file via writeCredentials()
 *
 * All side-effecting deps are injectable so unit tests can run with mocked
 * fetch + sleep + print without polluting stderr or sleeping for real.
 */

import type { StoredCredentials } from "./credentials.js";

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  expires_in: number;
  interval: number;
}

export interface RunDeviceFlowOptions {
  /** OFR API base URL (e.g. https://api.oldfamilyrecipe.com). */
  apiBase: string;
  /** Print a line to the user (typically stderr). */
  print: (line: string) => void;
  /** Optional: override the sleep used between polls. Tests inject a no-op. */
  sleep?: (ms: number) => Promise<void>;
  /** Optional: override fetch (for tests). */
  fetchImpl?: typeof fetch;
  /** Hard upper bound on the poll loop. Defaults to expires_in from /code. */
  maxWaitSeconds?: number;
}

export class DeviceFlowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeviceFlowError";
  }
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Run the full device flow. Returns credentials on success, throws
 * `DeviceFlowError` with a user-actionable message on any non-recoverable
 * failure (network, expired, malformed response, etc.).
 */
export async function runDeviceFlow(
  opts: RunDeviceFlowOptions,
): Promise<StoredCredentials> {
  const apiBase = opts.apiBase.replace(/\/$/, "");
  const print = opts.print;
  const sleep = opts.sleep ?? defaultSleep;
  const fetchImpl = opts.fetchImpl ?? fetch;

  // Step 1 — request a device + user code.
  const code = await requestDeviceCode(apiBase, fetchImpl);

  // Step 2 — show the user what to do.
  printOnboardingMessage(print, code);

  // Step 3 — poll until approved, expired, or hard-timeout.
  const startMs = Date.now();
  const maxWaitMs = (opts.maxWaitSeconds ?? code.expires_in) * 1000;
  let intervalSec = code.interval;

  while (Date.now() - startMs < maxWaitMs) {
    await sleep(intervalSec * 1000);

    const result = await pollOnce(apiBase, fetchImpl, code.device_code);

    if (result.kind === "approved") {
      return {
        api_key: result.access_token,
        api_base: apiBase,
        user_id: result.user_id,
        created_at: new Date().toISOString(),
      };
    }

    if (result.kind === "slow_down") {
      // RFC 8628: doubling on slow_down is the recommended back-off.
      intervalSec = intervalSec * 2;
      continue;
    }

    if (result.kind === "expired") {
      throw new DeviceFlowError(
        "The setup code expired before you approved it. Please run the command again to get a new code.",
      );
    }

    // pending → loop
  }

  throw new DeviceFlowError(
    "Setup timed out without approval. Please run the command again.",
  );
}

// ============================================================================
// Internals (exported for tests)
// ============================================================================

export async function requestDeviceCode(
  apiBase: string,
  fetchImpl: typeof fetch,
): Promise<DeviceCodeResponse> {
  const res = await fetchImpl(`${apiBase}/v1/device/code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_name: "@oldfamilyrecipe/mcp" }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new DeviceFlowError(
      `Could not start device flow (HTTP ${res.status}). ${text || "Check your network and try again."}`,
    );
  }

  const body = (await res.json().catch(() => null)) as Partial<DeviceCodeResponse> | null;
  if (
    !body ||
    typeof body.device_code !== "string" ||
    typeof body.user_code !== "string" ||
    typeof body.verification_uri !== "string" ||
    typeof body.expires_in !== "number" ||
    typeof body.interval !== "number"
  ) {
    throw new DeviceFlowError("Setup server returned a malformed response.");
  }

  return {
    device_code: body.device_code,
    user_code: body.user_code,
    verification_uri: body.verification_uri,
    verification_uri_complete: body.verification_uri_complete,
    expires_in: body.expires_in,
    interval: body.interval,
  };
}

export type PollResult =
  | { kind: "pending" }
  | { kind: "slow_down" }
  | { kind: "expired" }
  | {
      kind: "approved";
      access_token: string;
      user_id: string;
    };

export async function pollOnce(
  apiBase: string,
  fetchImpl: typeof fetch,
  deviceCode: string,
): Promise<PollResult> {
  const res = await fetchImpl(`${apiBase}/v1/device/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ device_code: deviceCode }),
  });

  // The server returns 200 for every RFC 8628 outcome, including the "errors"
  // (the wire shape uses the body `error` field). Anything else is a real
  // network/server problem.
  if (!res.ok) {
    throw new DeviceFlowError(`Setup server returned HTTP ${res.status}`);
  }

  const body = (await res.json().catch(() => null)) as
    | {
        success?: boolean;
        error?: string;
        access_token?: string;
        user_id?: string;
      }
    | null;
  if (!body) throw new DeviceFlowError("Setup server returned a malformed response.");

  if (body.error === "authorization_pending") return { kind: "pending" };
  if (body.error === "slow_down") return { kind: "slow_down" };
  if (body.error === "expired_token") return { kind: "expired" };

  if (
    typeof body.access_token === "string" &&
    typeof body.user_id === "string"
  ) {
    return {
      kind: "approved",
      access_token: body.access_token,
      user_id: body.user_id,
    };
  }

  if (body.error) {
    throw new DeviceFlowError(`Setup server returned: ${body.error}`);
  }
  throw new DeviceFlowError("Setup server returned an unexpected response shape.");
}

export function printOnboardingMessage(
  print: (line: string) => void,
  code: DeviceCodeResponse,
): void {
  print("");
  print("╭─ Old Family Recipe setup ────────────────────────────────────╮");
  print("│                                                              │");
  print(`│  To finish setup, visit:  ${pad(code.verification_uri, 35)}│`);
  print(`│  And enter this code:     ${pad(code.user_code, 35)}│`);
  print("│                                                              │");
  print(`│  Code expires in ${code.expires_in / 60} minutes. Waiting...                       │`);
  print("│                                                              │");
  print("╰──────────────────────────────────────────────────────────────╯");
  print("");
}

function pad(s: string, width: number): string {
  return s.length >= width ? s : s + " ".repeat(width - s.length);
}
