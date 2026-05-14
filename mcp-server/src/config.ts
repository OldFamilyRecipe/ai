/**
 * Copyright (c) 2025-2026 Andy Rockwell. All rights reserved.
 *
 * Old Family Recipe MCP — runtime config.
 *
 * Auth model: each request carries an `Authorization: Bearer ofr_<secret>`
 * header. The key is read from `OFR_API_KEY`, or resolved via the
 * onboarding flow (PKCE → device-code) on first run.
 */

export interface OfrConfig {
  /** Bearer key for the upstream OFR API. */
  apiKey: string | null;
  /** Base URL for the OFR API, e.g. "https://api.oldfamilyrecipe.com" */
  apiBase: string;
}

export const DEFAULT_API_BASE = "https://api.oldfamilyrecipe.com";

export function configFromEnv(): OfrConfig {
  return {
    apiKey: process.env.OFR_API_KEY ?? null,
    apiBase: (process.env.OFR_API_URL ?? DEFAULT_API_BASE).replace(/\/$/, ""),
  };
}
