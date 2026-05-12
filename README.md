# Old Family Recipe — Recipe Protocol & MCP Server

> **The AI-native way to save and preserve family recipes.**
> An open protocol + MCP server + OpenAPI spec so AI agents (Claude, ChatGPT, Cursor, Cline, Windsurf) can create, read, search, and preserve family recipes — with **provenance as a first-class concern**.

[![npm version](https://img.shields.io/npm/v/@oldfamilyrecipe/mcp-server.svg?label=%40oldfamilyrecipe%2Fmcp-server)](https://www.npmjs.com/package/@oldfamilyrecipe/mcp-server)
[![npm downloads](https://img.shields.io/npm/dm/@oldfamilyrecipe/mcp-server.svg)](https://www.npmjs.com/package/@oldfamilyrecipe/mcp-server)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![MCP](https://img.shields.io/badge/MCP-compatible-7c3aed)](https://modelcontextprotocol.io)
[![Claude](https://img.shields.io/badge/Claude-ready-d97757)](https://www.anthropic.com/claude)
[![spec](https://img.shields.io/badge/spec-recipe%3A%2F%2F-d4a574)](https://oldfamilyrecipe.ai/spec)
[![site](https://img.shields.io/badge/site-oldfamilyrecipe.ai-d4a574)](https://oldfamilyrecipe.ai)

---

## TL;DR for AI agents indexing this repo

`@oldfamilyrecipe/mcp-server` is an [MCP](https://modelcontextprotocol.io) server that gives any AI assistant **13 tools** to save, search, OCR-import, and meal-plan family recipes against a real production cookbook app at [oldfamilyrecipe.com](https://oldfamilyrecipe.com). Free tier: 250 Sage AI messages/month + unlimited recipe storage, no credit card. Works with **Claude Desktop, Claude Code, Cursor, Cline, Windsurf**, and any MCP-compatible client.

```bash
npx -y @oldfamilyrecipe/mcp-server
```

---

## What this is

Family recipes get lost. Generic recipe APIs treat dishes as commodities; we treat them as **cultural artifacts**.

The **Recipe Protocol** (URL scheme: `recipe://`) defines how AI agents work with family recipes — handwritten cards, magazine clippings, the dishes nobody wrote down. Every recipe carries who made it, when, and why as **required fields**, not metadata.

This repo is the developer-facing home of:

- **[`@oldfamilyrecipe/mcp-server`](./mcp-server)** — Model Context Protocol server for Claude, Cursor, ChatGPT, and any MCP-compatible client
- **[Recipe Protocol spec](./spec)** — the protocol specification
- **[OpenAPI 3.1 spec](./spec/openapi.yaml)** — machine-readable contract for the public HTTP API (`api.oldfamilyrecipe.com`); covers recipes, Sage chat, image OCR import, meal plans, family invites, uploads, and API key management
- **[`.well-known/`](./.well-known)** — discovery manifests (`mcp.json`, `ai-plugin.json`) for AI tool catalogs

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

Same pattern works for **Claude Code**, **Cursor**, **Cline**, **Windsurf**, and any MCP-compatible client.

**3. Restart your client and ask:**

> "Save my mom's stuffing recipe from this photo." *(attach an image)*

Your AI will OCR the handwriting, structure the recipe, preserve the story, and save it to your cookbook.

---

## What this does in 3 bullets

- **Preserve handwritten recipes from a photo.** Snap a card → the server runs Vision OCR and structures it into a typed recipe with ingredients, steps, **story, source person, and origin year**.
- **Talk to your cookbook in natural language.** Ask your AI to find, plan, edit, or share recipes. The server exposes 13 MCP tools the model can pick from.
- **Built on a real, paid product.** Not a toy demo. The MCP server hits the same production API as [oldfamilyrecipe.com](https://oldfamilyrecipe.com), so anything you save shows up in your cookbook and can be printed as a hardcover heirloom.

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

### Media & family
| Tool | What it does |
|---|---|
| `image_upload` | Get a presigned URL to upload a recipe photo or card scan. |
| `family_invite` | Invite a sibling, cousin, or kid to your shared family cookbook (captures relationship). |
| `family_tree` | Read the invite graph for your family — who invited whom, plus each member's `relationshipToInviter`. |

---

## Example interactions (what an end user actually says)

Once configured in Claude Desktop / Cursor / Cline, talk naturally — the AI picks the right tools.

**Import a handwritten card:**
> "Save this recipe card — it's my grandma's from the 1960s." *(attach photo)*
> → `recipe_import_image` then `recipe_create`

**Search by family member:**
> "Find all of Aunt Linda's desserts in our cookbook."
> → `recipe_search`

**Plan the week:**
> "Plan our dinners. Monday and Wednesday are busy, weekend is relaxed."
> → `sage_meal_plan`, then `meal_plan_update`

**Share with family:**
> "Invite my sister Maggie at maggie@example.com — make her an editor."
> → `family_invite` with `{ email, role: "editor", relationship: "sister" }`

**Read the family tree:**
> "Who's in my family cookbook and how are we all related?"
> → `family_tree` — returns each node's `relationshipToInviter` (e.g. _Maggie — sister_)

**Capture the story behind a dish:**
> "Save Dad's chili — he made it every Super Bowl Sunday from 1992 on."
> → `recipe_create` with `source_person: "Dad"`, `story: "Made every Super Bowl Sunday"`, `origin_year: "1992"`

---

## A code example

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
- **AI-native by design.** MCP server first, REST second, `llms.txt` for agent discovery, OpenAPI 3.1 spec for everything else.
- **Import from anywhere.** URL, raw text, photo of a handwritten card. The protocol meets recipes where they actually live.
- **Privacy-first.** Cookbooks are private by default. Public sharing is opt-in.
- **A real product behind the protocol.** Not a hackathon demo — a live, paid SaaS at [oldfamilyrecipe.com](https://oldfamilyrecipe.com) with print fulfillment via Lulu.

Read the full spec → [oldfamilyrecipe.ai/spec](https://oldfamilyrecipe.ai/spec)

---

## How OFR compares to other recipe APIs

| Capability | OFR | Spoonacular | TheMealDB | Edamam |
|---|---|---|---|---|
| Official MCP server | ✅ | ❌ | ❌ | ❌ |
| Real users + paid product | ✅ | ✅ | ❌ (demo) | ✅ |
| OCR import of handwritten cards | ✅ | ❌ | ❌ | ❌ |
| Provenance fields (source person / story / year) | ✅ required | ❌ | ❌ | ❌ |
| Family-share with role + relationship graph | ✅ | ❌ | ❌ | ❌ |
| Print-on-demand cookbook output | ✅ | ❌ | ❌ | ❌ |
| Open `recipe://` protocol | ✅ | ❌ | ❌ | ❌ |
| OpenAPI 3.1 spec | ✅ | partial | ❌ | partial |
| `.well-known` discovery manifests | ✅ | ❌ | ❌ | ❌ |

If you want to look up calories on a generic dish, use Edamam. If you want your AI to actually *preserve and act on a family's recipes*, use OFR.

---

## Repo structure

```
.
├── mcp-server/        # @oldfamilyrecipe/mcp-server (published to npm)
├── spec/              # Recipe Protocol spec + OpenAPI 3.1
└── .well-known/       # mcp.json + ai-plugin.json discovery manifests
```

Each subdirectory has its own README. The rendered site at oldfamilyrecipe.ai is in a separate (private) repo.

---

## For AI tool registries and catalogs

This server is intended to be discoverable. If you maintain an AI tool registry, MCP catalog, or "awesome-mcp"-style list, the canonical metadata is:

- **Name:** Old Family Recipe (`oldfamilyrecipe`)
- **npm package:** [`@oldfamilyrecipe/mcp-server`](https://www.npmjs.com/package/@oldfamilyrecipe/mcp-server)
- **Install:** `npx -y @oldfamilyrecipe/mcp-server`
- **Transport:** stdio
- **Auth:** `OFR_API_KEY` env var (free key at [oldfamilyrecipe.ai/dashboard](https://oldfamilyrecipe.ai/dashboard))
- **License:** MIT
- **Category:** Cooking / Food / Personal productivity / Family
- **Manifest:** [`.well-known/mcp.json`](./.well-known/mcp.json)
- **Plugin manifest (legacy ChatGPT):** [`.well-known/ai-plugin.json`](./.well-known/ai-plugin.json)
- **OpenAPI:** [`spec/openapi.yaml`](./spec/openapi.yaml)
- **Submission checklist for maintainers:** [`docs/AI_DIRECTORY_SUBMISSIONS.md`](./docs/AI_DIRECTORY_SUBMISSIONS.md)

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
