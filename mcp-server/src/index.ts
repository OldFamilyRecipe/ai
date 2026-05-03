#!/usr/bin/env node
/**
 * Old Family Recipe MCP Server
 *
 * Connect your AI assistant to your family cookbook.
 * Create recipes, import from photos, search your collection.
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
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { handleRecipeCreate, handleRecipeImportImage, handleRecipeSearch, handleRecipeList, handleRecipeUpdate, handleRecipeDelete, handleSageChat, handleSageMealPlan, handleMealPlanGet, handleMealPlanUpdate, handleImageUpload, handleFamilyInvite } from "./handlers.js";

const API_KEY = process.env.OFR_API_KEY ?? "";
const API_BASE = process.env.OFR_API_URL ?? "https://api.oldfamilyrecipe.com";

const server = new Server(
  { name: "oldfamilyrecipe", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

// --- List Tools ---
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "recipe_create",
      description:
        "Create a recipe in your Old Family Recipe cookbook. Include ingredients, instructions, " +
        "and optionally who the recipe is from (source_person), the story behind it, and the year it originated.",
      inputSchema: {
        type: "object" as const,
        properties: {
          title: { type: "string", description: "Recipe title (e.g. 'Mama\\'s Thanksgiving Stuffing')" },
          ingredients: {
            type: "array",
            description: "Array of ingredients",
            items: {
              type: "object",
              properties: {
                name: { type: "string", description: "Ingredient name" },
                amount: { type: "string", description: "Quantity (e.g. '2', '1/2')" },
                unit: { type: "string", description: "Unit of measure (e.g. 'cups', 'lbs', 'bag')" },
                note: { type: "string", description: "Optional note (e.g. 'skin on — makes broth better')" },
              },
              required: ["name", "amount", "unit"],
            },
          },
          instructions: {
            type: "array",
            description: "Cooking steps in order",
            items: { type: "string" },
          },
          servings: { type: "number", description: "Number of servings (default: 4)" },
          source_person: { type: "string", description: "Who this recipe is from (e.g. 'Mama', 'Grandma Rose')" },
          story: { type: "string", description: "The story behind this recipe" },
          origin_year: { type: "string", description: "When the recipe is from (e.g. '~1985', '1960s')" },
          original_image_url: { type: "string", description: "URL of original handwritten card photo" },
          category: { type: "string", description: "Category (e.g. 'Main Dish', 'Dessert', 'Side')" },
          cuisine: { type: "string", description: "Cuisine (e.g. 'American', 'Italian')" },
          tags: { type: "array", items: { type: "string" }, description: "Tags (e.g. ['thanksgiving', 'holiday'])" },
          prep_time_minutes: { type: "number", description: "Prep time in minutes" },
          cook_time_minutes: { type: "number", description: "Cook time in minutes" },
        },
        required: ["title", "ingredients", "instructions"],
      },
    },
    {
      name: "recipe_import_image",
      description:
        "Import a recipe from a photo of a handwritten recipe card. " +
        "AI reads the card (even if upside down or hard to read) and creates a structured recipe. " +
        "Optionally add who the recipe is from and the story behind it.",
      inputSchema: {
        type: "object" as const,
        properties: {
          image_path: { type: "string", description: "Path to the photo of the handwritten recipe card" },
          source_person: { type: "string", description: "Who this recipe is from" },
          story: { type: "string", description: "The story behind this recipe" },
          origin_year: { type: "string", description: "When the recipe is from" },
        },
        required: ["image_path"],
      },
    },
    {
      name: "recipe_list",
      description: "List recipes in your Old Family Recipe cookbook.",
      inputSchema: {
        type: "object" as const,
        properties: {
          limit: { type: "number", description: "Max recipes to return (default: 20)" },
        },
      },
    },
    {
      name: "recipe_search",
      description: "Search your Old Family Recipe cookbook by keyword, ingredient, or tag.",
      inputSchema: {
        type: "object" as const,
        properties: {
          query: { type: "string", description: "Search query (e.g. 'stuffing', 'chicken', 'thanksgiving')" },
        },
        required: ["query"],
      },
    },
    {
      name: "sage_chat",
      description:
        "Talk to Sage — your personalized AI cooking companion. Sage knows your family's recipes, " +
        "dietary preferences, what your kids won't eat, and your cooking history. Ask her anything about " +
        "cooking, ingredients, substitutions, or your family's recipes. She remembers everything.",
      inputSchema: {
        type: "object" as const,
        properties: {
          message: { type: "string", description: "Your message to Sage (e.g. 'What should I make with chicken thighs?')" },
          conversation_history: {
            type: "array",
            description: "Previous messages in this conversation (optional, for multi-turn)",
            items: {
              type: "object",
              properties: {
                role: { type: "string", enum: ["user", "assistant"] },
                content: { type: "string" },
              },
              required: ["role", "content"],
            },
          },
        },
        required: ["message"],
      },
    },
    {
      name: "sage_meal_plan",
      description:
        "Ask Sage to plan your family's meals for the week. She plans from your own cookbook first, " +
        "fills gaps with new ideas that match your family's taste, and considers busy nights vs relaxed nights. " +
        "Tell her about your family and she'll build a plan.",
      inputSchema: {
        type: "object" as const,
        properties: {
          message: {
            type: "string",
            description: "What to tell Sage about your week (e.g. 'Plan dinners, busy Monday and Wednesday, relaxed weekend')",
          },
          conversation_history: {
            type: "array",
            description: "Previous messages in this conversation (optional, for multi-turn)",
            items: {
              type: "object",
              properties: {
                role: { type: "string", enum: ["user", "assistant"] },
                content: { type: "string" },
              },
              required: ["role", "content"],
            },
          },
        },
      },
    },
    {
      name: "recipe_update",
      description: "Update an existing recipe in your cookbook.",
      inputSchema: {
        type: "object" as const,
        properties: {
          id: { type: "string", description: "Recipe ID to update" },
          title: { type: "string" },
          ingredients: { type: "array", items: { type: "object", properties: { name: { type: "string" }, amount: { type: "string" }, unit: { type: "string" }, note: { type: "string" } }, required: ["name", "amount", "unit"] } },
          instructions: { type: "array", items: { type: "string" } },
          servings: { type: "number" },
          source_person: { type: "string" },
          story: { type: "string" },
          origin_year: { type: "string" },
          category: { type: "string" },
          cuisine: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
        },
        required: ["id"],
      },
    },
    {
      name: "recipe_delete",
      description: "Delete a recipe from your cookbook.",
      inputSchema: {
        type: "object" as const,
        properties: {
          id: { type: "string", description: "Recipe ID to delete" },
        },
        required: ["id"],
      },
    },
    {
      name: "meal_plan_get",
      description: "Get your meal plan for a given week.",
      inputSchema: {
        type: "object" as const,
        properties: {
          week: { type: "string", description: "Week to get (e.g. 'current', '2026-04-14'). Default: current" },
        },
      },
    },
    {
      name: "meal_plan_update",
      description:
        "Update your meal plan — set meals for one or more weeks. Pass either " +
        "`mealPlans` (multi-week, pre-shaped) OR the `week` + `meals` pair (single week, wrapped server-side). " +
        "Each slot is { day: 0-6 (Sun=0..Sat=6), type: 'Breakfast'|'Lunch'|'Dinner'|'Snack', recipeId?: '<uuid>' }. " +
        "Day-name strings ('Monday', 'mon') and lowercase types ('lunch') are auto-normalized to the int + canonical case the backend requires, so don't worry if your model emits the human-friendly form first.",
      inputSchema: {
        type: "object" as const,
        properties: {
          mealPlans: {
            type: "object",
            description:
              "Multi-week update keyed by ISO Sunday-of-week date (e.g. " +
              "{ '2026-04-26': { '2026-04-26-1-Dinner': { day: 1, type: 'Dinner', recipeId: '<uuid>' } } }). " +
              "Use this OR the (week, meals) pair below — not both.",
          },
          week: { type: "string", description: "ISO Sunday-of-week date (e.g. '2026-04-26'). Used with `meals`." },
          meals: {
            type: "object",
            description:
              "Single-week slot map. Slot keys are arbitrary identifiers (the frontend uses '<weekId>-<day>-<type>' but you can use anything unique). Slot values: { day: 0-6, type: 'Breakfast'|'Lunch'|'Dinner'|'Snack', recipeId?: '<uuid>' }.",
          },
        },
      },
    },
    {
      name: "image_upload",
      description: "Get a presigned URL to upload an image (recipe photo, recipe card scan).",
      inputSchema: {
        type: "object" as const,
        properties: {
          file_name: { type: "string", description: "File name (e.g. 'grandmas-cookies.jpg')" },
          content_type: { type: "string", description: "MIME type (default: image/jpeg)" },
          file_size: { type: "number", description: "File size in bytes" },
        },
        required: ["file_name", "file_size"],
      },
    },
    // shopping_list tool removed 2026-04-30 — backend `/meal-plans/shopping-list`
    // was never implemented. Re-add when the endpoint ships.
    // TODO: shopping_list backend not yet implemented — re-add when /meal-plans/shopping-list ships
    {
      name: "family_invite",
      description: "Invite a family member to your cookbook. They can view recipes (viewer) or view and add (editor).",
      inputSchema: {
        type: "object" as const,
        properties: {
          email: { type: "string", description: "Email address to invite" },
          role: { type: "string", enum: ["editor", "viewer"], description: "Role (default: viewer)" },
        },
        required: ["email"],
      },
    },
  ],
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

  switch (name) {
    case "recipe_create":
      return handleRecipeCreate(args ?? {}, config);
    case "recipe_import_image":
      return handleRecipeImportImage(args ?? {}, config);
    case "recipe_list":
      return handleRecipeList(args ?? {}, config);
    case "recipe_search":
      return handleRecipeSearch(args ?? {}, config);
    case "sage_chat":
      return handleSageChat(args ?? {}, config);
    case "sage_meal_plan":
      return handleSageMealPlan(args ?? {}, config);
    case "recipe_update":
      return handleRecipeUpdate(args ?? {}, config);
    case "recipe_delete":
      return handleRecipeDelete(args ?? {}, config);
    case "meal_plan_get":
      return handleMealPlanGet(args ?? {}, config);
    case "meal_plan_update":
      return handleMealPlanUpdate(args ?? {}, config);
    case "image_upload":
      return handleImageUpload(args ?? {}, config);
    case "family_invite":
      return handleFamilyInvite(args ?? {}, config);
    default:
      return {
        content: [{ type: "text" as const, text: `Unknown tool: ${name}` }],
        isError: true,
      };
  }
});

// --- Start ---
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Stderr banner — visible to operators tailing logs, harmless if
  // ignored. Tools themselves return a friendly onboarding response
  // when the key isn't set, so the AI client surfaces it in chat
  // rather than crashing silently.
  if (!API_KEY) {
    console.error(
      "[OFR MCP] Started without OFR_API_KEY. Tools will return an onboarding " +
      "message until configured. Get a free key at " +
      "https://oldfamilyrecipe.ai/dashboard"
    );
  } else {
    console.error("[OFR MCP] Connected. 12 tools available. Free tier: 250 Sage messages/month.");
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
