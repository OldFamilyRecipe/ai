/**
 * Copyright (c) 2025-2026 Andy Rockwell. All rights reserved.
 *
 * MCP tool registry — the JSON-Schema declarations the server advertises
 * via ListToolsRequestSchema. Lifted out of index.ts so the entry point
 * stays focused on bootstrapping + dispatch (under the 400-line preflight
 * threshold) and so reviewers can audit the tool surface in one place.
 *
 * Each entry must match the corresponding handler in handlers.ts by name.
 * The exhaustive `name` string-literal type below is a compile-time check
 * that nothing in the registry drifts away from the handler dispatch.
 */

export type RecipeToolName =
  | "recipe_create"
  | "recipe_import_image"
  | "recipe_list"
  | "recipe_search"
  | "recipe_update"
  | "recipe_delete"
  | "sage_chat"
  | "sage_meal_plan"
  | "meal_plan_get"
  | "meal_plan_update"
  | "image_upload"
  | "family_invite"
  | "family_tree";

export interface RecipeTool {
  name: RecipeToolName;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export const RECIPE_TOOLS: RecipeTool[] = [
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
  {
    name: "family_invite",
    description:
      "Invite a family member to your cookbook. They can view recipes (viewer) or view and add (editor). " +
      "Optionally capture how they're related to the inviter (sister, spouse, cousin, etc., or free text up to 40 chars) — " +
      "this surfaces on the family tree under their name and is preserved across generations.",
    inputSchema: {
      type: "object" as const,
      properties: {
        email: { type: "string", description: "Email address to invite" },
        role: { type: "string", enum: ["editor", "viewer"], description: "Role (default: viewer)" },
        relationship: {
          type: "string",
          description:
            "Optional. Relationship of the invitee to the inviter. Canonical lowercased values: " +
            "'sister', 'brother', 'parent', 'child' (or 'son'/'daughter'), 'spouse', 'grandparent', " +
            "'grandchild', 'aunt', 'uncle', 'niece', 'nephew', 'cousin', 'in-law', 'friend'. " +
            "Free text is also accepted (trimmed; backend caps at 40 chars). Always optional — never blocks the invite.",
          maxLength: 40,
        },
      },
      required: ["email"],
    },
  },
  {
    name: "family_tree",
    description:
      "Returns the invite graph for the caller's family — root user (tenant owner) plus everyone they (and their invitees) " +
      "have invited. Each node includes optional `relationshipToInviter` (e.g. 'sister', 'cousin') captured at invite time. " +
      "Null for the root node and for legacy users who joined before the relationship field shipped (2026-05-03). " +
      "Use to summarize 'who's in my family cookbook' or to recall how members are related.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
];
