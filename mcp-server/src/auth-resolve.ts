/**
 * Copyright (c) 2025-2026 Andy Rockwell. All rights reserved.
 *
 * Old Family Recipe MCP — auth resolution.
 *
 * Resolution order — first hit wins:
 *
 *   1. OFR_API_KEY env var           (explicit override always wins)
 *   2. Credentials file              (~/.config/oldfamilyrecipe/credentials.json)
 *   3. runCliAuthFlow (PKCE + localhost browser, the default first-run path)
 *      — falls through to device-flow on browser_open_failed/port_bind_failed
 *      — bypassed entirely if OFR_NO_BROWSER=1 or process is non-TTY
 *   4. runDeviceFlow (RFC 8628 fallback for headless / no-browser environments)
 *
 * Pulled out of `index.ts` so the precedence logic can be unit-tested.
 */

import type { OfrConfig } from "./config.js";
import { readCredentials, writeCredentials } from "./credentials.js";
import { runDeviceFlow, type RunDeviceFlowOptions } from "./onboarding.js";
import {
  runCliAuthFlow,
  CliAuthFlowError,
  type RunCliAuthFlowOptions,
  type CliAuthResult,
} from "./cli-auth-flow.js";

export interface ResolveAuthDeps {
  /** The config from `configFromEnv()` — may have a null apiKey. */
  envConfig: OfrConfig;
  /** Read function, injectable for tests. Defaults to `readCredentials`. */
  readCreds?: typeof readCredentials;
  /** Write function, injectable for tests. Defaults to `writeCredentials`. */
  writeCreds?: typeof writeCredentials;
  /** PKCE flow runner. Injectable for tests. Default uses real browser+server. */
  cliAuthFlow?: (opts: RunCliAuthFlowOptions) => Promise<CliAuthResult>;
  /** Device-flow runner, injectable for tests. Defaults to `runDeviceFlow`. */
  deviceFlow?: (opts: RunDeviceFlowOptions) => Promise<{
    api_key: string;
    api_base: string;
    user_id: string;
    created_at: string;
  }>;
  /** Print function (typically `(line) => process.stderr.write(line + "\n")`). */
  print: (line: string) => void;
  /**
   * If true, skip the PKCE+browser path entirely and go straight to device
   * flow. Honored by both the OFR_NO_BROWSER env var and the
   * `oldfamilyrecipe-mcp auth --no-browser` CLI flag.
   */
  noBrowser?: boolean;
}

export interface ResolvedAuth {
  config: OfrConfig;
  /** Where the key came from. Useful for the boot log. */
  source: "env" | "credentials-file" | "cli-auth-flow" | "device-flow";
}

export async function resolveAuth(deps: ResolveAuthDeps): Promise<ResolvedAuth> {
  // 1. Env wins.
  if (deps.envConfig.apiKey) {
    return { config: deps.envConfig, source: "env" };
  }

  // 2. Credentials file.
  const read = deps.readCreds ?? readCredentials;
  const stored = read();
  if (stored) {
    return {
      config: { apiKey: stored.api_key, apiBase: stored.api_base },
      source: "credentials-file",
    };
  }

  // 3. PKCE + localhost (default). Skip if explicitly opted out.
  const noBrowser =
    deps.noBrowser === true || process.env.OFR_NO_BROWSER === "1";

  let fresh: CliAuthResult | null = null;
  let source: "cli-auth-flow" | "device-flow" = "cli-auth-flow";

  if (!noBrowser) {
    const cliFlow = deps.cliAuthFlow ?? runCliAuthFlow;
    try {
      fresh = await cliFlow({
        apiBase: deps.envConfig.apiBase,
        print: deps.print,
      });
    } catch (err) {
      if (err instanceof CliAuthFlowError) {
        // Recoverable — try device flow. Surface a one-line note so the user
        // knows why we changed paths.
        if (err.code === "browser_open_failed" || err.code === "port_bind_failed") {
          deps.print(
            `[ofr-mcp] Browser-based auth unavailable (${err.code}). Falling back to device-code flow.`,
          );
        } else {
          // timeout / state_mismatch / exchange_failed / callback_error — the
          // user actually saw the browser flow but it didn't complete. Don't
          // silently swap to device-flow; let them retry.
          throw err;
        }
      } else {
        throw err;
      }
    }
  }

  // 4. Device-code fallback.
  if (!fresh) {
    const deviceFlowFn = deps.deviceFlow ?? runDeviceFlow;
    fresh = await deviceFlowFn({
      apiBase: deps.envConfig.apiBase,
      print: deps.print,
    });
    source = "device-flow";
  }

  const write = deps.writeCreds ?? writeCredentials;
  try {
    write(fresh);
  } catch (err) {
    // Failing to persist isn't fatal — we still have a working key in
    // memory for this session. Surface a clear warning so the user knows
    // they'll re-onboard next time.
    deps.print(
      `[ofr-mcp] Warning: could not persist credentials (${
        err instanceof Error ? err.message : String(err)
      }). You may need to re-run setup next time.`,
    );
  }

  return {
    config: { apiKey: fresh.api_key, apiBase: fresh.api_base },
    source,
  };
}
