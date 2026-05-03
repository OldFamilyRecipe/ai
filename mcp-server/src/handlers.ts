/**
 * Recipe Protocol MCP handlers.
 */

import { readFileSync } from "fs";
import { validateImagePath } from "./image-validation.js";

interface ApiConfig {
  apiKey: string;
  apiBase: string;
}

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

function text(t: string, isError = false): ToolResult {
  return { content: [{ type: "text" as const, text: t }], ...(isError ? { isError } : {}) };
}

async function callApi(config: ApiConfig, path: string, method: string, body?: Record<string, unknown>): Promise<{ ok: boolean; status: number; data: unknown }> {
  const url = `${config.apiBase}${path}`;
  const resp = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      // Authorization is the OFR API Gateway's required identity source. The
      // API key rides in the Bearer scheme; the backend authorizer detects the
      // `ofr_` prefix and routes to the API-key path (not JWT verification).
      "Authorization": `Bearer ${config.apiKey}`,
      // X-API-Key kept for backend-internal fallback / local tests.
      "X-API-Key": config.apiKey,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await resp.json().catch(() => ({}));
  return { ok: resp.ok, status: resp.status, data };
}

// --- recipe_create ---

export async function handleRecipeCreate(args: Record<string, unknown>, config: ApiConfig): Promise<ToolResult> {
  const title = args.title as string;
  const ingredients = args.ingredients as Array<{ name: string; amount: string; unit: string; note?: string }>;
  const instructions = args.instructions as string[];

  if (!title) return text("Title is required.", true);
  if (!ingredients?.length) return text("At least one ingredient is required.", true);
  if (!instructions?.length) return text("At least one instruction step is required.", true);

  const body: Record<string, unknown> = {
    title,
    ingredients: ingredients.map((i) => ({
      ingredient: `${i.amount ?? ""} ${i.unit ?? ""} ${i.name}`.trim(),
      measure: i.note ?? "",
    })),
    instructions,
    servings: (args.servings as number) ?? 4,
    source_person: (args.source_person as string) ?? null,
    story: (args.story as string) ?? null,
    origin_year: (args.origin_year as string) ?? null,
    original_image_url: (args.original_image_url as string) ?? null,
    category: (args.category as string) ?? null,
    cuisine: (args.cuisine as string) ?? "American",
    tags: (args.tags as string[]) ?? [],
    prep_time_minutes: (args.prep_time_minutes as number) ?? null,
    cook_time_minutes: (args.cook_time_minutes as number) ?? null,
    status: "published",
  };

  const result = await callApi(config, "/recipes", "POST", body);
  if (result.ok) {
    const recipe = result.data as { id?: string; title?: string };
    return text(
      `Recipe created!\n\n` +
      `- Title: ${recipe.title ?? title}\n` +
      `- ID: ${recipe.id ?? "unknown"}\n` +
      `- View: https://oldfamilyrecipe.com/recipes/${recipe.id ?? ""}`
    );
  }
  return text(`Failed to create recipe (${result.status}): ${JSON.stringify(result.data)}`, true);
}

// --- recipe_import_image ---

export async function handleRecipeImportImage(args: Record<string, unknown>, config: ApiConfig): Promise<ToolResult> {
  const imagePath = args.image_path as string;
  if (!imagePath) return text("image_path is required — path to the photo of the handwritten recipe card.", true);

  // Defense against prompt-injection: a malicious recipe page could try
  // to coax the LLM into reading `/etc/passwd` or other sensitive files
  // and forwarding the bytes to the OFR API. Validate path containment,
  // extension, and size BEFORE reading the file.
  const validation = validateImagePath(imagePath);
  if (!validation.ok) {
    return text(validation.error, true);
  }

  let imageData: Buffer;
  try {
    imageData = readFileSync(validation.resolvedPath);
  } catch (err) {
    return text(`Could not read image at ${imagePath}: ${(err as Error).message}`, true);
  }

  const base64 = imageData.toString("base64");
  const ext = validation.resolvedPath.toLowerCase().split(".").pop() ?? "jpeg";
  const mediaType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";

  // OFR backend handles OCR via /recipes/import-image — server-side Vision
  // call billed to OFR (no ANTHROPIC_API_KEY needed on the client). Quota is
  // enforced server-side against the user's Sage limit.
  const result = await callApi(config, "/recipes/import-image", "POST", {
    image_base64: base64,
    media_type: mediaType,
    source_person: args.source_person,
    story: args.story,
    origin_year: args.origin_year,
  });

  if (result.ok) {
    const recipe = result.data as {
      id?: string;
      title?: string;
      ingredients?: unknown[];
      instructions?: unknown[];
    };
    // The backend ALWAYS saves the recipe, even when Vision couldn't extract
    // text — the comment at infrastructure/import-image-handler.ts:741-755
    // explains: this lets the web uploader double as a photo-first ingestion
    // path, where the user fills in details on the edit page.
    //
    // For MCP callers, an empty recipe with no ingredients + no instructions
    // is a near-certainty a non-recipe image (test JPEG, blurry photo, etc.)
    // that the AI client should NOT report as success. Surface the empty
    // state so the AI tells the user "I couldn't read it — try a clearer
    // photo" instead of "✅ Recipe imported!".
    const ingredientCount = Array.isArray(recipe.ingredients) ? recipe.ingredients.length : 0;
    const instructionCount = Array.isArray(recipe.instructions) ? recipe.instructions.length : 0;
    const seemsEmpty = ingredientCount === 0 && instructionCount === 0;

    if (seemsEmpty) {
      return text(
        `Image saved, but Vision couldn't extract recipe text. A blank recipe was created (id: ${recipe.id ?? "unknown"}) with the photo attached — the user can fill in details manually, or you can call \`recipe_update\` with extracted text. ` +
        `Common causes: image too small, blurry, glare, or simply not a recipe. Counts against the Sage quota.`,
        true
      );
    }
    return text(
      `Recipe imported from image!\n\n` +
      `- Title: ${recipe.title ?? "Untitled"}\n` +
      `- ID: ${recipe.id ?? "unknown"}\n` +
      `- Ingredients: ${ingredientCount}\n` +
      `- Steps: ${instructionCount}\n` +
      `- View: https://oldfamilyrecipe.com/recipes/${recipe.id ?? ""}`
    );
  }

  if (result.status === 429) {
    return text(`Monthly Sage quota reached. Recipe imports share the Sage chat quota — upgrade to Premium at https://oldfamilyrecipe.com/pricing for more.`, true);
  }
  if (result.status === 400) {
    const data = result.data as { error?: string };
    return text(data?.error ?? `Couldn't read a recipe from this image. Try a clearer photo.`, true);
  }
  return text(`Failed to import recipe (${result.status}): ${JSON.stringify(result.data)}`, true);
}

// --- recipe_list ---

export async function handleRecipeList(args: Record<string, unknown>, config: ApiConfig): Promise<ToolResult> {
  const limit = (args.limit as number) ?? 20;
  const result = await callApi(config, `/recipes?limit=${limit}`, "GET");
  if (result.ok) {
    const recipes = (result.data as { recipes?: Array<{ id: string; title: string; source_person?: string }> })?.recipes ?? [];
    if (recipes.length === 0) return text("No recipes found in your cookbook.");
    const list = recipes.map((r) => `- ${r.title}${r.source_person ? ` (from ${r.source_person})` : ""} [${r.id}]`).join("\n");
    return text(`Your recipes (${recipes.length}):\n\n${list}`);
  }
  return text(`Failed to list recipes (${result.status}): ${JSON.stringify(result.data)}`, true);
}

// --- recipe_search ---

export async function handleRecipeSearch(args: Record<string, unknown>, config: ApiConfig): Promise<ToolResult> {
  const query = args.query as string;
  if (!query) return text("Search query is required.", true);
  const result = await callApi(config, `/recipes?search=${encodeURIComponent(query)}`, "GET");
  if (result.ok) {
    const recipes = (result.data as { recipes?: Array<{ id: string; title: string; source_person?: string }> })?.recipes ?? [];
    if (recipes.length === 0) return text(`No recipes found for "${query}".`);
    const list = recipes.map((r) => `- ${r.title}${r.source_person ? ` (from ${r.source_person})` : ""} [${r.id}]`).join("\n");
    return text(`Results for "${query}" (${recipes.length}):\n\n${list}`);
  }
  return text(`Search failed (${result.status}): ${JSON.stringify(result.data)}`, true);
}

// --- sage_chat ---

export async function handleSageChat(args: Record<string, unknown>, config: ApiConfig): Promise<ToolResult> {
  const message = args.message as string;
  if (!message) return text("Message is required — tell Sage what you need.", true);

  const conversationHistory = (args.conversation_history as Array<{ role: string; content: string }>) ?? [];
  const mode = (args.mode as string) ?? "chat";

  const body: Record<string, unknown> = {
    message,
    conversation_history: conversationHistory,
    mode,
  };

  const result = await callApi(config, "/sage/chat", "POST", body);
  if (result.ok) {
    const data = result.data as { message?: string; recipe?: Record<string, unknown> };
    let response = data.message ?? "Sage had no response.";

    // Auto-save recipe if Sage included one (same behavior as the website)
    if (data.recipe) {
      const saveResult = await callApi(config, "/recipes", "POST", {
        ...data.recipe,
        status: "published",
      });
      if (saveResult.ok) {
        const saved = saveResult.data as { id?: string; title?: string };
        response += `\n\n---\nRecipe saved to your cookbook: **${saved.title ?? "Untitled"}** (${saved.id})`;
      } else {
        response += "\n\n---\n*Sage generated a recipe but it could not be saved automatically. You can copy it above.*";
      }
    }

    // Also check for JSON recipe block in the message text (recipe-builder mode)
    if (!data.recipe && response.includes('{"recipe"')) {
      const jsonMatch = response.match(/```json\s*(\{[\s\S]*?\})\s*```/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[1]) as { recipe?: Record<string, unknown> };
          if (parsed.recipe) {
            const saveResult = await callApi(config, "/recipes", "POST", {
              ...parsed.recipe,
              status: "published",
            });
            if (saveResult.ok) {
              const saved = saveResult.data as { id?: string; title?: string };
              response += `\n\n---\nRecipe saved to your cookbook: **${saved.title ?? "Untitled"}** (${saved.id})`;
            }
          }
        } catch { /* JSON parse failed — user can save manually */ }
      }
    }

    return text(response);
  }
  return text(`Sage error (${result.status}): ${JSON.stringify(result.data)}`, true);
}

// --- sage_meal_plan ---

// Sunday of the current local week as `YYYY-MM-DD`. Matches the frontend
// convention in `frontend/src/lib/mealPlannerUtils.ts:getWeekId` and the
// backend validator `MEAL_PLAN_WEEK_ID_REGEX` (which requires Sunday).
export function currentWeekIdSundayLocal(now: Date = new Date()): string {
  const sunday = new Date(now);
  sunday.setDate(now.getDate() - now.getDay());
  const y = sunday.getFullYear();
  const m = String(sunday.getMonth() + 1).padStart(2, "0");
  const d = String(sunday.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function handleSageMealPlan(args: Record<string, unknown>, config: ApiConfig): Promise<ToolResult> {
  const message = (args.message as string) ?? "Plan my dinners for this week";
  const conversationHistory = (args.conversation_history as Array<{ role: string; content: string }>) ?? [];

  const body: Record<string, unknown> = {
    message,
    conversation_history: conversationHistory,
    mode: "meal-planner",
  };

  const result = await callApi(config, "/sage/chat", "POST", body);
  if (result.ok) {
    const data = result.data as { message?: string };
    let response = data.message ?? "Sage had no response.";

    // Auto-save meal plan if Sage included one. Backend wants
    //   PUT /meal-plans with body { mealPlans: { "<sunday-iso>": { "<slot-key>":
    //     { day:0-6, type:"Breakfast"|"Lunch"|"Dinner"|"Snack", recipeId? } } } }
    //
    // Sage's prompt emits slot-keyed entries directly (post-2026-05-02 prompt
    // tweak in `infrastructure/.../sagePrompt.ts:buildMealPlannerPrompt`). For
    // backward-compat with older Sage versions or improvisation, we also accept
    // the legacy day-name shape `{sunday:{breakfast:"recipeId-or-title"}}` and
    // convert it on the way through.
    if (response.includes('{"mealPlan"')) {
      const jsonMatch = response.match(/```json\s*(\{[\s\S]*?\})\s*```/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[1]) as { mealPlan?: Record<string, unknown> };
          if (parsed.mealPlan) {
            const weekId = currentWeekIdSundayLocal();
            const slots = sageMealPlanToSlots(parsed.mealPlan, weekId);
            const slotCount = Object.keys(slots).length;
            if (slotCount === 0) {
              response += `\n\n---\nNote: Sage's plan didn't include any recipes from your cookbook (or the JSON shape was off), so nothing was auto-saved. Use \`meal_plan_update\` to add slots manually.`;
            } else {
              const saveResult = await callApi(config, "/meal-plans", "PUT", {
                mealPlans: normalizeMealPlans({ [weekId]: slots }),
              });
              if (saveResult.ok) {
                response += `\n\n---\n${slotCount} meal${slotCount === 1 ? "" : "s"} saved to your planner for the week of ${weekId}.`;
              } else {
                response += `\n\n---\nNote: Auto-save failed (HTTP ${saveResult.status}). Use \`meal_plan_update\` with week="${weekId}" to save manually.`;
              }
            }
          }
        } catch { /* JSON parse failed — user can save manually */ }
      }
    }

    return text(response);
  }
  return text(`Sage meal plan error (${result.status}): ${JSON.stringify(result.data)}`, true);
}

// --- Sage meal-plan output → backend slot map ----------------------------

/**
 * Convert Sage's two emitted shapes into the backend slot map the validator
 * accepts (`{<slot-key>:{day:int,type:CapitalizedString,recipeId?:string}}`).
 *
 * Shape A — preferred (post-2026-05-02 prompt). Already slot-keyed:
 *   { "slot-1": {day:1, type:"Dinner", recipeId:"abc"}, "slot-2": {...} }
 * Pass through unchanged. `normalizeMealPlans` later canonicalizes case +
 * day-name strings.
 *
 * Shape B — legacy (pre-prompt-tweak). Day-name keyed with meal-type values:
 *   { sunday: {breakfast:"abc-id-or-title", dinner:"..."}, monday: {...} }
 * Convert: each (day-name, meal-type, value) becomes one slot. Day-name maps
 * to int via DAY_NAME_TO_INT. Meal-type maps to canonical via
 * MEAL_TYPE_CANONICAL. Value → recipeId if it looks like a UUID/slug, else
 * dropped (we have no `title` field on the backend slot today).
 *
 * Returns `{}` when nothing recognizable comes out — caller surfaces that to
 * the user instead of silently saving an empty plan.
 */
export function sageMealPlanToSlots(
  raw: Record<string, unknown>,
  weekId: string
): Record<string, Record<string, unknown>> {
  // Shape A — already slot-keyed. Heuristic: at least one value is an object
  // with a `day` field. Pass through; normalization happens downstream.
  const looksSlotKeyed = Object.values(raw).some(
    (v) => v && typeof v === "object" && !Array.isArray(v) && "day" in (v as Record<string, unknown>)
  );
  if (looksSlotKeyed) {
    const out: Record<string, Record<string, unknown>> = {};
    for (const [slotKey, slot] of Object.entries(raw)) {
      if (slot && typeof slot === "object" && !Array.isArray(slot)) {
        out[slotKey] = slot as Record<string, unknown>;
      }
    }
    return out;
  }

  // Shape B — legacy day-name keyed. Walk into each (day, meal-type) pair.
  const out: Record<string, Record<string, unknown>> = {};
  for (const [dayKey, mealsForDay] of Object.entries(raw)) {
    const dayInt = DAY_NAME_TO_INT[dayKey.toLowerCase().trim()];
    if (dayInt === undefined) continue;
    if (!mealsForDay || typeof mealsForDay !== "object" || Array.isArray(mealsForDay)) continue;
    for (const [mealKey, value] of Object.entries(mealsForDay as Record<string, unknown>)) {
      const mealType = MEAL_TYPE_CANONICAL[mealKey.toLowerCase().trim()];
      if (!mealType) continue;
      // Value is either a recipeId-looking string, a title-looking string,
      // or an object with {recipeId,title,...}. We only carry forward the
      // recipeId — backend has no title field. Loose UUID/cuid heuristic
      // catches recipe IDs without false-positive matching short titles.
      let recipeId: string | undefined;
      if (typeof value === "string") {
        if (looksLikeRecipeId(value)) recipeId = value;
      } else if (value && typeof value === "object" && !Array.isArray(value)) {
        const v = value as Record<string, unknown>;
        if (typeof v.recipeId === "string") recipeId = v.recipeId;
        else if (typeof v.id === "string") recipeId = v.id;
      }
      const slotKey = `${weekId}-${dayInt}-${mealType}`;
      const slot: Record<string, unknown> = { day: dayInt, type: mealType };
      if (recipeId) slot.recipeId = recipeId;
      // Without a recipeId the backend creates a "blank" slot. Skip rather
      // than save an empty one — the user can fill in via dashboard or
      // meal_plan_update if they want a placeholder.
      if (recipeId) out[slotKey] = slot;
    }
  }
  return out;
}

// UUIDv4: 8-4-4-4-12 hex with dashes. recipe IDs at OFR are UUIDs today.
// (Slug recipes use this format too, so we cover both with one regex.)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function looksLikeRecipeId(s: string): boolean {
  return UUID_RE.test(s.trim());
}

// --- recipe_update ---

export async function handleRecipeUpdate(args: Record<string, unknown>, config: ApiConfig): Promise<ToolResult> {
  const id = args.id as string;
  if (!id) return text("Recipe ID is required.", true);

  const body: Record<string, unknown> = {};
  for (const key of ["title", "servings", "source_person", "story", "origin_year", "category", "cuisine", "tags", "prep_time_minutes", "cook_time_minutes"]) {
    if (args[key] !== undefined) body[key] = args[key];
  }
  if (args.ingredients) {
    body.ingredients = (args.ingredients as Array<{ name: string; amount: string; unit: string; note?: string }>).map((i) => ({
      ingredient: `${i.amount ?? ""} ${i.unit ?? ""} ${i.name}`.trim(),
      measure: i.note ?? "",
    }));
  }
  if (args.instructions) body.instructions = args.instructions;

  const result = await callApi(config, `/recipes/${id}`, "PUT", body);
  if (result.ok) return text(`Recipe updated: ${id}`);
  return text(`Failed to update recipe (${result.status}): ${JSON.stringify(result.data)}`, true);
}

// --- recipe_delete ---

export async function handleRecipeDelete(args: Record<string, unknown>, config: ApiConfig): Promise<ToolResult> {
  const id = args.id as string;
  if (!id) return text("Recipe ID is required.", true);

  const result = await callApi(config, `/recipes/${id}`, "DELETE");
  if (result.ok) return text(`Recipe deleted: ${id}`);
  return text(`Failed to delete recipe (${result.status}): ${JSON.stringify(result.data)}`, true);
}

// --- meal_plan_get ---

export async function handleMealPlanGet(args: Record<string, unknown>, config: ApiConfig): Promise<ToolResult> {
  // Backend GET /meal-plans returns ALL weeks for the tenant under
  // `mealPlans` (plural, keyed by week_id) — there's no per-week query
  // parameter. The `week` arg is preserved here so the AI can scope its
  // answer client-side, but it isn't sent to the API.
  const week = (args.week as string) ?? "current";
  const result = await callApi(config, `/meal-plans`, "GET");
  if (result.ok) {
    const data = result.data as { mealPlans?: Record<string, Record<string, unknown>> };
    const allPlans = data.mealPlans ?? {};
    if (Object.keys(allPlans).length === 0) return text("No meal plans saved yet.");

    if (week === "current" || week === "all") {
      return text(`Meal plans (${Object.keys(allPlans).length} week(s)):\n\n${JSON.stringify(allPlans, null, 2)}`);
    }
    const slots = allPlans[week];
    if (!slots) return text(`No meal plan found for week ${week}. Available weeks: ${Object.keys(allPlans).join(", ")}`);
    return text(`Meal plan (${week}):\n\n${JSON.stringify(slots, null, 2)}`);
  }
  return text(`Failed to get meal plan (${result.status}): ${JSON.stringify(result.data)}`, true);
}

// --- meal_plan_update ---

// Backend enums (from `infrastructure/src/lambdas/recipes/meal-plan-validation-helpers`):
//   day:  0 = Sunday … 6 = Saturday          (must be int)
//   type: "Breakfast" | "Lunch" | "Dinner" | "Snack"   (must be capitalized)
// AI clients reliably pass the human-friendly forms ("Monday", "lunch")
// — those are documented in the schema description AND silently accepted
// here via normalization, so the first PUT lands without a 400 round trip.
const DAY_NAME_TO_INT: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};
const MEAL_TYPE_CANONICAL: Record<string, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  supper: "Dinner",   // common dialect alias — supper IS dinner to the backend
  snack: "Snack",
};

export function normalizeMealSlot(slot: unknown): Record<string, unknown> {
  if (!slot || typeof slot !== "object") return slot as Record<string, unknown>;
  const out: Record<string, unknown> = { ...(slot as Record<string, unknown>) };
  if (typeof out.day === "string") {
    const mapped = DAY_NAME_TO_INT[out.day.toLowerCase().trim()];
    if (mapped !== undefined) out.day = mapped;
  }
  if (typeof out.type === "string") {
    const mapped = MEAL_TYPE_CANONICAL[out.type.toLowerCase().trim()];
    if (mapped) out.type = mapped;
  }
  return out;
}

export function normalizeMealPlans(
  mealPlans: Record<string, Record<string, unknown>>
): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  for (const [weekId, slots] of Object.entries(mealPlans)) {
    if (!slots || typeof slots !== "object") {
      out[weekId] = slots;
      continue;
    }
    const normalizedSlots: Record<string, unknown> = {};
    for (const [slotKey, slot] of Object.entries(slots)) {
      normalizedSlots[slotKey] = normalizeMealSlot(slot);
    }
    out[weekId] = normalizedSlots;
  }
  return out;
}

export async function handleMealPlanUpdate(args: Record<string, unknown>, config: ApiConfig): Promise<ToolResult> {
  // Backend wire format is PUT /meal-plans with body
  //   { mealPlans: { "<week_id>": { "<slot_key>": { day:int, type:enum, recipeId? } } } }
  // (week_id is an ISO date string for the week-start, slot_key is opaque per
  // the frontend's keying convention). Two MCP arg shapes are accepted:
  //
  //   1. Pre-shaped:  { mealPlans: { "2026-04-27": { ...slots } } }   — passed through (normalized)
  //   2. Single week: { week: "2026-04-27", meals: { ...slots } }     — wrapped (normalized)
  //
  // Normalization is INPUT-side: an AI client that sends `{day:"Monday",type:"lunch"}`
  // gets converted to `{day:1,type:"Lunch"}` before we hit the gateway, instead of a
  // 400 INVALID_PAYLOAD that a human or AI has to re-roll the prompt against.
  const mealPlansArg = args.mealPlans as Record<string, Record<string, unknown>> | undefined;
  const week = args.week as string | undefined;
  const meals = args.meals as Record<string, unknown> | undefined;

  let body: { mealPlans: Record<string, Record<string, unknown>> };
  if (mealPlansArg && typeof mealPlansArg === "object") {
    body = { mealPlans: normalizeMealPlans(mealPlansArg) };
  } else if (week && meals) {
    body = { mealPlans: normalizeMealPlans({ [week]: meals as Record<string, unknown> }) };
  } else {
    return text(
      "Either `mealPlans: { '<week_id>': {slots} }` or both `week` and `meals` are required. " +
      "week_id is an ISO date string (e.g. '2026-04-27'); slots map slot_key → { day:0-6, type:'Breakfast|Lunch|Dinner|Snack', recipeId? }.",
      true
    );
  }

  const result = await callApi(config, `/meal-plans`, "PUT", body);
  if (result.ok) {
    const data = result.data as { updated?: string[] };
    const weeks = data.updated ?? Object.keys(body.mealPlans);
    return text(`Meal plan updated for ${weeks.length} week(s): ${weeks.join(", ")}.`);
  }
  return text(`Failed to update meal plan (${result.status}): ${JSON.stringify(result.data)}`, true);
}

// --- image_upload ---

export async function handleImageUpload(args: Record<string, unknown>, config: ApiConfig): Promise<ToolResult> {
  const fileName = args.file_name as string;
  const contentType = (args.content_type as string) ?? "image/jpeg";
  const fileSize = args.file_size as number;
  if (!fileName) return text("file_name is required.", true);
  if (!fileSize) return text("file_size is required (bytes).", true);

  const result = await callApi(config, "/upload/presigned-url", "POST", { fileName, contentType, fileSize });
  if (result.ok) {
    const data = result.data as { presignedUrl?: string; url?: string };
    return text(`Upload ready:\n\n- **Upload URL:** ${data.presignedUrl}\n- **Final URL:** ${data.url}\n\nPUT your file to the upload URL with Content-Type: ${contentType}`);
  }
  return text(`Failed to get upload URL (${result.status}): ${JSON.stringify(result.data)}`, true);
}

// shopping_list tool removed 2026-04-30 — backend `/meal-plans/shopping-list`
// was never implemented, and aggregating ingredients from the existing schema
// (recipes.ingredients is a JSON array of free-text `{ingredient, measure}`
// strings, not structured `{name, quantity, unit}`) requires a parser that
// doesn't exist. Keeping the broken tool registered just trained AI clients
// to 4xx silently. Re-add when GET /meal-plans/shopping-list ships and the
// recipe schema gains structured ingredient rows.
// TODO: shopping_list backend not yet implemented — re-add when /meal-plans/shopping-list ships

// --- family_invite ---

/**
 * Normalize an optional relationship-to-inviter value matching the consumer
 * frontend convention (see `frontend/src/components/family-sharing/relationshipOptions.ts`)
 * and the backend `normalizeInviteRelationship` in
 * `infrastructure/src/lambdas/recipes/family-invite-handlers.ts`. Empty /
 * non-string / whitespace-only → undefined (omitted from the wire body
 * entirely; the backend silently null-coerces). Otherwise trimmed and
 * length-capped at 40 chars to match the DB column width.
 */
export function normalizeRelationship(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return undefined;
  return trimmed.slice(0, 40);
}

export async function handleFamilyInvite(args: Record<string, unknown>, config: ApiConfig): Promise<ToolResult> {
  // Backend route is POST /family/invite (singular, no trailing 's'). The
  // pre-2026-04-30 path of /family/invitations 404'd unconditionally — every
  // MCP-published invite call silently failed before reaching the Lambda.
  // Backend role enum is {'editor','viewer'} per `INVITE_ALLOWED_ROLES`; the
  // old MCP default of 'member' would have 400'd even after the path fix.
  const email = args.email as string;
  const role = (args.role as string) ?? "viewer";
  if (!email) return text("Email address is required.", true);

  // Optional `relationship` (sister/spouse/cousin/… or free-text up to 40
  // chars) — added 2026-05-03 in monorepo migration 026 to capture durable
  // family-tree metadata at invite time. Always optional; never blocks the
  // invite. Omit from body when absent so older API revisions ignore the
  // field cleanly.
  const relationship = normalizeRelationship(args.relationship);
  const body: Record<string, unknown> = { email, role };
  if (relationship !== undefined) body.relationship = relationship;

  const result = await callApi(config, "/family/invite", "POST", body);
  if (result.ok) {
    const relationshipNote = relationship ? ` (relationship: ${relationship})` : "";
    return text(`Family invitation sent to ${email} (role: ${role})${relationshipNote}.`);
  }
  return text(`Failed to send invite (${result.status}): ${JSON.stringify(result.data)}`, true);
}

// --- family_tree ---

/**
 * Family tree node — one user in the caller's tenant. Mirrors the backend
 * `FamilyTreeNode` interface in
 * `infrastructure/src/lambdas/recipes/family-handlers.ts`.
 *
 * `relationshipToInviter` was added 2026-05-03 (consumer PR #677, monorepo
 * migration 026): the inviter declares the new member's relationship at
 * invite time (e.g. "this user is my sister" → 'sister'). Null for the
 * root tenant-owner node and for legacy users who joined before relationship
 * capture. AI agents MUST handle null gracefully.
 */
export interface FamilyTreeNode {
  userId: string;
  name: string;
  email: string;
  role: "owner" | "admin" | "editor" | "viewer" | "member";
  joinedAt: string | null;
  invitedBy: string | null;
  relationshipToInviter: string | null;
}

export interface FamilyTreeResponse {
  rootUserId: string | null;
  tenantName: string;
  nodes: FamilyTreeNode[];
}

export async function handleFamilyTree(_args: Record<string, unknown>, config: ApiConfig): Promise<ToolResult> {
  // Backend GET /family/tree returns `{rootUserId, tenantName, nodes[]}` for
  // the caller's tenant (multi-tenancy is JWT/api-key driven — there's no
  // `tenant_id` query parameter). The handler lives in
  // `infrastructure/src/lambdas/recipes/family-handlers.ts:handleGetFamilyTree`.
  const result = await callApi(config, "/family/tree", "GET");
  if (!result.ok) {
    return text(`Failed to load family tree (${result.status}): ${JSON.stringify(result.data)}`, true);
  }
  const data = result.data as FamilyTreeResponse;
  const nodes = Array.isArray(data?.nodes) ? data.nodes : [];
  if (nodes.length === 0) {
    return text("No family tree yet — invite someone with `family_invite` to get started.");
  }
  // Render a compact text tree the AI can summarize. Includes
  // relationshipToInviter when present; explicitly omits it for null so the
  // AI doesn't say "as null" or fabricate a relationship.
  const byParent = new Map<string | null, FamilyTreeNode[]>();
  for (const node of nodes) {
    const parent = node.invitedBy;
    if (!byParent.has(parent)) byParent.set(parent, []);
    byParent.get(parent)!.push(node);
  }
  const lines: string[] = [];
  function render(node: FamilyTreeNode, depth: number): void {
    const indent = "  ".repeat(depth);
    const rel = node.relationshipToInviter ? ` — ${node.relationshipToInviter}` : "";
    lines.push(`${indent}- ${node.name} <${node.email}> [${node.role}]${rel}`);
    const children = byParent.get(node.userId) ?? [];
    for (const child of children) render(child, depth + 1);
  }
  const root = nodes.find((n) => n.userId === data.rootUserId) ?? nodes[0];
  render(root, 0);
  // Append any orphan nodes that didn't surface via the recursion (defensive
  // — backend re-parents orphans under root, so this is belt-and-suspenders).
  const seen = new Set<string>();
  function collectSeen(node: FamilyTreeNode): void {
    seen.add(node.userId);
    for (const child of byParent.get(node.userId) ?? []) collectSeen(child);
  }
  collectSeen(root);
  for (const node of nodes) {
    if (!seen.has(node.userId)) {
      const rel = node.relationshipToInviter ? ` — ${node.relationshipToInviter}` : "";
      lines.push(`- (orphan) ${node.name} <${node.email}> [${node.role}]${rel}`);
    }
  }
  const header = `Family tree for ${data.tenantName || "your cookbook"} (${nodes.length} member${nodes.length === 1 ? "" : "s"}):\n\n`;
  return text(header + lines.join("\n"));
}
