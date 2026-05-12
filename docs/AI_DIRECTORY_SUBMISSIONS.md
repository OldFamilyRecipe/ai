# AI Tool Directory Submission Checklist

Manual submissions to maximize discoverability of `@oldfamilyrecipe/mcp-server` in AI tool registries, MCP catalogs, and "awesome" lists.

> **Why this matters.** ChatGPT, Claude, and other AI assistants increasingly recommend MCP servers and "AI tools that can do X" from indexed catalogs. Every entry here is a new discovery surface. Once submitted, most directories also get crawled by Google/Perplexity for grounding citations.

## Canonical metadata to paste into each form

Use these exact strings — they match `package.json`, the root `README.md`, and `.well-known/mcp.json` so the entries stay self-consistent.

| Field | Value |
|---|---|
| **Name** | Old Family Recipe |
| **Slug** | `oldfamilyrecipe` |
| **Tagline** | The AI-native way to save and preserve family recipes — with provenance. |
| **Description (long)** | Official MCP server for Old Family Recipe. Lets Claude, ChatGPT, Cursor and any MCP-compatible AI assistant save, search, OCR-import, and meal-plan family recipes against a real production cookbook. Captures provenance (source person, story, origin year) as required fields, not metadata. |
| **npm package** | `@oldfamilyrecipe/mcp-server` |
| **Install** | `npx -y @oldfamilyrecipe/mcp-server` |
| **Transport** | stdio |
| **Auth** | API key via `OFR_API_KEY` env var; free tier 250 Sage msgs/mo |
| **Homepage** | https://oldfamilyrecipe.ai |
| **Repo** | https://github.com/OldFamilyRecipe/ai |
| **License** | MIT |
| **Categories** | cooking, food, personal-productivity, family, creative |
| **Logo** | https://oldfamilyrecipe.com/favicon-512.png |
| **Contact** | developers@oldfamilyrecipe.com |
| **Author** | Old Family Recipe |
| **MCP manifest** | https://raw.githubusercontent.com/OldFamilyRecipe/ai/main/.well-known/mcp.json |
| **OpenAPI** | https://raw.githubusercontent.com/OldFamilyRecipe/ai/main/spec/openapi.yaml |

---

## MCP-specific catalogs

- [ ] **[mcp.so](https://mcp.so)** — community MCP catalog
  - **What to submit:** server name, npm install, tool list, screenshots optional
  - **Where:** submit via GitHub PR on their listing repo (linked from the site footer)

- [ ] **[Smithery](https://smithery.ai)** — MCP marketplace + one-click installer
  - **What to submit:** Smithery auto-ingests from npm + GitHub if `mcp` keyword is present in `package.json` (it is). Also has a manual claim flow to add categories + screenshots.
  - **Where:** https://smithery.ai → search for `@oldfamilyrecipe/mcp-server` → "Claim this server"

- [ ] **[Glama MCP directory](https://glama.ai/mcp/servers)** — MCP server directory
  - **What to submit:** GitHub repo URL; their crawler reads README + package.json
  - **Where:** https://glama.ai/mcp/servers → "Submit a server"

- [ ] **[Anthropic's official MCP catalog](https://modelcontextprotocol.io/examples)** / awesome list
  - **What to submit:** PR to https://github.com/modelcontextprotocol/servers (third-party section) with name + repo + one-line description
  - **Where:** open a PR; existing entries are alphabetical inside the "Community Servers" section

- [ ] **[awesome-mcp-servers](https://github.com/punkpeye/awesome-mcp-servers)** (the most-starred awesome list)
  - **What to submit:** alphabetized entry under the "Food & Drink" or "Productivity" section. Format: `[name](repo) - one-line description.`
  - **Where:** PR to https://github.com/punkpeye/awesome-mcp-servers

- [ ] **[awesome-mcp](https://github.com/appcypher/awesome-mcp-servers)** — alternate awesome list
  - **What to submit:** same format as above
  - **Where:** PR to https://github.com/appcypher/awesome-mcp-servers

- [ ] **[awesome-claude](https://github.com/taylorwilsdon/awesome-claude)** / **awesome-claude-mcp**
  - **What to submit:** entry under MCP servers section
  - **Where:** PR to whichever awesome-claude list is most-starred at submission time (check both)

---

## IDE / agent platform integrations

- [ ] **[Cursor MCP directory](https://cursor.directory/mcp)**
  - **What to submit:** name + install command + description; Cursor consumes the same JSON shape Claude Desktop does, so the existing snippet in our README works as-is.
  - **Where:** https://cursor.directory/mcp → "Submit"

- [ ] **[Continue.dev](https://docs.continue.dev/customize/deep-dives/mcp)** MCP support
  - **What to submit:** add config snippet to their docs/examples. Continue.dev installs MCP servers via `npx`, identical to our existing snippet.
  - **Where:** PR to https://github.com/continuedev/continue (docs section)

- [ ] **[Cline](https://github.com/cline/cline) MCP marketplace**
  - **What to submit:** Cline maintains an in-app MCP marketplace + community-curated list
  - **Where:** PR to https://github.com/cline/mcp-marketplace (or successor repo)

- [ ] **[Windsurf](https://docs.windsurf.com)** — Codeium's IDE
  - **What to submit:** Windsurf consumes the same MCP JSON config as Claude Desktop. Submit to their featured-integrations list if they expose one.
  - **Where:** monitor https://docs.windsurf.com for an MCP catalog endpoint; otherwise file an issue requesting inclusion.

---

## Cross-LLM / agent-tool catalogs

- [ ] **[OpenAI GPT Actions catalog](https://platform.openai.com/docs/actions)** — for if/when ChatGPT lets users add MCP servers as actions (the `ai-plugin.json` in `.well-known/` is ready for this surface).
  - **Where:** OpenAI dashboard once MCP-action support ships publicly.

- [ ] **[n8n](https://n8n.io/integrations)** — workflow automation, MCP-aware
  - **What to submit:** node spec referencing our OpenAPI; community-contributed integrations land via their integration submission form.
  - **Where:** https://community.n8n.io → request integration

- [ ] **[Zapier](https://platform.zapier.com)** — has an OpenAPI/MCP ingestion path under "AI Actions"
  - **What to submit:** OpenAPI 3.1 URL (`spec/openapi.yaml`); their importer does most of the work
  - **Where:** Zapier Platform → Build an Integration → import OpenAPI

- [ ] **[Pipedream](https://pipedream.com/apps)** — similar story to Zapier, accepts OpenAPI
  - **Where:** Pipedream Platform → Apps → "Add an app"

- [ ] **[Vercel AI SDK toolbelt](https://sdk.vercel.ai)** — if/when they ship a directory of MCP-compatible tools.
  - **Where:** monitor.

---

## Other discovery surfaces (low cost, high upside)

- [ ] **GitHub topics on `OldFamilyRecipe/ai`** — set via `gh repo edit OldFamilyRecipe/ai --add-topic <topic>`. Recommended topics shipped in this PR: `mcp`, `model-context-protocol`, `mcp-server`, `recipe-api`, `claude`, `anthropic`, `ai-tools`, `cookbook`, `family-recipes`, `cooking`, `ocr`.
- [ ] **GitHub topics on `OldFamilyRecipe/prod`** — once the consumer site repo is appropriate to surface, mirror the relevant subset.
- [ ] **npm "Discover" / weekly newsletter** — npm surfaces packages with strong README + keywords; ensuring `mcp` keyword is set drives placement.
- [ ] **Product Hunt launch** — coordinated with Mother's Day / Father's Day campaigns. Pre-launch upvote audience: see `project-ofr-marketing-roadmap-2026.md`.
- [ ] **Hacker News "Show HN"** — title format `Show HN: An MCP server that lets your AI save handwritten family recipes`. Best window: weekday morning ET.
- [ ] **Reddit r/LocalLLaMA, r/ClaudeAI, r/ChatGPTPro, r/MCP** — community posts, not ads. Lead with the OCR demo gif.
- [ ] **YouTube/Twitter demo from a popular AI dev (Matt Pocock, Theo, etc.)** — handled via the creator outreach plan in `project-ofr-marketplace-creator-outreach.md`.

---

## After submitting

Track each accepted listing in `project-ofr-marketing-roadmap-2026.md` (or a follow-up memory file) so we know which surfaces are driving npm downloads / signups. The npm download chart is the cleanest aggregate signal — if a directory drives meaningful traffic, it'll show up there within a week of acceptance.

---

## Anti-patterns (don't do these)

- **Don't pay for placement.** AI-tool catalogs that charge for listings are nearly always low-traffic and signal-poor.
- **Don't astroturf reviews / stars.** Authenticity is the moat — the "real users + paid product" line in the README is true and verifiable; faking signals would torch it.
- **Don't submit before key features are stable.** A bad first impression on Smithery / Cursor is hard to undo. The 13-tool surface + provenance + free tier is the cohesive pitch — wait until each ship-blocker is closed before submitting.

---

## Source files this checklist points at

If you change any of these, update the corresponding submission entries (or just re-paste the canonical metadata table above):

- [`/README.md`](../README.md) — primary discovery surface for GitHub + LLM crawlers
- [`/mcp-server/package.json`](../mcp-server/package.json) — npm metadata
- [`/.well-known/mcp.json`](../.well-known/mcp.json) — MCP manifest
- [`/.well-known/ai-plugin.json`](../.well-known/ai-plugin.json) — legacy ChatGPT/general AI plugin manifest
- [`/spec/openapi.yaml`](../spec/openapi.yaml) — OpenAPI 3.1 (what Zapier/Pipedream/n8n actually import)
