/**
 * Copyright (c) 2025-2026 Andy Rockwell. All rights reserved.
 *
 * Tests for the RFC 8628 device-flow client.
 *
 * Strategy: stub fetch + sleep + print. Verify both the happy path and every
 * recoverable/non-recoverable branch. Sleep is a no-op so the suite runs in
 * milliseconds; we still assert the doubling on slow_down by inspecting the
 * sleep durations the client requested.
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import {
  runDeviceFlow,
  requestDeviceCode,
  pollOnce,
  printOnboardingMessage,
  DeviceFlowError,
  type DeviceCodeResponse,
} from "./onboarding.js";

// ============================================================================
// Test helpers
// ============================================================================

interface FakeResponse {
  status?: number;
  body?: unknown;
  rawBody?: string;
}

function makeFetch(replies: FakeResponse[]): { fetch: typeof fetch; calls: { url: string; body: unknown }[] } {
  const calls: { url: string; body: unknown }[] = [];
  let i = 0;
  const fakeFetch: typeof fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push({
      url,
      body: typeof init.body === "string" ? JSON.parse(init.body) : null,
    });
    const reply = replies[i++];
    if (!reply) {
      throw new Error(`fakeFetch: out of replies (call #${i} to ${url})`);
    }
    const status = reply.status ?? 200;
    const text = reply.rawBody ?? JSON.stringify(reply.body ?? {});
    return new Response(text, { status, headers: { "content-type": "application/json" } });
  };
  return { fetch: fakeFetch, calls };
}

function captureOutput(): { print: (line: string) => void; lines: string[] } {
  const lines: string[] = [];
  return { print: (line) => lines.push(line), lines };
}

const validDeviceCode: DeviceCodeResponse = {
  device_code: "DC_secret_long_string",
  user_code: "WXYZ-2345",
  verification_uri: "https://oldfamilyrecipe.com/device",
  verification_uri_complete: "https://oldfamilyrecipe.com/device?code=WXYZ-2345",
  expires_in: 600,
  interval: 5,
};

// ============================================================================
// requestDeviceCode
// ============================================================================

describe("requestDeviceCode", () => {
  it("POSTs to /device/code with client_name", async () => {
    const { fetch, calls } = makeFetch([{ body: validDeviceCode }]);
    await requestDeviceCode("https://api.test", fetch);
    assert.match(calls[0].url, /\/device\/code$/);
    assert.deepEqual(calls[0].body, { client_name: "@oldfamilyrecipe/mcp" });
  });

  it("returns the parsed device-code response on success", async () => {
    const { fetch } = makeFetch([{ body: validDeviceCode }]);
    const result = await requestDeviceCode("https://api.test", fetch);
    assert.equal(result.user_code, "WXYZ-2345");
    assert.equal(result.interval, 5);
    assert.equal(result.expires_in, 600);
  });

  it("throws DeviceFlowError on non-2xx with the status code in the message", async () => {
    const { fetch } = makeFetch([{ status: 503, body: { error: "down" } }]);
    await assert.rejects(
      () => requestDeviceCode("https://api.test", fetch),
      (err: unknown) => {
        assert.ok(err instanceof DeviceFlowError);
        assert.match(err.message, /503/);
        return true;
      },
    );
  });

  it("throws on a malformed response (missing fields)", async () => {
    const { fetch } = makeFetch([{ body: { device_code: "x" } }]);
    await assert.rejects(
      () => requestDeviceCode("https://api.test", fetch),
      /malformed/i,
    );
  });

  it("throws on a non-JSON response", async () => {
    const { fetch } = makeFetch([{ rawBody: "<html>oops</html>" }]);
    await assert.rejects(
      () => requestDeviceCode("https://api.test", fetch),
      /malformed/i,
    );
  });
});

// ============================================================================
// pollOnce
// ============================================================================

describe("pollOnce", () => {
  it("POSTs to /device/token with the device_code", async () => {
    const { fetch, calls } = makeFetch([{ body: { error: "authorization_pending" } }]);
    await pollOnce("https://api.test", fetch, "DC_xyz");
    assert.match(calls[0].url, /\/device\/token$/);
    assert.deepEqual(calls[0].body, { device_code: "DC_xyz" });
  });

  it("returns kind:pending on authorization_pending", async () => {
    const { fetch } = makeFetch([{ body: { error: "authorization_pending" } }]);
    const result = await pollOnce("https://api.test", fetch, "x");
    assert.deepEqual(result, { kind: "pending" });
  });

  it("returns kind:slow_down on slow_down", async () => {
    const { fetch } = makeFetch([{ body: { error: "slow_down" } }]);
    const result = await pollOnce("https://api.test", fetch, "x");
    assert.deepEqual(result, { kind: "slow_down" });
  });

  it("returns kind:expired on expired_token", async () => {
    const { fetch } = makeFetch([{ body: { error: "expired_token" } }]);
    const result = await pollOnce("https://api.test", fetch, "x");
    assert.deepEqual(result, { kind: "expired" });
  });

  it("returns kind:approved with the token + user_id", async () => {
    const { fetch } = makeFetch([
      {
        body: {
          access_token: "ofr_t1_secret",
          user_id: "u-123",
        },
      },
    ]);
    const result = await pollOnce("https://api.test", fetch, "x");
    assert.deepEqual(result, {
      kind: "approved",
      access_token: "ofr_t1_secret",
      user_id: "u-123",
    });
  });

  it("throws on non-2xx HTTP responses", async () => {
    const { fetch } = makeFetch([{ status: 500, body: { error: "boom" } }]);
    await assert.rejects(() => pollOnce("https://api.test", fetch, "x"));
  });

  it("throws on unknown error strings", async () => {
    const { fetch } = makeFetch([{ body: { error: "weird_thing" } }]);
    await assert.rejects(
      () => pollOnce("https://api.test", fetch, "x"),
      /weird_thing/,
    );
  });
});

// ============================================================================
// runDeviceFlow — full integration
// ============================================================================

describe("runDeviceFlow", () => {
  function makeSleepRecorder(): { sleep: (ms: number) => Promise<void>; durations: number[] } {
    const durations: number[] = [];
    return { sleep: async (ms) => { durations.push(ms); }, durations };
  }

  it("returns credentials immediately when /token approves on first poll", async () => {
    const { fetch } = makeFetch([
      { body: validDeviceCode },
      {
        body: {
          access_token: "ofr_t1_secret",
          user_id: "u-123",
        },
      },
    ]);
    const { print } = captureOutput();
    const { sleep } = makeSleepRecorder();

    const creds = await runDeviceFlow({
      apiBase: "https://api.test",
      print,
      sleep,
      fetchImpl: fetch,
    });

    assert.equal(creds.api_key, "ofr_t1_secret");
    assert.equal(creds.user_id, "u-123");
    assert.equal(creds.api_base, "https://api.test");
    assert.match(creds.created_at, /^\d{4}-\d{2}-\d{2}T/);
  });

  it("loops on authorization_pending and returns when subsequently approved", async () => {
    const { fetch } = makeFetch([
      { body: validDeviceCode },
      { body: { error: "authorization_pending" } },
      { body: { error: "authorization_pending" } },
      {
        body: {
          access_token: "ofr_t1_secret",
          user_id: "u-123",
        },
      },
    ]);
    const { print } = captureOutput();
    const { sleep, durations } = makeSleepRecorder();

    const creds = await runDeviceFlow({
      apiBase: "https://api.test",
      print,
      sleep,
      fetchImpl: fetch,
    });

    assert.equal(creds.api_key, "ofr_t1_secret");
    // Three sleeps (one per poll, including the final approving one).
    assert.equal(durations.length, 3);
    // All at the server-suggested interval (5s) since no slow_down.
    assert.ok(durations.every((d) => d === 5000), `expected all 5000ms, got ${durations.join(",")}`);
  });

  it("doubles the poll interval on slow_down (RFC 8628 backoff)", async () => {
    const { fetch } = makeFetch([
      { body: validDeviceCode },
      { body: { error: "slow_down" } },
      { body: { error: "slow_down" } },
      {
        body: {
          access_token: "ofr_t1_secret",
          user_id: "u-123",
        },
      },
    ]);
    const { print } = captureOutput();
    const { sleep, durations } = makeSleepRecorder();

    await runDeviceFlow({
      apiBase: "https://api.test",
      print,
      sleep,
      fetchImpl: fetch,
    });

    assert.equal(durations.length, 3);
    // Initial 5s, then 10s after first slow_down, then 20s after second.
    assert.deepEqual(durations, [5000, 10000, 20000]);
  });

  it("throws DeviceFlowError with restart guidance on expired_token", async () => {
    const { fetch } = makeFetch([
      { body: validDeviceCode },
      { body: { error: "expired_token" } },
    ]);
    const { print } = captureOutput();
    const { sleep } = makeSleepRecorder();

    await assert.rejects(
      () =>
        runDeviceFlow({
          apiBase: "https://api.test",
          print,
          sleep,
          fetchImpl: fetch,
        }),
      (err: unknown) => {
        assert.ok(err instanceof DeviceFlowError);
        assert.match(err.message, /expired/i);
        assert.match(err.message, /run the command again/i);
        return true;
      },
    );
  });

  it("throws DeviceFlowError on hard timeout (maxWaitSeconds exceeded)", async () => {
    // We use a sleep that advances real time imperceptibly but reports a
    // huge duration in our shadow clock so the timeout check trips.
    let virtualNowOffsetMs = 0;
    const sleep = async (ms: number) => { virtualNowOffsetMs += ms; };
    const realDateNow = Date.now;
    const start = realDateNow();
    Date.now = () => start + virtualNowOffsetMs;

    try {
      const { fetch } = makeFetch([
        { body: { ...validDeviceCode, expires_in: 10 } }, // 10s window
        { body: { error: "authorization_pending" } },
        { body: { error: "authorization_pending" } },
        { body: { error: "authorization_pending" } }, // never approved
      ]);
      const { print } = captureOutput();

      await assert.rejects(
        () =>
          runDeviceFlow({
            apiBase: "https://api.test",
            print,
            sleep,
            fetchImpl: fetch,
          }),
        /timed out/i,
      );
    } finally {
      Date.now = realDateNow;
    }
  });

  it("strips a trailing slash from apiBase before composing URLs", async () => {
    const { fetch, calls } = makeFetch([
      { body: validDeviceCode },
      {
        body: {
          access_token: "ofr_t1_secret",
          user_id: "u-123",
        },
      },
    ]);
    const { print } = captureOutput();
    const { sleep } = makeSleepRecorder();

    await runDeviceFlow({
      apiBase: "https://api.test/",
      print,
      sleep,
      fetchImpl: fetch,
    });

    assert.equal(calls[0].url, "https://api.test/device/code");
    assert.equal(calls[1].url, "https://api.test/device/token");
  });
});

// ============================================================================
// printOnboardingMessage
// ============================================================================

describe("printOnboardingMessage", () => {
  it("includes the user_code and verification URL in human-readable form", () => {
    const { print, lines } = captureOutput();
    printOnboardingMessage(print, validDeviceCode);
    const all = lines.join("\n");
    assert.match(all, /WXYZ-2345/);
    assert.match(all, /https:\/\/oldfamilyrecipe\.com\/device/);
    assert.match(all, /Old Family Recipe setup/);
    assert.match(all, /10 minutes/);
  });
});
