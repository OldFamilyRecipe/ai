#!/usr/bin/env node
/**
 * Copyright (c) 2025-2026 Andy Rockwell. All rights reserved.
 *
 * Old Family Recipe MCP Server — entry point.
 *
 * Connect your AI assistant to your family cookbook. Create recipes,
 * import from photos, search your collection.
 *
 * Usage:
 *   OFR_API_KEY=ofr_xxx npx @oldfamilyrecipe/mcp-server
 *
 * Or add to your Claude/Cursor MCP config:
 *   {
 *     "mcpServers": {
 *       "oldfamilyrecipe": {
 *         "command": "npx",
 *         "args": ["@oldfamilyrecipe/mcp-server"],
 *         "env": { "OFR_API_KEY": "ofr_xxx" }
 *       }
 *     }
 *   }
 *
 * Tool registry lives in tools.ts; per-tool implementations in handlers.ts.
 */

import { createRequire } from "node:module";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import {
  handleRecipeCreate,
  handleRecipeImportImage,
  handleRecipeSearch,
  handleRecipeList,
  handleRecipeUpdate,
  handleRecipeDelete,
  handleSageChat,
  handleSageMealPlan,
  handleMealPlanGet,
  handleMealPlanUpdate,
  handleImageUpload,
  handleFamilyInvite,
  handleFamilyTree,
} from "./handlers.js";
import { configFromEnv } from "./config.js";
import { resolveAuth } from "./auth-resolve.js";
import { RECIPE_TOOLS, type RecipeToolName } from "./tools.js";

// Read package.json so the version reported in the MCP handshake always
// matches the published npm version. Hardcoding here drifts (we shipped 0.3.0
// reporting "0.1.0" until 2026-05-15). createRequire works in ESM without an
// experimental flag and resolves package.json relative to the compiled
// dist/index.js — npm always ships package.json, so this is safe at runtime.
const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };
const SERVER_VERSION = pkg.version;

// Populated by main() before the MCP server starts handling requests.
// If onboarding fails (e.g., no env var, no credentials file, AND the
// browser/device flow could not complete — typical for sandbox/CI), this
// stays empty and tool calls return the friendly onboarding message instead
// of crashing with a cryptic 401.
let API_KEY = "";
let API_BASE = configFromEnv().apiBase;

const server = new Server(
  { name: "oldfamilyrecipe", version: SERVER_VERSION },
  { capabilities: { tools: {} } }
);

// --- List Tools ---
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: RECIPE_TOOLS,
}));

/**
 * Friendly onboarding response when OFR_API_KEY isn't configured.
 * Returned in place of an actual tool call so the AI can surface a
 * helpful message in chat instead of the user seeing a silent crash.
 */
function notConfiguredResponse() {
  return {
    content: [{
      type: "text" as const,
      text:
        "🔑 OFR_API_KEY is not configured.\n\n" +
        "To use this MCP server:\n" +
        "  1. Get a free API key: https://oldfamilyrecipe.ai/dashboard\n" +
        "  2. Add it to your MCP client config:\n" +
        '       "env": { "OFR_API_KEY": "ofr_your_key_here" }\n' +
        "  3. Restart your AI client.\n\n" +
        "Free tier: 250 Sage messages/month + unlimited recipe storage. No credit card needed.\n" +
        "Docs: https://oldfamilyrecipe.ai",
    }],
    isError: true,
  };
}

// --- Call Tool ---
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  // Surface a helpful onboarding message when no API key is set,
  // instead of letting downstream HTTP calls fail with cryptic 401s.
  if (!API_KEY) {
    return notConfiguredResponse();
  }

  const config = { apiKey: API_KEY, apiBase: API_BASE };
  const safeArgs = args ?? {};

  switch (name as RecipeToolName) {
    case "recipe_create":
      return handleRecipeCreate(safeArgs, config);
    case "recipe_import_image":
      return handleRecipeImportImage(safeArgs, config);
    case "recipe_list":
      return handleRecipeList(safeArgs, config);
    case "recipe_search":
      return handleRecipeSearch(safeArgs, config);
    case "sage_chat":
      return handleSageChat(safeArgs, config);
    case "sage_meal_plan":
      return handleSageMealPlan(safeArgs, config);
    case "recipe_update":
      return handleRecipeUpdate(safeArgs, config);
    case "recipe_delete":
      return handleRecipeDelete(safeArgs, config);
    case "meal_plan_get":
      return handleMealPlanGet(safeArgs, config);
    case "meal_plan_update":
      return handleMealPlanUpdate(safeArgs, config);
    case "image_upload":
      return handleImageUpload(safeArgs, config);
    case "family_invite":
      return handleFamilyInvite(safeArgs, config);
    case "family_tree":
      return handleFamilyTree(safeArgs, config);
    default:
      return {
        content: [{ type: "text" as const, text: `Unknown tool: ${name}` }],
        isError: true,
      };
  }
});

// --- Start ---
async function main() {
  // Resolve auth BEFORE accepting tool calls. Precedence:
  //   1. OFR_API_KEY env var          (back-compat — power users)
  //   2. ~/.config/oldfamilyrecipe/credentials.json
  //   3. PKCE + browser flow          (default first-run UX)
  //   4. RFC 8628 device-code flow    (headless fallback)
  //
  // If resolution fails (e.g., sandbox with no browser AND no env var),
  // we still start the server — the tool handlers surface a friendly
  // onboarding message instead of crashing with a cryptic 401.
  const envConfig = configFromEnv();
  try {
    const resolved = await resolveAuth({
      envConfig,
      print: (line) => process.stderr.write(line + "\n"),
    });
    API_KEY = resolved.config.apiKey ?? "";
    API_BASE = resolved.config.apiBase;
    if (resolved.source !== "env") {
      console.error(`[OFR MCP] Authenticated via ${resolved.source}.`);
    }
  } catch (err) {
    // Onboarding failed (user dismissed browser, no network, etc.).
    // Don't crash — let the friendly notConfiguredResponse() guide the
    // user. They can retry by restarting their MCP client, or set the
    // OFR_API_KEY env var directly.
    console.error(
      `[OFR MCP] Onboarding did not complete: ${err instanceof Error ? err.message : String(err)}`,
    );
    API_KEY = "";
    API_BASE = envConfig.apiBase;
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Stderr banner — visible to operators tailing logs, harmless if
  // ignored. Tools themselves return a friendly onboarding response
  // when the key isn't set, so the AI client surfaces it in chat
  // rather than crashing silently.
  if (!API_KEY) {
    console.error(
      "[OFR MCP] Started without an API key. Tools will return an onboarding " +
      "message until configured. Get a free key at " +
      "https://oldfamilyrecipe.ai/dashboard"
    );
  } else {
    console.error(`[OFR MCP] Connected. ${RECIPE_TOOLS.length} tools available. Free tier: 250 Sage messages/month.`);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
