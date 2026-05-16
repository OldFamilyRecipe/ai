# MCP Directory Submission Packet — paste-ready (2026-05-15)

Generated after verifying every URL with HEAD + browser-UA fetches.
Use these strings verbatim in Smithery, Cursor, mcp.so, awesome-mcp PRs.

---

## ✅ Pre-flight checks (already verified)

| Item | URL | Status |
|---|---|---|
| npm package | `@oldfamilyrecipe/mcp-server@0.3.1` | ✅ live on npm |
| GitHub repo | https://github.com/OldFamilyRecipe/ai | ✅ public, 11 topics |
| MCP manifest | https://raw.githubusercontent.com/OldFamilyRecipe/ai/main/.well-known/mcp.json | ✅ 200 |
| OpenAPI spec | https://raw.githubusercontent.com/OldFamilyRecipe/ai/main/spec/openapi.yaml | ✅ 200 |
| AI plugin manifest | https://raw.githubusercontent.com/OldFamilyRecipe/ai/main/.well-known/ai-plugin.json | ✅ 200 |
| Glama listing | https://glama.ai/mcp/servers/OldFamilyRecipe/ai | ✅ live, unclaimed |

---

## ⚠️ Logo gotcha

`https://oldfamilyrecipe.com/favicon-512.png` (canonical in AI_DIRECTORY_SUBMISSIONS.md) returns 403 to all curl-class fetchers — the file doesn't exist, and CloudFront WAF blocks bot fetches anyway.

**Recommended logo URL for submissions:**

Option A (zero work, may not pass strict crawlers):
- Leave logo field blank; let the form auto-pull GitHub OG image: `https://opengraph.githubassets.com/1/OldFamilyRecipe/ai`

Option B (10-min fix, bulletproof for all crawlers):
- Add `assets/logo-512.png` to OldFamilyRecipe/ai repo (square brand-mark, 512×512)
- Reference: `https://raw.githubusercontent.com/OldFamilyRecipe/ai/main/assets/logo-512.png`

Most directory forms will accept Option A and let you replace the image after claiming.

---

## Paste-ready metadata (use verbatim)

```
Name:         Old Family Recipe
Slug:         oldfamilyrecipe
Tagline:      The AI-native way to save and preserve family recipes — with provenance.
Description:  Official MCP server for Old Family Recipe. Lets Claude, ChatGPT, Cursor and any
              MCP-compatible AI assistant save, search, OCR-import, and meal-plan family recipes
              against a real production cookbook. Captures provenance (source person, story,
              origin year) as required fields, not metadata.
Install:      npx -y @oldfamilyrecipe/mcp-server
Transport:    stdio
Auth:         API key via OFR_API_KEY env var; free tier 250 Sage msgs/mo
Homepage:     https://oldfamilyrecipe.ai
Repo:         https://github.com/OldFamilyRecipe/ai
License:      MIT
Author:       Old Family Recipe
Email:        developers@oldfamilyrecipe.com
Categories:   cooking, food, personal-productivity, family, creative
Logo:         (see "Logo gotcha" above)
MCP manifest: https://raw.githubusercontent.com/OldFamilyRecipe/ai/main/.well-known/mcp.json
OpenAPI:      https://raw.githubusercontent.com/OldFamilyRecipe/ai/main/spec/openapi.yaml
```

---

## Smithery — https://smithery.ai

1. **Search first** for `@oldfamilyrecipe/mcp-server`.
   - If Smithery auto-ingested (likely — they crawl npm for `mcp` keyword): click **Claim this server** → GitHub OAuth as `solidphp` → admin panel.
   - If not listed: open the **submit** form and paste the metadata block above.
2. After claim/submit:
   - Add categories: cooking, food, productivity
   - Confirm install command renders correctly in their config snippet
   - (Optional) upload screenshot/demo gif if Smithery surfaces a media field

## Cursor — https://cursor.directory/mcp

1. Click **Submit** in the top-right.
2. Paste from the metadata block above.
3. The Cursor JSON config snippet is identical to Claude Desktop's — already in the README under "Cursor" section. The directory will render it automatically.

---

## Bonus (low cost, high value if you're already in the flow)

- **mcp.so** — submit via GitHub PR on their catalog repo (linked in their site footer)
- **awesome-mcp-servers** PR — https://github.com/punkpeye/awesome-mcp-servers under "Food & Drink"
  - Format: `[Old Family Recipe](https://github.com/OldFamilyRecipe/ai) - AI-native family-recipe saving/search with provenance + OCR import. Free tier, MIT.`
- **modelcontextprotocol/servers** PR — Community Servers section, alphabetical

---

## Tracking

After each accepted listing, note it in `project-ofr-marketing-roadmap-2026.md` (or follow-up memory) so we can correlate npm download trends with listing approvals.
