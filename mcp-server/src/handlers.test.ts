/**
 * Tests for the MCP handler → API wire format. We mock global fetch
 * so each test can assert the EXACT path, method, and body the MCP
 * server would send to the OFR API. The pre-2026-04-30 bugs were:
 *
 *   - family_invite called POST /family/invitations    (real route: POST /family/invite)
 *   - meal_plan_update called POST /meal-plans         (real route: PUT /meal-plans)
 *   - meal_plan_update sent {week, meals}              (real shape: {mealPlans: {week_id: slots}})
 *   - shopping_list called GET /meal-plans/shopping-list (real route: doesn't exist — tool removed)
 *
 * Runner: `node:test` + tsx (NOT Jest).
 *   npx tsx --test src/handlers.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  handleFamilyInvite,
  handleFamilyTree,
  handleMealPlanUpdate,
  handleMealPlanGet,
  handleSageMealPlan,
  handleRecipeImportImage,
  currentWeekIdSundayLocal,
  normalizeMealSlot,
  normalizeRelationship,
  sageMealPlanToSlots,
} from "./handlers.js";

interface RecordedCall {
  url: string;
  method: string;
  body: unknown;
  headers: Record<string, string>;
}

function installFetchMock(response: { status: number; jsonBody: unknown }): {
  calls: RecordedCall[];
  restore: () => void;
} {
  const calls: RecordedCall[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: unknown, init?: { method?: string; body?: string; headers?: Record<string, string> }) => {
    const url = typeof input === "string" ? input : String(input);
    calls.push({
      url,
      method: init?.method ?? "GET",
      body: init?.body ? JSON.parse(init.body) : undefined,
      headers: init?.headers ?? {},
    });
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      json: async () => response.jsonBody,
    } as unknown as Response;
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

const cfg = { apiKey: "ofr_test_key", apiBase: "https://api.example.com" };

// --- family_invite --------------------------------------------------------

test("family_invite calls POST /family/invite (singular, not /family/invitations)", async () => {
  const { calls, restore } = installFetchMock({ status: 201, jsonBody: { ok: true } });
  try {
    const res = await handleFamilyInvite({ email: "uncle@example.com", role: "viewer" }, cfg);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].url, "https://api.example.com/family/invite");
    assert.strictEqual(calls[0].method, "POST");
    assert.deepStrictEqual(calls[0].body, { email: "uncle@example.com", role: "viewer" });
    assert.ok(!res.isError, "successful invite should not be an error");
  } finally {
    restore();
  }
});

test("family_invite defaults role to viewer (a valid backend role, not 'member')", async () => {
  const { calls, restore } = installFetchMock({ status: 201, jsonBody: { ok: true } });
  try {
    await handleFamilyInvite({ email: "aunt@example.com" }, cfg);
    assert.deepStrictEqual(calls[0].body, { email: "aunt@example.com", role: "viewer" });
  } finally {
    restore();
  }
});

test("family_invite returns isError when email is missing (no API call)", async () => {
  const { calls, restore } = installFetchMock({ status: 200, jsonBody: {} });
  try {
    const res = await handleFamilyInvite({}, cfg);
    assert.strictEqual(calls.length, 0);
    assert.strictEqual(res.isError, true);
  } finally {
    restore();
  }
});

// --- family_invite relationship parity (consumer PR #677, 2026-05-03) -----

// PR #677 in solidphp/oldfamilyrecipe added an optional `relationship`
// field on POST /family/invite (sister/spouse/cousin/… or free text up
// to 40 chars). The MCP tool must forward it when provided AND omit it
// when absent so older API revisions don't choke on a stray field.

test("family_invite forwards `relationship` when provided", async () => {
  const { calls, restore } = installFetchMock({ status: 201, jsonBody: { ok: true } });
  try {
    await handleFamilyInvite(
      { email: "sister@example.com", role: "editor", relationship: "sister" },
      cfg
    );
    assert.deepStrictEqual(calls[0].body, {
      email: "sister@example.com",
      role: "editor",
      relationship: "sister",
    });
  } finally {
    restore();
  }
});

test("family_invite OMITS `relationship` from body when absent (not null/undefined wire field)", async () => {
  const { calls, restore } = installFetchMock({ status: 201, jsonBody: { ok: true } });
  try {
    await handleFamilyInvite({ email: "uncle@example.com", role: "viewer" }, cfg);
    const body = calls[0].body as Record<string, unknown>;
    assert.deepStrictEqual(body, { email: "uncle@example.com", role: "viewer" });
    assert.ok(!("relationship" in body), "absent relationship must not appear in wire body at all");
  } finally {
    restore();
  }
});

test("family_invite trims + length-caps free-text relationship at 40 chars", async () => {
  const { calls, restore } = installFetchMock({ status: 201, jsonBody: { ok: true } });
  try {
    const long = "  great-great-great-great-great-great-grandmother-in-law  ";
    await handleFamilyInvite({ email: "x@y.com", role: "viewer", relationship: long }, cfg);
    const body = calls[0].body as { relationship: string };
    assert.strictEqual(body.relationship.length, 40, "must be capped at 40 to match DB column");
    assert.strictEqual(body.relationship, "great-great-great-great-great-great-gran");
  } finally {
    restore();
  }
});

test("family_invite drops empty / whitespace-only relationship (omits from body)", async () => {
  const { calls, restore } = installFetchMock({ status: 201, jsonBody: { ok: true } });
  try {
    await handleFamilyInvite({ email: "a@b.com", role: "viewer", relationship: "   " }, cfg);
    const body = calls[0].body as Record<string, unknown>;
    assert.ok(!("relationship" in body));
  } finally {
    restore();
  }
});

test("family_invite success message mentions relationship when sent", async () => {
  const { restore } = installFetchMock({ status: 201, jsonBody: { ok: true } });
  try {
    const res = await handleFamilyInvite(
      { email: "cousin@example.com", role: "viewer", relationship: "cousin" },
      cfg
    );
    assert.ok(!res.isError);
    assert.ok(res.content[0].text.toLowerCase().includes("cousin"));
  } finally {
    restore();
  }
});

test("normalizeRelationship coerces non-string and empty inputs to undefined", () => {
  assert.strictEqual(normalizeRelationship(undefined), undefined);
  assert.strictEqual(normalizeRelationship(null), undefined);
  assert.strictEqual(normalizeRelationship(123), undefined);
  assert.strictEqual(normalizeRelationship(""), undefined);
  assert.strictEqual(normalizeRelationship("   "), undefined);
});

test("normalizeRelationship trims + caps at 40", () => {
  assert.strictEqual(normalizeRelationship("  sister  "), "sister");
  assert.strictEqual(normalizeRelationship("a".repeat(50))?.length, 40);
});

// --- family_tree (added 2026-05-03 for protocol parity) -------------------

test("family_tree calls GET /family/tree (no body, no query params)", async () => {
  const { calls, restore } = installFetchMock({
    status: 200,
    jsonBody: { rootUserId: "u1", tenantName: "Rockwell Family", nodes: [] },
  });
  try {
    await handleFamilyTree({}, cfg);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].url, "https://api.example.com/family/tree");
    assert.strictEqual(calls[0].method, "GET");
    assert.strictEqual(calls[0].body, undefined, "tree fetch sends no request body");
  } finally {
    restore();
  }
});

test("family_tree surfaces `relationshipToInviter` for each node + handles null gracefully", async () => {
  const { restore } = installFetchMock({
    status: 200,
    jsonBody: {
      rootUserId: "u1",
      tenantName: "Rockwell Family",
      nodes: [
        {
          userId: "u1",
          name: "Andy",
          email: "andy@example.com",
          role: "owner",
          joinedAt: "2026-01-01T00:00:00Z",
          invitedBy: null,
          relationshipToInviter: null, // root never has a relationship
        },
        {
          userId: "u2",
          name: "Maggie",
          email: "maggie@example.com",
          role: "editor",
          joinedAt: "2026-05-03T00:00:00Z",
          invitedBy: "u1",
          relationshipToInviter: "sister",
        },
        {
          userId: "u3",
          name: "Legacy User",
          email: "legacy@example.com",
          role: "viewer",
          joinedAt: "2026-02-01T00:00:00Z",
          invitedBy: "u1",
          relationshipToInviter: null, // legacy pre-026 user
        },
      ],
    },
  });
  try {
    const res = await handleFamilyTree({}, cfg);
    assert.ok(!res.isError);
    const txt = res.content[0].text;
    assert.ok(txt.includes("Maggie"), "renders node names");
    assert.ok(txt.includes("sister"), "surfaces relationshipToInviter when present");
    assert.ok(txt.includes("Legacy User"), "renders legacy users with null relationship");
    assert.ok(!txt.includes("null"), "must not render the literal string 'null' for missing relationship");
    assert.ok(!txt.includes("as null"), "must not say 'as null'");
    assert.ok(txt.includes("Rockwell Family"), "includes tenant name");
  } finally {
    restore();
  }
});

test("family_tree returns friendly message when nodes array is empty", async () => {
  const { restore } = installFetchMock({
    status: 200,
    jsonBody: { rootUserId: null, tenantName: "", nodes: [] },
  });
  try {
    const res = await handleFamilyTree({}, cfg);
    assert.ok(!res.isError);
    assert.ok(res.content[0].text.toLowerCase().includes("no family tree"));
  } finally {
    restore();
  }
});

test("family_tree returns isError on backend failure (e.g. 401)", async () => {
  const { restore } = installFetchMock({ status: 401, jsonBody: { error: "Unauthorized" } });
  try {
    const res = await handleFamilyTree({}, cfg);
    assert.strictEqual(res.isError, true);
    assert.ok(res.content[0].text.includes("401"));
  } finally {
    restore();
  }
});

// --- meal_plan_update -----------------------------------------------------

test("meal_plan_update calls PUT /meal-plans (not POST)", async () => {
  const { calls, restore } = installFetchMock({ status: 200, jsonBody: { ok: true, updated: ["2026-04-27"] } });
  try {
    await handleMealPlanUpdate(
      { week: "2026-04-27", meals: { "2026-04-27-0-Dinner": { day: 0, type: "Dinner", recipeId: "r1" } } },
      cfg
    );
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].url, "https://api.example.com/meal-plans");
    assert.strictEqual(calls[0].method, "PUT");
  } finally {
    restore();
  }
});

test("meal_plan_update wraps {week, meals} into {mealPlans: {<week>: meals}} envelope", async () => {
  const { calls, restore } = installFetchMock({ status: 200, jsonBody: { ok: true, updated: ["2026-04-27"] } });
  try {
    await handleMealPlanUpdate(
      { week: "2026-04-27", meals: { "2026-04-27-0-Dinner": { day: 0, type: "Dinner", recipeId: "r1" } } },
      cfg
    );
    assert.deepStrictEqual(calls[0].body, {
      mealPlans: {
        "2026-04-27": { "2026-04-27-0-Dinner": { day: 0, type: "Dinner", recipeId: "r1" } },
      },
    });
  } finally {
    restore();
  }
});

test("meal_plan_update passes pre-shaped mealPlans envelope through unchanged", async () => {
  const { calls, restore } = installFetchMock({ status: 200, jsonBody: { ok: true, updated: ["2026-04-27", "2026-05-04"] } });
  try {
    const mealPlans = {
      "2026-04-27": { "2026-04-27-1-Lunch": { day: 1, type: "Lunch" } },
      "2026-05-04": {},
    };
    await handleMealPlanUpdate({ mealPlans }, cfg);
    assert.deepStrictEqual(calls[0].body, { mealPlans });
  } finally {
    restore();
  }
});

test("meal_plan_update returns isError + no API call when neither shape is supplied", async () => {
  const { calls, restore } = installFetchMock({ status: 200, jsonBody: {} });
  try {
    const res = await handleMealPlanUpdate({}, cfg);
    assert.strictEqual(calls.length, 0);
    assert.strictEqual(res.isError, true);
  } finally {
    restore();
  }
});

// --- meal_plan_update normalization (regression: 2026-05-02) -------------

// Backend rejects with 400 if `day` isn't an int 0-6 OR if `type` isn't
// one of "Breakfast"/"Lunch"/"Dinner"/"Snack" (capitalized). AI clients
// reliably emit the human-friendly forms first try. Normalization saves
// a 400 round-trip.

test("normalizeMealSlot maps weekday names to 0-6 int", () => {
  assert.strictEqual(normalizeMealSlot({ day: "Sunday", type: "Dinner" }).day, 0);
  assert.strictEqual(normalizeMealSlot({ day: "monday", type: "Dinner" }).day, 1);
  assert.strictEqual(normalizeMealSlot({ day: "Tue", type: "Dinner" }).day, 2);
  assert.strictEqual(normalizeMealSlot({ day: "wednesday", type: "Dinner" }).day, 3);
  assert.strictEqual(normalizeMealSlot({ day: "THURS", type: "Dinner" }).day, 4);
  assert.strictEqual(normalizeMealSlot({ day: "Friday", type: "Dinner" }).day, 5);
  assert.strictEqual(normalizeMealSlot({ day: "sat", type: "Dinner" }).day, 6);
});

test("normalizeMealSlot canonicalizes meal type case + dialect aliases", () => {
  assert.strictEqual(normalizeMealSlot({ day: 1, type: "lunch" }).type, "Lunch");
  assert.strictEqual(normalizeMealSlot({ day: 1, type: "DINNER" }).type, "Dinner");
  assert.strictEqual(normalizeMealSlot({ day: 1, type: "supper" }).type, "Dinner"); // dialect → canonical
  assert.strictEqual(normalizeMealSlot({ day: 1, type: "snack" }).type, "Snack");
});

test("normalizeMealSlot leaves valid int day + capitalized type untouched", () => {
  const slot = { day: 3, type: "Breakfast", recipeId: "abc" };
  assert.deepStrictEqual(normalizeMealSlot(slot), slot);
});

test("normalizeMealSlot leaves unknown values alone (so backend can return its own error)", () => {
  // Don't silently coerce gibberish — backend's "Invalid day: must be 0-6"
  // is a clearer signal to the AI than a wrong-but-valid integer.
  assert.strictEqual(normalizeMealSlot({ day: "Mardi", type: "Dinner" }).day, "Mardi"); // French
  assert.strictEqual(normalizeMealSlot({ day: 1, type: "elevenses" }).type, "elevenses");
});

test("meal_plan_update normalizes slot fields before sending PUT body", async () => {
  const { calls, restore } = installFetchMock({ status: 200, jsonBody: { ok: true, updated: ["2026-04-26"] } });
  try {
    await handleMealPlanUpdate(
      {
        week: "2026-04-26",
        meals: {
          "slot-a": { day: "Monday", type: "lunch", recipeId: "r1" },
          "slot-b": { day: "tue", type: "DINNER", recipeId: "r2" },
        },
      },
      cfg
    );
    const body = calls[0].body as { mealPlans: Record<string, Record<string, { day: number; type: string }>> };
    assert.deepStrictEqual(body.mealPlans["2026-04-26"]["slot-a"], { day: 1, type: "Lunch", recipeId: "r1" });
    assert.deepStrictEqual(body.mealPlans["2026-04-26"]["slot-b"], { day: 2, type: "Dinner", recipeId: "r2" });
  } finally {
    restore();
  }
});

test("meal_plan_update normalization works on the multi-week mealPlans envelope too", async () => {
  const { calls, restore } = installFetchMock({ status: 200, jsonBody: { ok: true, updated: [] } });
  try {
    await handleMealPlanUpdate(
      {
        mealPlans: {
          "2026-04-26": { "x": { day: "Sunday", type: "snack" } },
          "2026-05-03": { "y": { day: "Sat", type: "Lunch" } }, // partially canonical
        },
      },
      cfg
    );
    const body = calls[0].body as { mealPlans: Record<string, Record<string, { day: number; type: string }>> };
    assert.strictEqual(body.mealPlans["2026-04-26"]["x"].day, 0);
    assert.strictEqual(body.mealPlans["2026-04-26"]["x"].type, "Snack");
    assert.strictEqual(body.mealPlans["2026-05-03"]["y"].day, 6);
    assert.strictEqual(body.mealPlans["2026-05-03"]["y"].type, "Lunch");
  } finally {
    restore();
  }
});

// --- meal_plan_get --------------------------------------------------------

test("meal_plan_get calls GET /meal-plans without a query param (backend ignores week)", async () => {
  const { calls, restore } = installFetchMock({
    status: 200,
    jsonBody: { mealPlans: { "2026-04-27": { "2026-04-27-0-Dinner": { day: 0, type: "Dinner" } } } },
  });
  try {
    await handleMealPlanGet({ week: "2026-04-27" }, cfg);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].url, "https://api.example.com/meal-plans");
    assert.strictEqual(calls[0].method, "GET");
  } finally {
    restore();
  }
});

test("meal_plan_get reads from the plural `mealPlans` field in the response", async () => {
  const { restore } = installFetchMock({
    status: 200,
    jsonBody: { mealPlans: { "2026-04-27": { "2026-04-27-0-Dinner": { day: 0, type: "Dinner" } } } },
  });
  try {
    const res = await handleMealPlanGet({ week: "2026-04-27" }, cfg);
    assert.ok(!res.isError);
    const txt = res.content[0].text;
    assert.ok(txt.includes("Dinner"), `expected response to mention 'Dinner', got: ${txt}`);
  } finally {
    restore();
  }
});

test("meal_plan_get reports 'no meal plans saved' when response is empty", async () => {
  const { restore } = installFetchMock({ status: 200, jsonBody: { mealPlans: {} } });
  try {
    const res = await handleMealPlanGet({}, cfg);
    assert.ok(res.content[0].text.toLowerCase().includes("no meal plans"));
  } finally {
    restore();
  }
});

// --- recipe_import_image (regression: hollow-recipe detection) -----------

// Backend always saves a recipe row even when Vision couldn't extract any
// text (intentional for the web uploader's photo-first flow — see
// infrastructure/import-image-handler.ts:741-755). For MCP callers, that
// silently pollutes the cookbook with empty recipes AND consumes Sage
// quota with no error feedback. This test ensures the MCP tool surfaces
// the empty-state to the AI so it can apologize / re-try.

import { writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { join } from "node:path";

// validateImagePath in image-validation.ts requires the resolved path to
// be inside $HOME or process.cwd(). On macOS, os.tmpdir() returns
// /var/folders/... which fails containment, so use a tmp dir under cwd
// (mcp-server/) to keep the validator happy.
const TEST_TMP_DIR = join(process.cwd(), ".test-tmp");
try { mkdirSync(TEST_TMP_DIR, { recursive: true }); } catch { /* ignore */ }

test("recipe_import_image surfaces empty-recipe state when Vision returned no ingredients/instructions", async () => {
  const tmpPath = join(TEST_TMP_DIR, `audie-import-empty-${Date.now()}.jpeg`);
  // 4 bytes of FF D8 FF E0 — JPEG magic-byte prefix sufficient for sniff.
  writeFileSync(tmpPath, Buffer.from([0xff, 0xd8, 0xff, 0xe0]));
  const { restore } = installFetchMock({
    status: 200,
    jsonBody: { id: "rec_abc", title: "Imported Recipe", ingredients: [], instructions: [] },
  });
  try {
    const res = await handleRecipeImportImage({ image_path: tmpPath }, cfg);
    assert.strictEqual(res.isError, true, "empty-state should be flagged isError so the AI doesn't celebrate");
    const txt = res.content[0].text;
    assert.ok(txt.includes("couldn't extract"), `expected empty-state copy, got: ${txt}`);
    assert.ok(txt.includes("rec_abc"), "should mention the empty recipe ID so it can be deleted");
    assert.ok(txt.includes("recipe_update"), "should suggest the recipe_update path");
  } finally {
    restore();
    try { unlinkSync(tmpPath); } catch { /* ignore */ }
  }
});

test("recipe_import_image reports success with counts when Vision DID extract a real recipe", async () => {
  const tmpPath = join(TEST_TMP_DIR, `audie-import-success-${Date.now()}.jpeg`);
  writeFileSync(tmpPath, Buffer.from([0xff, 0xd8, 0xff, 0xe0]));
  const { restore } = installFetchMock({
    status: 200,
    jsonBody: {
      id: "rec_xyz",
      title: "Buttermilk Biscuits",
      ingredients: [{ name: "flour" }, { name: "buttermilk" }, { name: "salt" }],
      instructions: ["Mix dry", "Cut in butter", "Bake at 425"],
    },
  });
  try {
    const res = await handleRecipeImportImage({ image_path: tmpPath }, cfg);
    assert.ok(!res.isError, "happy path should NOT be isError");
    const txt = res.content[0].text;
    assert.ok(txt.includes("Buttermilk Biscuits"));
    assert.ok(txt.includes("Ingredients: 3"), "should report ingredient count");
    assert.ok(txt.includes("Steps: 3"), "should report step count");
  } finally {
    restore();
    try { unlinkSync(tmpPath); } catch { /* ignore */ }
  }
});

// --- sage_meal_plan auto-save (regression: 2026-05-02 fix) ----------------

// Pre-2026-05-02 the auto-save POST'd {week:"current", meals:...} to
// /meal-plans. The gateway only wires GET + PUT, and the validator
// rejects "current" — so auto-save was silently dead. After the fix,
// auto-save mirrors `meal_plan_update`: PUT /meal-plans with the
// `{mealPlans: {<week_id>: slots}}` envelope.

test("currentWeekIdSundayLocal returns Sunday of the given week as YYYY-MM-DD", () => {
  // 2026-04-29 is a Wednesday — Sunday of that week is 2026-04-26.
  assert.strictEqual(currentWeekIdSundayLocal(new Date(2026, 3, 29)), "2026-04-26");
  // 2026-04-26 is itself a Sunday — should return itself.
  assert.strictEqual(currentWeekIdSundayLocal(new Date(2026, 3, 26)), "2026-04-26");
  // 2026-05-02 is a Saturday — Sunday of that week is 2026-04-26.
  assert.strictEqual(currentWeekIdSundayLocal(new Date(2026, 4, 2)), "2026-04-26");
  // 2026-05-03 is a Sunday — should return itself.
  assert.strictEqual(currentWeekIdSundayLocal(new Date(2026, 4, 3)), "2026-05-03");
});

test("sage_meal_plan auto-save uses PUT /meal-plans (not POST) when Sage emits a meal plan", async () => {
  // First fetch is POST /sage/chat returning a markdown-wrapped meal plan.
  // Second fetch is the auto-save attempt — must be PUT.
  const calls: RecordedCall[] = [];
  const original = globalThis.fetch;
  let callCount = 0;
  globalThis.fetch = (async (input: unknown, init?: { method?: string; body?: string; headers?: Record<string, string> }) => {
    const url = typeof input === "string" ? input : String(input);
    calls.push({
      url,
      method: init?.method ?? "GET",
      body: init?.body ? JSON.parse(init.body) : undefined,
      headers: init?.headers ?? {},
    });
    callCount++;
    if (callCount === 1) {
      const reply = 'Here is your week:\n```json\n{"mealPlan":{"2026-04-26-1-Dinner":{"day":1,"type":"Dinner","recipeId":"r1"}}}\n```';
      return { ok: true, status: 200, json: async () => ({ message: reply }) } as unknown as Response;
    }
    return { ok: true, status: 200, json: async () => ({ ok: true, updated: ["x"] }) } as unknown as Response;
  }) as typeof fetch;
  try {
    const res = await handleSageMealPlan({ message: "Plan dinners" }, cfg);
    assert.strictEqual(calls.length, 2, "expected sage chat + auto-save");
    assert.strictEqual(calls[0].url, "https://api.example.com/sage/chat");
    assert.strictEqual(calls[0].method, "POST");
    assert.strictEqual(calls[1].url, "https://api.example.com/meal-plans");
    assert.strictEqual(calls[1].method, "PUT", "auto-save must be PUT, not POST");
    assert.ok(res.content[0].text.includes("saved to your planner"));
  } finally {
    globalThis.fetch = original;
  }
});

test("sage_meal_plan auto-save wraps in {mealPlans: {<sunday-iso>: slots}} envelope", async () => {
  const calls: RecordedCall[] = [];
  const original = globalThis.fetch;
  let callCount = 0;
  globalThis.fetch = (async (input: unknown, init?: { method?: string; body?: string }) => {
    const url = typeof input === "string" ? input : String(input);
    calls.push({ url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(init.body) : undefined, headers: {} });
    callCount++;
    if (callCount === 1) {
      const reply = 'Plan:\n```json\n{"mealPlan":{"2026-04-26-2-Lunch":{"day":2,"type":"Lunch"}}}\n```';
      return { ok: true, status: 200, json: async () => ({ message: reply }) } as unknown as Response;
    }
    return { ok: true, status: 200, json: async () => ({ ok: true, updated: ["x"] }) } as unknown as Response;
  }) as typeof fetch;
  try {
    await handleSageMealPlan({ message: "Plan" }, cfg);
    const saveBody = calls[1].body as { mealPlans: Record<string, unknown> };
    const weekIds = Object.keys(saveBody.mealPlans);
    assert.strictEqual(weekIds.length, 1);
    // Must be ISO date `YYYY-MM-DD`, NOT "current"
    assert.match(weekIds[0], /^\d{4}-\d{2}-\d{2}$/, `week_id must be ISO YYYY-MM-DD, got ${weekIds[0]}`);
    assert.notStrictEqual(weekIds[0], "current");
    // Slots passthrough
    assert.deepStrictEqual(saveBody.mealPlans[weekIds[0]], { "2026-04-26-2-Lunch": { day: 2, type: "Lunch" } });
  } finally {
    globalThis.fetch = original;
  }
});

test("sage_meal_plan surfaces auto-save failure to the user (instead of silently swallowing)", async () => {
  const original = globalThis.fetch;
  let callCount = 0;
  globalThis.fetch = (async (_input: unknown, _init?: unknown) => {
    callCount++;
    if (callCount === 1) {
      const reply = '```json\n{"mealPlan":{"2026-04-26-1-Dinner":{"day":1,"type":"Dinner"}}}\n```';
      return { ok: true, status: 200, json: async () => ({ message: reply }) } as unknown as Response;
    }
    return { ok: false, status: 405, json: async () => ({ message: "Method not allowed" }) } as unknown as Response;
  }) as typeof fetch;
  try {
    const res = await handleSageMealPlan({}, cfg);
    const txt = res.content[0].text;
    assert.ok(txt.includes("Auto-save failed"), `expected failure surfaced, got: ${txt}`);
    assert.ok(txt.includes("405"), "should include the HTTP status so the user/AI can debug");
  } finally {
    globalThis.fetch = original;
  }
});

test("sage_meal_plan does NOT attempt auto-save when Sage's reply contains no meal plan", async () => {
  const calls: RecordedCall[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: unknown, init?: { method?: string; body?: string }) => {
    const url = typeof input === "string" ? input : String(input);
    calls.push({ url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(init.body) : undefined, headers: {} });
    return { ok: true, status: 200, json: async () => ({ message: "I need more info — what cuisines do you like?" }) } as unknown as Response;
  }) as typeof fetch;
  try {
    await handleSageMealPlan({ message: "Plan" }, cfg);
    assert.strictEqual(calls.length, 1, "no /meal-plans call when Sage didn't emit a plan");
  } finally {
    globalThis.fetch = original;
  }
});

// --- sageMealPlanToSlots format converter (2026-05-02 prompt rework) ----

const REAL_UUID = "550e8400-e29b-41d4-a716-446655440000";
const REAL_UUID_2 = "660e8400-e29b-41d4-a716-446655440001";

test("sageMealPlanToSlots passes through Shape A (slot-keyed) untouched", () => {
  const input = {
    "0-Dinner": { day: 0, type: "Dinner", recipeId: REAL_UUID },
    "1-Dinner": { day: 1, type: "Dinner", recipeId: REAL_UUID_2 },
  };
  const out = sageMealPlanToSlots(input, "2026-04-26");
  assert.deepStrictEqual(out, input);
});

test("sageMealPlanToSlots converts Shape B (day-name keyed with recipeId values) to slot map", () => {
  const input = {
    sunday: { dinner: REAL_UUID, lunch: REAL_UUID_2 },
    monday: { dinner: REAL_UUID },
  };
  const out = sageMealPlanToSlots(input, "2026-04-26");
  // 3 slots produced
  assert.strictEqual(Object.keys(out).length, 3);
  // Spot-check shape
  assert.deepStrictEqual(out["2026-04-26-0-Dinner"], { day: 0, type: "Dinner", recipeId: REAL_UUID });
  assert.deepStrictEqual(out["2026-04-26-0-Lunch"], { day: 0, type: "Lunch", recipeId: REAL_UUID_2 });
  assert.deepStrictEqual(out["2026-04-26-1-Dinner"], { day: 1, type: "Dinner", recipeId: REAL_UUID });
});

test("sageMealPlanToSlots drops Shape B entries whose value is a free-text title (no UUID)", () => {
  // Without a recipeId, backend creates a blank slot — better to drop than save empty.
  const input = {
    sunday: { dinner: "Mom's Chicken Parmesan" }, // not a UUID
    monday: { dinner: REAL_UUID },                // valid
  };
  const out = sageMealPlanToSlots(input, "2026-04-26");
  assert.strictEqual(Object.keys(out).length, 1, "only the slot with a real recipeId survives");
  assert.deepStrictEqual(out["2026-04-26-1-Dinner"], { day: 1, type: "Dinner", recipeId: REAL_UUID });
});

test("sageMealPlanToSlots accepts Shape B object values with explicit recipeId field", () => {
  const input = {
    monday: { dinner: { recipeId: REAL_UUID, title: "Tacos" } },
  };
  const out = sageMealPlanToSlots(input, "2026-04-26");
  assert.deepStrictEqual(out["2026-04-26-1-Dinner"], { day: 1, type: "Dinner", recipeId: REAL_UUID });
});

test("sageMealPlanToSlots returns empty when nothing recognizable", () => {
  // Day-names but values are gibberish + no UUIDs → 0 slots
  assert.deepStrictEqual(sageMealPlanToSlots({ sunday: { dinner: "???" } }, "2026-04-26"), {});
  // Truly empty
  assert.deepStrictEqual(sageMealPlanToSlots({}, "2026-04-26"), {});
});

test("sage_meal_plan surfaces 'no recipes from cookbook' when Sage's plan has nothing matching", async () => {
  const original = globalThis.fetch;
  let callCount = 0;
  globalThis.fetch = (async (_input: unknown, _init?: unknown) => {
    callCount++;
    if (callCount === 1) {
      // Sage emits a plan with only free-text titles (no UUIDs)
      const reply = '```json\n{"mealPlan":{"sunday":{"dinner":"Some recipe I made up"}}}\n```';
      return { ok: true, status: 200, json: async () => ({ message: reply }) } as unknown as Response;
    }
    throw new Error("auto-save should NOT have been called");
  }) as typeof fetch;
  try {
    const res = await handleSageMealPlan({}, cfg);
    assert.strictEqual(callCount, 1, "no /meal-plans call when no slots survived conversion");
    assert.ok(res.content[0].text.includes("didn't include any recipes from your cookbook"));
  } finally {
    globalThis.fetch = original;
  }
});

// --- Auth header sanity ---------------------------------------------------

test("all handlers send the API key as Bearer + X-API-Key headers", async () => {
  const { calls, restore } = installFetchMock({ status: 200, jsonBody: { ok: true } });
  try {
    await handleMealPlanGet({}, cfg);
    assert.strictEqual(calls[0].headers["Authorization"], "Bearer ofr_test_key");
    assert.strictEqual(calls[0].headers["X-API-Key"], "ofr_test_key");
  } finally {
    restore();
  }
});
