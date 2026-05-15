/**
 * Copyright (c) 2025-2026 Andy Rockwell. All rights reserved.
 *
 * Tests for the auth-resolution precedence:
 *   env var > credentials file > PKCE+localhost flow > device-code fallback.
 *
 * Tests that focus on the device-code branch pass `noBrowser: true` to skip
 * the PKCE step deterministically. PKCE-specific tests live near the bottom.
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import { resolveAuth } from "./auth-resolve.js";
import { CliAuthFlowError } from "./cli-auth-flow.js";
import type { StoredCredentials } from "./credentials.js";

const apiBase = "https://api.oldfamilyrecipe.com";

const validStored: StoredCredentials = {
  api_key: "ofr_stored_secret",
  api_base: apiBase,
  user_id: "u-stored",
  created_at: "2026-05-13T00:00:00Z",
};

const freshFromFlow: StoredCredentials = {
  api_key: "ofr_fresh_secret",
  api_base: apiBase,
  user_id: "u-fresh",
  created_at: "2026-05-13T01:00:00Z",
};

describe("resolveAuth — precedence", () => {
  it("returns env config when OFR_API_KEY is set, even if a credentials file exists", async () => {
    let readCalled = false;
    let flowCalled = false;
    const result = await resolveAuth({
      envConfig: { apiKey: "ofr_from_env", apiBase },
      readCreds: () => {
        readCalled = true;
        return validStored;
      },
      deviceFlow: async () => {
        flowCalled = true;
        return freshFromFlow;
      },
      print: () => {},
    });
    assert.equal(result.source, "env");
    assert.equal(result.config.apiKey, "ofr_from_env");
    assert.equal(readCalled, false, "must not read credentials when env wins");
    assert.equal(flowCalled, false, "must not trigger device flow when env wins");
  });

  it("returns credentials file when env is empty and a valid file exists", async () => {
    let flowCalled = false;
    const result = await resolveAuth({
      envConfig: { apiKey: null, apiBase },
      readCreds: () => validStored,
      deviceFlow: async () => {
        flowCalled = true;
        return freshFromFlow;
      },
      print: () => {},
    });
    assert.equal(result.source, "credentials-file");
    assert.equal(result.config.apiKey, "ofr_stored_secret");
    assert.equal(flowCalled, false, "must not trigger device flow when credentials file wins");
  });

  it("uses the credentials file's apiBase, not the env apiBase, when stored config wins", async () => {
    const customBase = "https://staging.oldfamilyrecipe.com";
    const result = await resolveAuth({
      envConfig: { apiKey: null, apiBase },
      readCreds: () => ({ ...validStored, api_base: customBase }),
      print: () => {},
    });
    assert.equal(result.config.apiBase, customBase);
  });

  it("triggers device flow when noBrowser=true and both env and credentials file are absent", async () => {
    let flowCalled = false;
    const result = await resolveAuth({
      envConfig: { apiKey: null, apiBase },
      readCreds: () => null,
      noBrowser: true,
      deviceFlow: async () => {
        flowCalled = true;
        return freshFromFlow;
      },
      writeCreds: () => {},
      print: () => {},
    });
    assert.equal(flowCalled, true);
    assert.equal(result.source, "device-flow");
    assert.equal(result.config.apiKey, "ofr_fresh_secret");
  });

  it("persists fresh credentials after a successful device flow", async () => {
    let written: StoredCredentials | null = null;
    await resolveAuth({
      envConfig: { apiKey: null, apiBase },
      readCreds: () => null,
      noBrowser: true,
      deviceFlow: async () => freshFromFlow,
      writeCreds: (c) => {
        written = c;
      },
      print: () => {},
    });
    assert.deepEqual(written, freshFromFlow);
  });

  it("warns but does NOT throw when persistence fails — in-memory key still works for this session", async () => {
    const lines: string[] = [];
    const result = await resolveAuth({
      envConfig: { apiKey: null, apiBase },
      readCreds: () => null,
      noBrowser: true,
      deviceFlow: async () => freshFromFlow,
      writeCreds: () => {
        throw new Error("EACCES: read-only filesystem");
      },
      print: (line) => lines.push(line),
    });
    assert.equal(result.config.apiKey, "ofr_fresh_secret");
    assert.equal(result.source, "device-flow");
    assert.ok(
      lines.some((l) => /could not persist credentials/i.test(l)),
      "should warn the user about persistence failure",
    );
    assert.ok(
      lines.some((l) => /EACCES/.test(l)),
      "warning should include the underlying error",
    );
  });

  it("propagates device flow failures (no key to fall back to)", async () => {
    await assert.rejects(
      () =>
        resolveAuth({
          envConfig: { apiKey: null, apiBase },
          readCreds: () => null,
          noBrowser: true,
          deviceFlow: async () => {
            throw new Error("user did not approve in time");
          },
          print: () => {},
        }),
      /user did not approve/,
    );
  });

  it("passes the env apiBase to the device flow so staging/dev work", async () => {
    let receivedApiBase: string | null = null;
    await resolveAuth({
      envConfig: { apiKey: null, apiBase: "https://staging.oldfamilyrecipe.com" },
      readCreds: () => null,
      noBrowser: true,
      deviceFlow: async (opts) => {
        receivedApiBase = opts.apiBase;
        return freshFromFlow;
      },
      writeCreds: () => {},
      print: () => {},
    });
    assert.equal(receivedApiBase, "https://staging.oldfamilyrecipe.com");
  });
});

describe("resolveAuth — PKCE + localhost flow (default first-run path)", () => {
  it("uses the PKCE flow when env and credentials file are absent (default)", async () => {
    let pkceCalled = false;
    let deviceFlowCalled = false;
    const result = await resolveAuth({
      envConfig: { apiKey: null, apiBase },
      readCreds: () => null,
      writeCreds: () => {},
      cliAuthFlow: async () => {
        pkceCalled = true;
        return freshFromFlow;
      },
      deviceFlow: async () => {
        deviceFlowCalled = true;
        return freshFromFlow;
      },
      print: () => {},
    });
    assert.equal(pkceCalled, true);
    assert.equal(deviceFlowCalled, false, "must not fall through when PKCE succeeds");
    assert.equal(result.source, "cli-auth-flow");
    assert.equal(result.config.apiKey, "ofr_fresh_secret");
  });

  it("falls back to device flow when PKCE fails with browser_open_failed", async () => {
    let deviceFlowCalled = false;
    const lines: string[] = [];
    const result = await resolveAuth({
      envConfig: { apiKey: null, apiBase },
      readCreds: () => null,
      writeCreds: () => {},
      cliAuthFlow: async () => {
        throw new CliAuthFlowError("no browser", "browser_open_failed");
      },
      deviceFlow: async () => {
        deviceFlowCalled = true;
        return freshFromFlow;
      },
      print: (l) => lines.push(l),
    });
    assert.equal(deviceFlowCalled, true);
    assert.equal(result.source, "device-flow");
    assert.ok(
      lines.some((l) => /Browser-based auth unavailable/i.test(l)),
      "should surface a fallback note to the user",
    );
  });

  it("falls back to device flow when PKCE fails with port_bind_failed", async () => {
    let deviceFlowCalled = false;
    const result = await resolveAuth({
      envConfig: { apiKey: null, apiBase },
      readCreds: () => null,
      writeCreds: () => {},
      cliAuthFlow: async () => {
        throw new CliAuthFlowError("ports busy", "port_bind_failed");
      },
      deviceFlow: async () => {
        deviceFlowCalled = true;
        return freshFromFlow;
      },
      print: () => {},
    });
    assert.equal(deviceFlowCalled, true);
    assert.equal(result.source, "device-flow");
  });

  it("does NOT fall back when PKCE fails with state_mismatch (security: don't auto-retry through a different channel)", async () => {
    await assert.rejects(
      () =>
        resolveAuth({
          envConfig: { apiKey: null, apiBase },
          readCreds: () => null,
          writeCreds: () => {},
          cliAuthFlow: async () => {
            throw new CliAuthFlowError("state mismatch", "state_mismatch");
          },
          deviceFlow: async () => freshFromFlow,
          print: () => {},
        }),
      (err: unknown) => {
        assert.ok(err instanceof CliAuthFlowError);
        assert.equal(err.code, "state_mismatch");
        return true;
      },
    );
  });

  it("does NOT fall back when PKCE fails with timeout (user actually saw the flow)", async () => {
    await assert.rejects(
      () =>
        resolveAuth({
          envConfig: { apiKey: null, apiBase },
          readCreds: () => null,
          writeCreds: () => {},
          cliAuthFlow: async () => {
            throw new CliAuthFlowError("timed out", "timeout");
          },
          deviceFlow: async () => freshFromFlow,
          print: () => {},
        }),
      (err: unknown) => {
        assert.ok(err instanceof CliAuthFlowError);
        assert.equal(err.code, "timeout");
        return true;
      },
    );
  });

  it("propagates a non-CliAuthFlowError thrown by the PKCE flow without falling back", async () => {
    // Defensive — if the PKCE flow throws something we don't know how to
    // classify (a generic JS error, a network library exception, etc.) we
    // MUST NOT silently retry through the device-code channel. Otherwise an
    // attacker who can poison the local environment could force a fallback
    // path the user didn't choose.
    let deviceFlowCalled = false;
    await assert.rejects(
      () =>
        resolveAuth({
          envConfig: { apiKey: null, apiBase },
          readCreds: () => null,
          writeCreds: () => {},
          cliAuthFlow: async () => {
            throw new Error("ENOTFOUND oldfamilyrecipe.com");
          },
          deviceFlow: async () => {
            deviceFlowCalled = true;
            return freshFromFlow;
          },
          print: () => {},
        }),
      /ENOTFOUND/,
    );
    assert.equal(deviceFlowCalled, false, "must NOT fall back on unknown errors");
  });

  it("OFR_NO_BROWSER=1 env var skips the PKCE flow entirely", async () => {
    const original = process.env.OFR_NO_BROWSER;
    process.env.OFR_NO_BROWSER = "1";
    try {
      let pkceCalled = false;
      let deviceFlowCalled = false;
      const result = await resolveAuth({
        envConfig: { apiKey: null, apiBase },
        readCreds: () => null,
        writeCreds: () => {},
        cliAuthFlow: async () => {
          pkceCalled = true;
          return freshFromFlow;
        },
        deviceFlow: async () => {
          deviceFlowCalled = true;
          return freshFromFlow;
        },
        print: () => {},
      });
      assert.equal(pkceCalled, false);
      assert.equal(deviceFlowCalled, true);
      assert.equal(result.source, "device-flow");
    } finally {
      if (original === undefined) delete process.env.OFR_NO_BROWSER;
      else process.env.OFR_NO_BROWSER = original;
    }
  });
});
