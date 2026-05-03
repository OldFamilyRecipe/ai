# @oldfamilyrecipe/mcp-server

> An MCP server that lets Claude (and other MCP-compatible AI clients) create, read, search, and reason about recipes in your [Old Family Recipe](https://oldfamilyrecipe.com) cookbook — including importing handwritten recipe cards from photos.

[![built on recipe://](https://oldfamilyrecipe.com/badge/recipe-protocol.svg)](https://oldfamilyrecipe.com/spec)
[![npm](https://img.shields.io/npm/v/@oldfamilyrecipe/mcp-server.svg)](https://www.npmjs.com/package/@oldfamilyrecipe/mcp-server)

Works with Claude Desktop, Claude Code, Cursor, Cline, Windsurf, or any MCP-compatible client.

## Quickstart

**1. Get an API key** at [oldfamilyrecipe.ai/dashboard](https://oldfamilyrecipe.ai/dashboard). Free tier: 250 Sage messages/month + unlimited recipe storage.

**2. Add to your MCP client config.** For Claude Desktop, edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "oldfamilyrecipe": {
      "command": "npx",
      "args": ["-y", "@oldfamilyrecipe/mcp-server"],
      "env": { "OFR_API_KEY": "ofr_your_api_key_here" }
    }
  }
}
```

Same pattern for Cursor, Claude Code, Cline, Windsurf.

**3. Restart your client and ask:**
> "Save my mom's stuffing recipe from this photo." (attach image)

## Tools (12)

| Tool | What it does |
|---|---|
| `recipe_create` | Create a recipe with ingredients, instructions, source person, story, origin year. |
| `recipe_import_image` | OCR a photo of a handwritten recipe card into a structured recipe (server-side Vision). |
| `recipe_list` | List recipes in your cookbook. |
| `recipe_search` | Search your cookbook by keyword, ingredient, or tag. |
| `recipe_update` | Update an existing recipe. |
| `recipe_delete` | Delete a recipe. |
| `sage_chat` | Chat with Sage, your AI cooking companion who knows your family's recipes and preferences. |
| `sage_meal_plan` | Ask Sage to plan your week's meals from your cookbook plus new ideas. |
| `meal_plan_get` | Get your meal plan for a given week. |
| `meal_plan_update` | Set meals for specific days and slots. |
| `image_upload` | Get a presigned URL to upload an image (recipe photo, card scan). |
| `family_invite` | Invite a family member to your cookbook. |

Full protocol reference: [oldfamilyrecipe.ai/spec](https://oldfamilyrecipe.ai/spec)

## Quota

Calls share the monthly Sage budget shown on your [dashboard](https://oldfamilyrecipe.ai/dashboard):

- `recipe_import_image` — counts against Sage quota (server-side Vision OCR)
- `sage_chat`, `sage_meal_plan` — Sage messages
- `recipe_*`, `meal_plan_*`, `image_upload`, `family_invite` — covered by per-tool rate limits, not the Sage budget

Free tier: 250 Sage messages/month + unlimited recipe storage. Upgrade at [oldfamilyrecipe.com/pricing](https://oldfamilyrecipe.com/pricing) for higher limits and family sharing.

No `ANTHROPIC_API_KEY` required on your side — Vision is handled server-side and billed against your Sage quota.

## Examples

Once configured, talk to your AI naturally. It will pick the right tools:

**Import a handwritten card:**
> "Save this recipe card — it's my grandma's from the 1960s." _(attach photo)_
> → calls `recipe_import_image`

**Plan the week:**
> "Plan our dinners this week. Monday and Wednesday are busy, weekend is relaxed."
> → calls `sage_meal_plan`, then `meal_plan_update`

**Shopping:**
> "What do I need from the store for this week's plan?"
> → calls `shopping_list`

**Search:**
> "Find all the stuffing recipes in our cookbook."
> → calls `recipe_search`

## Requirements

- Node >= 18
- An Old Family Recipe account + API key

## Links

- [oldfamilyrecipe.com](https://oldfamilyrecipe.com) — the cookbook app
- [Protocol spec](https://oldfamilyrecipe.com/spec) — `recipe://` protocol
- [Developer docs](https://oldfamilyrecipe.com/developer)
- [GitHub](https://github.com/OldFamilyRecipe/ai) · [Issues](https://github.com/OldFamilyRecipe/ai/issues)

## License

MIT — see [LICENSE](LICENSE).
