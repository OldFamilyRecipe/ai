# Recipe Protocol & Developer Platform

> **Your AI saves recipes to your family cookbook.**
> An open protocol + MCP server + reference implementations for AI agents to create, read, search, and preserve family recipes — with provenance as a first-class concern.

[![npm](https://img.shields.io/npm/v/@oldfamilyrecipe/mcp-server.svg)](https://www.npmjs.com/package/@oldfamilyrecipe/mcp-server)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![spec](https://img.shields.io/badge/spec-recipe%3A%2F%2F-d4a574)](https://oldfamilyrecipe.ai/spec)
[![site](https://img.shields.io/badge/site-oldfamilyrecipe.ai-d4a574)](https://oldfamilyrecipe.ai)

---

## What this is

Family recipes get lost. Generic recipe APIs treat dishes as commodities; we treat them as cultural artifacts.

The **Recipe Protocol** (URL scheme: `recipe://`) defines how AI agents work with family recipes — handwritten cards, magazine clippings, the dishes nobody wrote down. Every recipe carries who made it, when, and why as **required fields**, not metadata.

This repo is the developer-facing home of:

- 🧰 **[`@oldfamilyrecipe/mcp-server`](./mcp-server)** — Model Context Protocol server for Claude, Cursor, ChatGPT, and any MCP-compatible client
- 📜 **[Recipe Protocol spec](./spec)** — the protocol specification

The rendered developer site at **[oldfamilyrecipe.ai](https://oldfamilyrecipe.ai)** lives in a separate repo (private — marketing/infra surface).

The consumer-facing app and API live at [oldfamilyrecipe.com](https://oldfamilyrecipe.com).

---

## 60-second quickstart

**1. Get an API key:** [oldfamilyrecipe.ai/dashboard](https://oldfamilyrecipe.ai/dashboard) — free tier includes 250 Sage messages/month + unlimited recipe storage, no credit card.

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

Same pattern works for **Claude Code**, **Cursor**, **Cline**, **Windsurf**.

**3. Restart your client and ask:**

> "Save my mom's stuffing recipe from this photo." *(attach an image)*

Your AI will OCR the handwriting, structure the recipe, preserve the story, and save it to your cookbook.

---

## The 13 tools your AI gets

### Recipes
| Tool | What it does |
|---|---|
| `recipe_create` | Create a recipe with ingredients, instructions, source person, story, origin year. |
| `recipe_import_image` | OCR a photo of a handwritten card into a structured recipe (server-side Vision). |
| `recipe_list` | List all recipes in your cookbook. |
| `recipe_search` | Search by keyword, ingredient, or tag. |
| `recipe_update` | Update an existing recipe. |
| `recipe_delete` | Delete a recipe. |

### Sage AI
| Tool | What it does |
|---|---|
| `sage_chat` | Chat with Sage, your AI cooking companion who knows your family's recipes. |
| `sage_meal_plan` | Have Sage plan your week from your cookbook + new ideas. |

### Meal planning
| Tool | What it does |
|---|---|
| `meal_plan_get` | Get the meal plan for a given week. |
| `meal_plan_update` | Set meals for specific days and slots. |
| `shopping_list` | Get the deduplicated shopping list from your current meal plan. |

### Media & family
| Tool | What it does |
|---|---|
| `image_upload` | Get a presigned URL to upload a recipe photo or card scan. |
| `family_invite` | Invite a sibling, cousin, or kid to your shared family cookbook. |

---

## A real example

Photograph a recipe card → AI structures it with the story attached:

```ts
await recipe.create({
  title: "Mama's Thanksgiving Stuffing",
  ingredients: [
    { name: "Pepperidge Farm Stuffing", amount: "1", unit: "bag (14oz)" },
    { name: "chicken breast", amount: "2-3", unit: "pieces",
      note: "skin on — makes broth better" },
    { name: "boiled eggs", amount: "5", unit: "chopped" }
  ],
  instructions: [
    "Boil chicken breast with skin on to make broth.",
    "Chop 5 boiled eggs.",
    "Mix stuffing, cream of celery, eggs, rice, and onion.",
    "Pour broth until sticky consistency.",
    "Bake at 375-400 until golden brown."
  ],
  source_person: "Mama",
  story: "Decoded from a crossed-out card only she could read.",
  origin_year: "~1985"
})
```

The result lives at `https://oldfamilyrecipe.com/recipes/<id>` — viewable, editable, printable as a hardcover heirloom.

---

## What makes the protocol different

- **Provenance as first-class data.** `source_person`, `story`, `origin_year` are required, not optional. Search by family member, by decade, by story.
- **AI-native by design.** MCP server first, REST second, `llms.txt` for agent discovery.
- **Import from anywhere.** URL, raw text, photo of a handwritten card. The protocol meets recipes where they actually live.
- **Privacy-first.** Cookbooks are private by default. Public sharing is opt-in.

Read the full spec → [oldfamilyrecipe.ai/spec](https://oldfamilyrecipe.ai/spec)

---

## Repo structure

```
.
├── mcp-server/        # @oldfamilyrecipe/mcp-server (published to npm)
└── spec/              # The Recipe Protocol specification
```

Each subdirectory has its own README. The rendered site at oldfamilyrecipe.ai is in a separate (private) repo.

---

## Why this exists

Family recipes — the handwritten ones, the dishes only one person remembers — are the artifacts most worth preserving and most likely to be lost. Generic recipe apps treat them as commodities. We're building a protocol that treats them as cultural artifacts and gives AI agents a clean, structured way to help families preserve them.

Built by [Old Family Recipe](https://oldfamilyrecipe.com). Made in North Carolina.

---

## Contributing

Issues + PRs welcome. The protocol is intentionally narrow — every change should answer "does this help families preserve their recipes?"

For small fixes (typos, broken links, doc improvements) just open a PR. For larger changes, open an issue first to discuss.

---

## License

MIT — see [LICENSE](./LICENSE).
