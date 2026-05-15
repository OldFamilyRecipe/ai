/**
 * Copyright (c) 2025-2026 Andy Rockwell. All rights reserved.
 *
 * Tests for src/config.ts — env-var-driven runtime config.
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import { strict as assert } from "node:assert";

import { configFromEnv, DEFAULT_API_BASE } from "./config.js";

describe("configFromEnv", () => {
  let savedKey: string | undefined;
  let savedUrl: string | undefined;

  beforeEach(() => {
    savedKey = process.env.OFR_API_KEY;
    savedUrl = process.env.OFR_API_URL;
    delete process.env.OFR_API_KEY;
    delete process.env.OFR_API_URL;
  });

  afterEach(() => {
    if (savedKey === undefined) delete process.env.OFR_API_KEY;
    else process.env.OFR_API_KEY = savedKey;
    if (savedUrl === undefined) delete process.env.OFR_API_URL;
    else process.env.OFR_API_URL = savedUrl;
  });

  it("returns null apiKey + DEFAULT_API_BASE when no env vars are set", () => {
    const config = configFromEnv();
    assert.equal(config.apiKey, null);
    assert.equal(config.apiBase, DEFAULT_API_BASE);
  });

  it("returns the OFR_API_KEY value verbatim when set", () => {
    process.env.OFR_API_KEY = "ofr_test_key_12345";
    const config = configFromEnv();
    assert.equal(config.apiKey, "ofr_test_key_12345");
  });

  it("returns OFR_API_URL when set, overriding the default", () => {
    process.env.OFR_API_URL = "https://staging.api.oldfamilyrecipe.com";
    const config = configFromEnv();
    assert.equal(config.apiBase, "https://staging.api.oldfamilyrecipe.com");
  });

  it("strips a single trailing slash from OFR_API_URL", () => {
    process.env.OFR_API_URL = "https://api.example.com/";
    const config = configFromEnv();
    assert.equal(config.apiBase, "https://api.example.com");
  });

  it("strips one trailing slash but leaves a path with a slash before it intact", () => {
    process.env.OFR_API_URL = "https://api.example.com/v1/";
    const config = configFromEnv();
    assert.equal(config.apiBase, "https://api.example.com/v1");
  });

  it("treats an empty OFR_API_KEY as the empty string (not null)", () => {
    process.env.OFR_API_KEY = "";
    const config = configFromEnv();
    assert.equal(config.apiKey, "");
  });
});

describe("DEFAULT_API_BASE", () => {
  it("points at the production API host with no trailing slash", () => {
    assert.equal(DEFAULT_API_BASE, "https://api.oldfamilyrecipe.com");
    assert.ok(!DEFAULT_API_BASE.endsWith("/"), "DEFAULT_API_BASE should not have a trailing slash");
  });
});
