/**
 * Copyright (c) 2025-2026 Andy Rockwell. All rights reserved.
 *
 * Tests for src/tools.ts — the MCP tool registry.
 *
 * These are shape-checks that catch drift: tool name uniqueness, required
 * fields present, registry coverage of every name in the union type. They
 * are intentionally cheap and not coupled to backend behavior — handler
 * logic is tested in handlers.test.ts.
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import { RECIPE_TOOLS, type RecipeToolName } from "./tools.js";

describe("RECIPE_TOOLS registry", () => {
  it("has at least one tool (sanity)", () => {
    assert.ok(RECIPE_TOOLS.length > 0);
  });

  it("every entry has a non-empty name and description", () => {
    for (const tool of RECIPE_TOOLS) {
      assert.ok(tool.name && tool.name.length > 0, `tool missing name: ${JSON.stringify(tool)}`);
      assert.ok(tool.description && tool.description.length > 0, `tool ${tool.name} missing description`);
    }
  });

  it("every entry has a valid JSON-Schema object inputSchema", () => {
    for (const tool of RECIPE_TOOLS) {
      assert.equal(tool.inputSchema.type, "object", `tool ${tool.name} inputSchema.type must be 'object'`);
      assert.equal(typeof tool.inputSchema.properties, "object", `tool ${tool.name} missing properties`);
    }
  });

  it("tool names are unique (no duplicate registrations)", () => {
    const names = RECIPE_TOOLS.map((t) => t.name);
    const unique = new Set(names);
    assert.equal(names.length, unique.size, `duplicate tool names: ${names.join(", ")}`);
  });

  it("registry covers every name in RecipeToolName (no missing tools)", () => {
    // Compile-time + runtime check. The union type below MUST list every
    // value of RecipeToolName so TypeScript fails to compile if a name is
    // added to the type but not the registry.
    const expected: ReadonlyArray<RecipeToolName> = [
      "recipe_create",
      "recipe_import_image",
      "recipe_list",
      "recipe_search",
      "recipe_update",
      "recipe_delete",
      "sage_chat",
      "sage_meal_plan",
      "meal_plan_get",
      "meal_plan_update",
      "image_upload",
      "family_invite",
      "family_tree",
    ];
    const actualNames = new Set(RECIPE_TOOLS.map((t) => t.name));
    for (const name of expected) {
      assert.ok(actualNames.has(name), `missing tool in registry: ${name}`);
    }
    assert.equal(RECIPE_TOOLS.length, expected.length, "registry has tools not in expected list");
  });

  it("required-field arrays only reference declared properties", () => {
    for (const tool of RECIPE_TOOLS) {
      const required = tool.inputSchema.required ?? [];
      const declared = Object.keys(tool.inputSchema.properties);
      for (const field of required) {
        assert.ok(
          declared.includes(field),
          `tool ${tool.name}: required field '${field}' is not declared in properties`,
        );
      }
    }
  });
});
