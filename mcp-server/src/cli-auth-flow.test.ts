/**
 * Copyright (c) 2025-2026 Andy Rockwell. All rights reserved.
 *
 * Tests for the PKCE + localhost CLI auth flow.
 *
 * Strategy: bind a real localhost server (cheap, deterministic), drive the
 * "browser" via an injected openBrowser stub that POSTs the redirect to the
 * listener, mock the token-exchange fetch. Exercises the full happy path
 * + error branches without touching network or DDB.
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";

import {
  runCliAuthFlow,
  generateCodeVerifier,
  deriveCodeChallenge,
  generateState,
  bindLocalServer,
  CliAuthFlowError,
  defaultDeviceLabel,
} from "./cli-auth-flow.js";

// Tests use `fetch()` which uses Node's bundled undici under the hood. Undici
// keeps an idle keep-alive socket pool that prevents the event loop from
// exiting cleanly even after every test passes. Run with --test-force-exit
// in package.json to call process.exit(0) after the suite completes; the
// pool is irrelevant once we're done with assertions.

// ============================================================================
// PKCE primitives
// ============================================================================

describe("generateCodeVerifier", () => {
  it("returns a 43-char base64url string (256 bits of entropy)", () => {
    const v = generateCodeVerifier();
    assert.equal(v.length, 43);
    assert.match(v, /^[A-Za-z0-9\-_]+$/);
  });

  it("yields a different value each call", () => {
    const a = generateCodeVerifier();
    const b = generateCodeVerifier();
    assert.notEqual(a, b);
  });
});

describe("deriveCodeChallenge", () => {
  it("matches base64url(sha256(verifier))", () => {
    const v = "abc123";
    const expected = createHash("sha256").update(v).digest("base64url");
    assert.equal(deriveCodeChallenge(v), expected);
  });

  it("is deterministic for the same verifier", () => {
    const v = generateCodeVerifier();
    assert.equal(deriveCodeChallenge(v), deriveCodeChallenge(v));
  });
});

describe("generateState", () => {
  it("returns a base64url string", () => {
    const s = generateState();
    assert.match(s, /^[A-Za-z0-9\-_]+$/);
    assert.ok(s.length >= 16);
  });
});

describe("defaultDeviceLabel", () => {
  it("returns a non-empty descriptive string", () => {
    const label = defaultDeviceLabel();
    assert.ok(label.length > 0);
    assert.match(label, /OFR CLI on /);
  });
});

// ============================================================================
// bindLocalServer — happy path + cleanup
// ============================================================================

describe("bindLocalServer", () => {
  it("binds to a random localhost port and resolves with the port number", async () => {
    const { server, port } = await bindLocalServer();
    assert.ok(port > 1024 && port < 65536, `port out of range: ${port}`);
    assert.equal(server.listening, true);
    server.closeAllConnections();
    server.close();
  });

  it("listener resolves when /?code=...&state=... arrives", async () => {
    const { server, port, listener } = await bindLocalServer();
    const result = listener({ timeoutMs: 2000 });
    // Simulate browser hitting the callback
    await fetch(`http://127.0.0.1:${port}/?code=ABC&state=xyz`).then((r) => r.text());
    const got = await result;
    assert.deepEqual(got, { code: "ABC", state: "xyz" });
    server.closeAllConnections();
    server.close();
  });

  it("listener rejects when callback omits code or state", async () => {
    const { server, port, listener } = await bindLocalServer();
    const result = listener({ timeoutMs: 2000 });
    // Attach a no-op catch immediately so the rejection isn't briefly seen
    // as "unhandled" between the request firing and assert.rejects awaiting.
    // assert.rejects below still observes the original rejection.
    result.catch(() => { /* swallowed; assert.rejects re-asserts */ });
    await fetch(`http://127.0.0.1:${port}/?code=ABC`).then((r) => r.text());
    await assert.rejects(result, (err: unknown) => {
      assert.ok(err instanceof CliAuthFlowError);
      assert.equal(err.code, "callback_error");
      return true;
    });
    server.closeAllConnections();
    server.close();
  });

  it("listener rejects when callback contains an error parameter", async () => {
    const { server, port, listener } = await bindLocalServer();
    const result = listener({ timeoutMs: 2000 });
    result.catch(() => { /* see comment in previous test */ });
    await fetch(`http://127.0.0.1:${port}/?error=access_denied`).then((r) => r.text());
    await assert.rejects(result, (err: unknown) => {
      assert.ok(err instanceof CliAuthFlowError);
      assert.equal(err.code, "callback_error");
      return true;
    });
    server.closeAllConnections();
    server.close();
  });

  it("listener rejects on timeout", async () => {
    const { server, listener } = await bindLocalServer();
    const result = listener({ timeoutMs: 50 });
    await assert.rejects(result, (err: unknown) => {
      assert.ok(err instanceof CliAuthFlowError);
      assert.equal(err.code, "timeout");
      return true;
    });
    server.closeAllConnections();
    server.close();
  });

  it("returns 404 for non-root paths", async () => {
    const { server, port } = await bindLocalServer();
    const res = await fetch(`http://127.0.0.1:${port}/evil-path`);
    assert.equal(res.status, 404);
    server.closeAllConnections();
    server.close();
  });
});

// ============================================================================
// runCliAuthFlow — full happy path with stubbed browser + fetch
// ============================================================================

describe("runCliAuthFlow", () => {
  it("completes happy path: opens browser → catches redirect → exchanges → returns API key", async () => {
    let capturedUrl = "";
    let capturedCode = "";
    let capturedVerifier = "";

    const lines: string[] = [];

    const result = await runCliAuthFlow({
      apiBase: "https://api.example.test",
      dashboardUrl: "https://oldfamilyrecipe.example.test",
      print: (l) => lines.push(l),
      openBrowser: async (url) => {
        capturedUrl = url;
        // Simulate the dashboard redirecting to the CLI's localhost listener
        // a moment after the browser opens.
        const parsed = new URL(url);
        const challenge = parsed.searchParams.get("code_challenge")!;
        const state = parsed.searchParams.get("state")!;
        const redirectUri = parsed.searchParams.get("redirect_uri")!;
        capturedCode = "test-auth-code-" + challenge.slice(0, 6);
        // Fire the redirect off the event loop so the listener promise is
        // already pending when it arrives.
        setTimeout(() => {
          fetch(`${redirectUri}/?code=${capturedCode}&state=${state}`).catch(() => {});
        }, 10);
      },
      fetchImpl: (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.endsWith("/cli-auth/token")) {
          const body = JSON.parse(init?.body as string);
          capturedVerifier = body.code_verifier;
          // Verify the server would see a matching challenge
          const computedChallenge = createHash("sha256")
            .update(capturedVerifier)
            .digest("base64url");
          const sentChallenge = new URL(capturedUrl).searchParams.get("code_challenge");
          assert.equal(computedChallenge, sentChallenge, "verifier must hash to challenge");
          assert.equal(body.code, capturedCode, "code must be the one we sent");
          return new Response(
            JSON.stringify({
              api_key: "ofr_FAKEKEY",
              user_id: "u-test",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        throw new Error(`unexpected fetch ${url}`);
      }) as typeof fetch,
    });

    assert.equal(result.api_key, "ofr_FAKEKEY");
    assert.equal(result.user_id, "u-test");
    assert.equal(result.api_base, "https://api.example.test");
    assert.ok(result.created_at);

    // The browser was actually invoked
    assert.ok(capturedUrl.startsWith("https://oldfamilyrecipe.example.test/cli-auth?"));
    // The verifier was actually generated and used
    assert.equal(capturedVerifier.length, 43);
  });

  it("throws state_mismatch when the redirect echoes a different state (CSRF defense)", async () => {
    await assert.rejects(
      runCliAuthFlow({
        apiBase: "https://api.example.test",
        dashboardUrl: "https://oldfamilyrecipe.example.test",
        print: () => {},
        openBrowser: async (url) => {
          const parsed = new URL(url);
          const redirectUri = parsed.searchParams.get("redirect_uri")!;
          // Send a DIFFERENT state from what was requested — simulates an
          // attacker injecting a forged callback.
          setTimeout(() => {
            fetch(`${redirectUri}/?code=ABC&state=ATTACKER-STATE`).catch(() => {});
          }, 10);
        },
        fetchImpl: (async () => new Response("", { status: 200 })) as typeof fetch,
      }),
      (err: unknown) => {
        assert.ok(err instanceof CliAuthFlowError);
        assert.equal(err.code, "state_mismatch");
        return true;
      },
    );
  });

  it("throws browser_open_failed when openBrowser rejects", async () => {
    await assert.rejects(
      runCliAuthFlow({
        apiBase: "https://api.example.test",
        dashboardUrl: "https://oldfamilyrecipe.example.test",
        print: () => {},
        openBrowser: async () => { throw new Error("no display"); },
        fetchImpl: (async () => new Response()) as typeof fetch,
      }),
      (err: unknown) => {
        assert.ok(err instanceof CliAuthFlowError);
        assert.equal(err.code, "browser_open_failed");
        return true;
      },
    );
  });

  it("throws exchange_failed when token endpoint returns non-OK", async () => {
    await assert.rejects(
      runCliAuthFlow({
        apiBase: "https://api.example.test",
        dashboardUrl: "https://oldfamilyrecipe.example.test",
        print: () => {},
        openBrowser: async (url) => {
          const parsed = new URL(url);
          const state = parsed.searchParams.get("state")!;
          const redirectUri = parsed.searchParams.get("redirect_uri")!;
          setTimeout(() => {
            fetch(`${redirectUri}/?code=ABC&state=${state}`).catch(() => {});
          }, 10);
        },
        fetchImpl: (async () =>
          new Response('{"error":"invalid_grant"}', { status: 400 })) as typeof fetch,
      }),
      (err: unknown) => {
        assert.ok(err instanceof CliAuthFlowError);
        assert.equal(err.code, "exchange_failed");
        return true;
      },
    );
  });

  it("throws timeout when no callback arrives", async () => {
    await assert.rejects(
      runCliAuthFlow({
        apiBase: "https://api.example.test",
        dashboardUrl: "https://oldfamilyrecipe.example.test",
        print: () => {},
        openBrowser: async () => { /* never fires the callback */ },
        fetchImpl: (async () => new Response()) as typeof fetch,
        timeoutMs: 50,
      }),
      (err: unknown) => {
        assert.ok(err instanceof CliAuthFlowError);
        assert.equal(err.code, "timeout");
        return true;
      },
    );
  });
});
