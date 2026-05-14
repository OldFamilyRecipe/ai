/**
 * Copyright (c) 2025-2026 Andy Rockwell. All rights reserved.
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, statSync, existsSync, readdirSync } from "node:fs";
import { tmpdir, platform } from "node:os";
import { join } from "node:path";

import {
  credentialsDir,
  credentialsPath,
  readCredentials,
  writeCredentials,
  type StoredCredentials,
} from "./credentials.js";

const validCreds: StoredCredentials = {
  api_key: "ofr_secret",
  api_base: "https://api.oldfamilyrecipe.com",
  user_id: "u-cognito-sub-123",
  created_at: "2026-05-13T01:00:00Z",
};

describe("credentialsDir", () => {
  const originalConfigDir = process.env.OFR_CONFIG_DIR;
  const originalXdg = process.env.XDG_CONFIG_HOME;
  const originalAppdata = process.env.APPDATA;

  afterEach(() => {
    if (originalConfigDir === undefined) delete process.env.OFR_CONFIG_DIR;
    else process.env.OFR_CONFIG_DIR = originalConfigDir;
    if (originalXdg === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = originalXdg;
    if (originalAppdata === undefined) delete process.env.APPDATA;
    else process.env.APPDATA = originalAppdata;
  });

  it("honors OFR_CONFIG_DIR override above everything else", () => {
    process.env.OFR_CONFIG_DIR = "/tmp/test-override";
    process.env.XDG_CONFIG_HOME = "/should/be/ignored";
    assert.equal(credentialsDir(), "/tmp/test-override");
  });

  it("uses $XDG_CONFIG_HOME/oldfamilyrecipe when set on POSIX", () => {
    if (platform() === "win32") return;
    delete process.env.OFR_CONFIG_DIR;
    process.env.XDG_CONFIG_HOME = "/custom/xdg";
    assert.equal(credentialsDir(), "/custom/xdg/oldfamilyrecipe");
  });

  it("falls back to ~/.config/oldfamilyrecipe on POSIX when XDG_CONFIG_HOME is unset", () => {
    if (platform() === "win32") return;
    delete process.env.OFR_CONFIG_DIR;
    delete process.env.XDG_CONFIG_HOME;
    const dir = credentialsDir();
    assert.match(dir, /\/\.config\/oldfamilyrecipe$/);
  });
});

describe("credentialsPath", () => {
  it("appends credentials.json to credentialsDir()", () => {
    const original = process.env.OFR_CONFIG_DIR;
    process.env.OFR_CONFIG_DIR = "/tmp/path-test";
    try {
      assert.equal(credentialsPath(), "/tmp/path-test/credentials.json");
    } finally {
      if (original === undefined) delete process.env.OFR_CONFIG_DIR;
      else process.env.OFR_CONFIG_DIR = original;
    }
  });
});

describe("readCredentials and writeCredentials — round trip", () => {
  let tmpDir: string;
  const originalConfigDir = process.env.OFR_CONFIG_DIR;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "ofr-creds-test-"));
    process.env.OFR_CONFIG_DIR = tmpDir;
  });

  afterEach(() => {
    if (originalConfigDir === undefined) delete process.env.OFR_CONFIG_DIR;
    else process.env.OFR_CONFIG_DIR = originalConfigDir;
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("readCredentials", () => {
    it("returns null when the file does not exist", () => {
      assert.equal(readCredentials(), null);
    });

    it("returns null on malformed JSON without throwing", () => {
      writeFileSync(credentialsPath(), "{not json");
      assert.equal(readCredentials(), null);
    });

    it("returns null on JSON missing required fields", () => {
      writeFileSync(credentialsPath(), JSON.stringify({ api_key: "ofr_t1" }));
      assert.equal(readCredentials(), null);
    });

    it("returns null on JSON with empty-string fields", () => {
      writeFileSync(
        credentialsPath(),
        JSON.stringify({ ...validCreds, api_key: "" }),
      );
      assert.equal(readCredentials(), null);
    });

    it("returns the parsed credentials on a valid file", () => {
      writeFileSync(credentialsPath(), JSON.stringify(validCreds));
      const got = readCredentials();
      assert.deepEqual(got, validCreds);
    });
  });

  describe("writeCredentials", () => {
    it("creates the parent directory if missing", () => {
      writeCredentials(validCreds);
      assert.ok(existsSync(credentialsPath()));
    });

    it("writes valid JSON that round-trips through readCredentials", () => {
      writeCredentials(validCreds);
      const roundTripped = readCredentials();
      assert.deepEqual(roundTripped, validCreds);
    });

    it("writes the file with mode 0o600 on POSIX (owner-only)", () => {
      if (platform() === "win32") return;
      writeCredentials(validCreds);
      const mode = statSync(credentialsPath()).mode & 0o777;
      assert.equal(mode, 0o600, `expected 0o600, got ${mode.toString(8)}`);
    });

    it("overwrites an existing file rather than failing", () => {
      writeCredentials(validCreds);
      writeCredentials({ ...validCreds, api_key: "ofr_rotated" });
      const got = readCredentials();
      assert.equal(got?.api_key, "ofr_rotated");
    });

    it("does not leave behind .tmp files after a successful write", () => {
      writeCredentials(validCreds);
      const entries = readdirSync(credentialsDir());
      const tmps = entries.filter((e) => e.includes(".tmp-"));
      assert.equal(tmps.length, 0, `tmp file left behind: ${tmps.join(", ")}`);
    });

    it("rejects writes with missing required fields (defensive — TS prevents it but runtime guards too)", () => {
      assert.throws(
        () =>
          writeCredentials({
            api_key: "",
            api_base: "x",
            user_id: "x",
            created_at: "x",
          }),
        /missing required fields/i,
      );
    });

    it("written JSON content is human-readable (indented, valid JSON)", () => {
      writeCredentials(validCreds);
      const raw = readFileSync(credentialsPath(), "utf8");
      assert.match(raw, /\n/, "should be multi-line");
      // Should parse cleanly.
      const parsed = JSON.parse(raw);
      assert.equal(parsed.api_key, validCreds.api_key);
    });
  });
});
