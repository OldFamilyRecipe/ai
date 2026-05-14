/**
 * Copyright (c) 2025-2026 Andy Rockwell. All rights reserved.
 *
 * Old Family Recipe MCP — PKCE + localhost CLI auth flow (RFC 7636).
 *
 * Default first-run path. Beats RFC 8628 device-code typing on UX (1-2 user
 * actions vs. 5) and on security (PKCE prevents auth-code interception even
 * if the localhost callback is intercepted).
 *
 * Flow:
 *   1. Generate code_verifier (32 random bytes → base64url, NEVER leaves device)
 *      and code_challenge = sha256(verifier).
 *   2. Bind a one-shot HTTP server on a random localhost port.
 *   3. Open the user's browser to oldfamilyrecipe.com/cli-auth?...
 *   4. User signs in (if needed), clicks Approve.
 *   5. Browser redirects to http://127.0.0.1:PORT/?code=...&state=...
 *   6. Local listener catches the redirect, validates state nonce, exchanges
 *      code + verifier for the API key, shuts down.
 *
 * Falls back to device-flow when:
 *   - --no-browser flag set
 *   - port-bind fails (all ports in our range busy)
 *   - browser-open fails (no display, no DISPLAY env, etc.)
 */

import { createHash, randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { hostname, userInfo } from "node:os";
import { spawn } from "node:child_process";

import { DEFAULT_API_BASE } from "./config.js";

// ============================================================================
// Public types
// ============================================================================

export interface RunCliAuthFlowOptions {
  /** Defaults to https://api.oldfamilyrecipe.com — override for staging/local. */
  apiBase?: string;
  /**
   * Defaults to the dashboard URL inferred from apiBase. Override for
   * staging or local dashboard (e.g. http://localhost:5173).
   */
  dashboardUrl?: string;
  /** Lines printed to stderr (the user-facing surface). */
  print: (line: string) => void;
  /** Pin a port instead of letting the OS pick. Useful for corp firewalls. */
  port?: number;
  /** Override device label (defaults to host + user). */
  deviceLabel?: string;
  /** Total flow timeout (ms). Default: 5 minutes. */
  timeoutMs?: number;
  /** Inject a fake "open the browser" function for tests. */
  openBrowser?: (url: string) => Promise<void>;
  /** Inject a fake fetch for tests. */
  fetchImpl?: typeof fetch;
}

export interface CliAuthResult {
  api_key: string;
  api_base: string;
  user_id: string;
  created_at: string;
}

export class CliAuthFlowError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "port_bind_failed"
      | "browser_open_failed"
      | "timeout"
      | "exchange_failed"
      | "state_mismatch"
      | "callback_error",
  ) {
    super(message);
    this.name = "CliAuthFlowError";
  }
}

// ============================================================================
// PKCE primitives
// ============================================================================

/** RFC 7636 §4.1: 43-128 chars of [A-Z][a-z][0-9]-._~. base64url(32 bytes) is 43. */
export function generateCodeVerifier(): string {
  return randomBytes(32).toString("base64url");
}

/** RFC 7636 §4.2: S256 challenge = base64url(sha256(verifier)). */
export function deriveCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

/** Random base64url state nonce for CSRF protection. */
export function generateState(): string {
  return randomBytes(16).toString("base64url");
}

// ============================================================================
// Browser helper
// ============================================================================

/**
 * Open URL in the user's default browser. Cross-platform via the OS-native
 * "open"-style command. Returns once the spawn succeeds — we don't wait for
 * the browser to actually load.
 */
async function defaultOpenBrowser(url: string): Promise<void> {
  const cmd = process.platform === "darwin"
    ? "open"
    : process.platform === "win32"
      ? "cmd"
      : "xdg-open";
  const args = process.platform === "win32"
    ? ["/c", "start", "", url]
    : [url];

  return new Promise<void>((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: "ignore",
      detached: true,
    });
    child.on("error", reject);
    child.on("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

// ============================================================================
// Default device label
// ============================================================================

/** Best-effort identifier — shown to user on the approval page. */
export function defaultDeviceLabel(): string {
  let host = "unknown-host";
  let user = "unknown-user";
  try { host = hostname(); } catch { /* ignore */ }
  try { user = userInfo().username; } catch { /* ignore */ }
  return `OFR CLI on ${host} (${user})`;
}

// ============================================================================
// Main entry — runCliAuthFlow
// ============================================================================

/**
 * Run the full PKCE + localhost flow end-to-end. Returns the API key on
 * success. Throws CliAuthFlowError on any failure — caller can inspect
 * `.code` to decide whether to fall back to the device-code flow.
 */
export async function runCliAuthFlow(
  opts: RunCliAuthFlowOptions,
): Promise<CliAuthResult> {
  const apiBase = (opts.apiBase ?? DEFAULT_API_BASE).replace(/\/$/, "");
  const dashboardUrl = opts.dashboardUrl ?? inferDashboardUrl(apiBase);
  const fetchImpl = opts.fetchImpl ?? fetch;
  const openBrowser = opts.openBrowser ?? defaultOpenBrowser;
  const timeoutMs = opts.timeoutMs ?? 5 * 60 * 1000;

  const codeVerifier = generateCodeVerifier();
  const codeChallenge = deriveCodeChallenge(codeVerifier);
  const state = generateState();
  const deviceLabel = opts.deviceLabel ?? defaultDeviceLabel();

  // Bind a one-shot HTTP server.
  const { server, port, listener } = await bindLocalServer(opts.port);
  const redirectUri = `http://127.0.0.1:${port}`;

  opts.print(`Opening browser for sign-in (listening on ${redirectUri})...`);

  const params = new URLSearchParams({
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
    redirect_uri: redirectUri,
    client_id: "oldfamilyrecipe-cli",
    device_label: deviceLabel,
  });
  const authUrl = `${dashboardUrl}/cli-auth?${params.toString()}`;

  // Open the browser. If it fails, surface a clear error so the caller can
  // fall back. Print the URL so the user can paste it manually as a last
  // resort.
  try {
    await openBrowser(authUrl);
  } catch (err) {
    server.close();
    opts.print(`Could not open browser: ${err instanceof Error ? err.message : String(err)}`);
    opts.print(`Open this URL manually: ${authUrl}`);
    throw new CliAuthFlowError(
      "Failed to open browser. Run with --no-browser to use device-code fallback.",
      "browser_open_failed",
    );
  }

  // Wait for the callback or timeout.
  let callback: { code: string; state: string };
  try {
    callback = await listener({ timeoutMs });
  } finally {
    server.close();
  }

  // CSRF protection: the state we sent must match what the dashboard echoed.
  if (callback.state !== state) {
    throw new CliAuthFlowError(
      "State nonce mismatch — refusing to exchange auth code.",
      "state_mismatch",
    );
  }

  // Exchange code + verifier for the API key.
  opts.print("Approval received. Exchanging for API key...");
  const exchangeRes = await fetchImpl(`${apiBase}/cli-auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code: callback.code,
      code_verifier: codeVerifier,
    }),
  });

  if (!exchangeRes.ok) {
    let body = "";
    try { body = await exchangeRes.text(); } catch { /* ignore */ }
    throw new CliAuthFlowError(
      `Token exchange failed (HTTP ${exchangeRes.status}): ${body.slice(0, 200)}`,
      "exchange_failed",
    );
  }

  const json = (await exchangeRes.json()) as {
    api_key?: string;
    user_id?: string;
  };
  if (!json.api_key || !json.user_id) {
    throw new CliAuthFlowError(
      "Token exchange returned incomplete response.",
      "exchange_failed",
    );
  }

  return {
    api_key: json.api_key,
    api_base: apiBase,
    user_id: json.user_id,
    created_at: new Date().toISOString(),
  };
}

// ============================================================================
// Local HTTP server — bind, await one redirect, return code/state
// ============================================================================

interface LocalListener {
  server: ReturnType<typeof createServer>;
  port: number;
  listener: (opts: { timeoutMs: number }) => Promise<{ code: string; state: string }>;
}

/**
 * Bind to an explicit port if given, otherwise let the OS pick a free port
 * by binding to port 0. Always binds to 127.0.0.1 — never 0.0.0.0 — so the
 * callback URL is unreachable from any other machine on the network.
 *
 * Exported for tests so they can stub the listener flow.
 */
export async function bindLocalServer(preferredPort?: number): Promise<LocalListener> {
  let resolvedPort = 0;
  let resolveCallback: (val: { code: string; state: string }) => void;
  let rejectCallback: (err: Error) => void;
  let settled = false;
  const callbackPromise = new Promise<{ code: string; state: string }>((res, rej) => {
    resolveCallback = res;
    rejectCallback = rej;
  });

  // Fire-once gate. The browser may issue follow-up requests (favicon,
  // double-click, history navigation) after the auth callback. Without this
  // gate, a second request would either re-call rejectCallback (silently
  // ignored by the Promise but logged by Node as an unhandled error event
  // in some test environments) or — worse — accidentally settle the promise
  // with stale data.
  function settleResolve(val: { code: string; state: string }): void {
    if (settled) return;
    settled = true;
    resolveCallback(val);
  }
  function settleReject(err: Error): void {
    if (settled) return;
    settled = true;
    rejectCallback(err);
  }

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (!req.url) {
      res.statusCode = 400;
      res.end("Bad request");
      return;
    }
    const url = new URL(req.url, `http://127.0.0.1:${resolvedPort}`);
    if (url.pathname !== "/" && url.pathname !== "") {
      res.statusCode = 404;
      res.end("Not found");
      return;
    }
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error) {
      respondHtml(res, 400, "Authorization failed", `Error: ${escapeHtml(error)}. Return to your terminal.`);
      settleReject(new CliAuthFlowError(`Browser returned error: ${error}`, "callback_error"));
      return;
    }
    if (!code || !state) {
      respondHtml(res, 400, "Bad redirect", "Missing code or state. Return to your terminal.");
      settleReject(new CliAuthFlowError("Browser callback missing code or state", "callback_error"));
      return;
    }

    respondHtml(
      res,
      200,
      "Connected!",
      "Old Family Recipe is paired with this machine. You can close this tab and return to your terminal.",
    );
    settleResolve({ code, state });
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (err: NodeJS.ErrnoException) => {
      reject(new CliAuthFlowError(
        `Failed to bind localhost port${preferredPort ? ` ${preferredPort}` : ""}: ${err.message}`,
        "port_bind_failed",
      ));
    };
    server.once("error", onError);
    server.listen(preferredPort ?? 0, "127.0.0.1", () => {
      server.off("error", onError);
      const addr = server.address();
      if (addr && typeof addr === "object") {
        resolvedPort = addr.port;
      }
      resolve();
    });
  });

  return {
    server,
    port: resolvedPort,
    listener: ({ timeoutMs }) => {
      const timer = new Promise<{ code: string; state: string }>((_, rej) => {
        setTimeout(() => {
          rej(new CliAuthFlowError(
            `Timed out after ${Math.round(timeoutMs / 1000)}s waiting for browser approval.`,
            "timeout",
          ));
        }, timeoutMs);
      });
      return Promise.race([callbackPromise, timer]);
    },
  };
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Map api.oldfamilyrecipe.com → oldfamilyrecipe.com (the consumer site
 * hosts the /cli-auth and /device pages — there is no separate dashboard
 * host in OFR's setup).
 */
function inferDashboardUrl(apiBase: string): string {
  try {
    const url = new URL(apiBase);
    if (url.hostname === "api.oldfamilyrecipe.com") return "https://oldfamilyrecipe.com";
    // Staging/local fallback: strip a leading "api." prefix from the host.
    if (url.hostname.startsWith("api.")) {
      return `${url.protocol}//${url.hostname.slice("api.".length)}`;
    }
    // Last resort — no swap.
    return `${url.protocol}//${url.host}`;
  } catch {
    return "https://oldfamilyrecipe.com";
  }
}

function respondHtml(res: ServerResponse, status: number, title: string, body: string): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  // Connection: close so the browser releases the socket immediately. Without
  // this, browser keep-alive can keep the listener socket pinned past
  // server.close(), leaving the process unable to exit cleanly.
  res.setHeader("Connection", "close");
  res.end(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #0b1117; color: #e6edf3; margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 1rem; }
    .card { max-width: 28rem; padding: 2rem; border-radius: 0.75rem; background: #161b22; border: 1px solid #30363d; text-align: center; }
    h1 { font-size: 1.25rem; margin: 0 0 0.5rem; color: #2dd4bf; }
    p { font-size: 0.875rem; color: #94a3b8; margin: 0; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(body)}</p>
  </div>
</body>
</html>`);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
