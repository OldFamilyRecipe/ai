# The Old Family Recipe Protocol Specification

**Version:** 1.0.0
**Status:** Draft
**Authors:** Andy Rockwell (oldfamilyrecipe.com)

---

## Abstract

The Old Family Recipe Protocol (OFR Protocol) defines a standard for AI agents and applications to create, read, manage, and preserve family recipes with **provenance as a first-class concern**. Unlike generic recipe APIs, the OFR Protocol treats every recipe as a cultural artifact — capturing not just ingredients and instructions, but *who* the recipe came from, *when* it originated, and *why* it matters.

The protocol is designed for AI-native workflows: agents can create recipes from conversation, import from handwritten cards via vision, search family cookbooks, and interact with Sage — an AI cooking companion that understands a family's entire recipe collection and preferences.

## 1. Terminology

| Term | Definition |
|---|---|
| **Recipe** | A structured representation of a dish, including ingredients, instructions, and provenance. The core object of the protocol. |
| **Cookbook** | A named collection of recipes belonging to a family or user. Identified by `cookbook_id`. |
| **Provenance** | The origin record of a recipe: who it came from, the story behind it, and when it was created. Provenance is a required concept — not optional metadata. |
| **source_person** | The human who originated or passed down the recipe (e.g., "Mama", "Grandma Rose", "Uncle Frank"). |
| **story** | A free-text narrative describing the recipe's history, family significance, or memories associated with it. |
| **origin_year** | An approximate or exact year the recipe originated or was first recorded (e.g., "~1985", "1960s", "2001"). |
| **Ingredient** | A single component of a recipe, with a name, amount, unit, and optional note. |
| **Instruction** | A single step in the cooking process, represented as an ordered string. |
| **Sage** | The OFR AI cooking companion. Sage knows a family's recipes, dietary preferences, and cooking history. Accessed via protocol extensions. |
| **Agent** | An AI system acting on behalf of a human user, identified by `agent_id`. |
| **Plan** | A subscription tier that governs rate limits, storage quotas, and feature access. |

## 2. Recipe Object

A recipe is represented as a JSON object. This is the canonical schema.

```json
{
  "id": "rec_01JX7K9M...",
  "title": "Mama's Thanksgiving Stuffing",
  "slug": "mamas-thanksgiving-stuffing",
  "servings": 8,
  "prep_time_minutes": 30,
  "cook_time_minutes": 45,
  "ingredients": [
    {
      "name": "cornbread",
      "amount": "1",
      "unit": "pan",
      "note": "day-old is best — crumble it up"
    },
    {
      "name": "celery",
      "amount": "4",
      "unit": "stalks",
      "note": "diced"
    },
    {
      "name": "yellow onion",
      "amount": "1",
      "unit": "large",
      "note": null
    },
    {
      "name": "chicken broth",
      "amount": "2",
      "unit": "cups",
      "note": "homemade if you have it"
    }
  ],
  "instructions": [
    "Crumble the cornbread into a large bowl.",
    "Saute celery and onion in butter until soft, about 8 minutes.",
    "Combine vegetables with cornbread, add broth gradually until moist but not soggy.",
    "Pour into a greased baking dish. Bake at 350F for 45 minutes until golden on top."
  ],
  "provenance": {
    "source_person": "Mama",
    "story": "She made this every Thanksgiving since before I was born. The secret is day-old cornbread — she'd bake it the night before and leave it on the counter uncovered.",
    "origin_year": "~1975",
    "original_image_url": "https://oldfamilyrecipe.com/images/rec_01JX7K9M/card.jpg",
    "contributed_by": "usr_abc123"
  },
  "family": {
    "cookbook_id": "cb_rockwell_family",
    "cookbook_name": "The Rockwell Family Cookbook",
    "tags": ["thanksgiving", "holiday", "side-dish", "southern"]
  },
  "category": "Side Dish",
  "cuisine": "American",
  "images": [
    {
      "url": "https://oldfamilyrecipe.com/images/rec_01JX7K9M/photo.jpg",
      "type": "photo",
      "caption": "How it looked at Thanksgiving 2024"
    }
  ],
  "status": "published",
  "agent_id": null,
  "metadata": {
    "imported_from": "handwritten_card",
    "vision_model": "claude-haiku-4-5",
    "notes": "Original card had a crossed-out instruction about adding sage — Mama decided against it in later years."
  },
  "created_at": "2026-03-15T14:30:00Z",
  "updated_at": "2026-03-15T14:30:00Z"
}
```

### 2.1 Required Fields

| Field | Type | Description |
|---|---|---|
| `id` | string | Globally unique recipe identifier (prefixed `rec_`) |
| `title` | string | Human-readable recipe title |
| `ingredients` | array | Array of ingredient objects (see 2.2) |
| `instructions` | array | Ordered array of instruction strings |
| `status` | enum | `draft` \| `published` \| `archived` |
| `created_at` | ISO 8601 | Server-generated creation timestamp |

### 2.2 Ingredient Object

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Ingredient name (e.g., "chicken thighs") |
| `amount` | string | Yes | Quantity (e.g., "2", "1/2", "a handful") |
| `unit` | string | Yes | Unit of measure (e.g., "cups", "lbs", "pinch") |
| `note` | string | No | Preparation note or tip (e.g., "skin on — makes broth better") |

### 2.3 Provenance Object

| Field | Type | Required | Description |
|---|---|---|---|
| `source_person` | string | No* | Who the recipe is from (e.g., "Grandma Rose") |
| `story` | string | No | The story or memory behind this recipe |
| `origin_year` | string | No | Approximate or exact year (e.g., "~1985", "1960s") |
| `original_image_url` | string | No | URL of original handwritten card photo |
| `contributed_by` | string | No | User ID of the person who submitted the recipe |

*While technically optional, agents SHOULD always prompt for `source_person`. See section 8.

### 2.4 Family Object

| Field | Type | Description |
|---|---|---|
| `cookbook_id` | string | Identifier of the cookbook this recipe belongs to |
| `cookbook_name` | string | Human-readable cookbook name |
| `tags` | array | Array of string tags for categorization |

### 2.5 Optional Fields

| Field | Type | Description |
|---|---|---|
| `slug` | string | URL-safe identifier, auto-generated from title |
| `servings` | number | Number of servings (default: 4) |
| `prep_time_minutes` | number | Preparation time in minutes |
| `cook_time_minutes` | number | Cooking time in minutes |
| `category` | string | Category (e.g., "Main Dish", "Dessert", "Side") |
| `cuisine` | string | Cuisine type (e.g., "American", "Italian", "Southern") |
| `images` | array | Array of image objects (url, type, caption) |
| `agent_id` | string | ID of the AI agent that created/managed this recipe |
| `metadata` | object | Extensible key-value pairs |
| `updated_at` | ISO 8601 | Last modification timestamp |

## 3. Operations

The OFR Protocol defines 7 core operations over a RESTful HTTP API.

### 3.1 Create Recipe

Create a new recipe in a cookbook.

**Endpoint:** `POST /recipes`

**Request:**
```json
{
  "title": "Grandma Rose's Banana Pudding",
  "ingredients": [
    { "name": "ripe bananas", "amount": "6", "unit": "medium" },
    { "name": "vanilla wafers", "amount": "1", "unit": "box", "note": "Nilla brand — she was specific" },
    { "name": "vanilla pudding mix", "amount": "2", "unit": "boxes" },
    { "name": "milk", "amount": "3", "unit": "cups" },
    { "name": "whipped topping", "amount": "1", "unit": "tub" }
  ],
  "instructions": [
    "Make pudding according to package directions with milk. Refrigerate 10 minutes.",
    "Layer wafers on bottom of dish. Add sliced bananas. Pour pudding over top.",
    "Repeat layers. Top with whipped topping.",
    "Refrigerate at least 4 hours — overnight is better."
  ],
  "servings": 10,
  "source_person": "Grandma Rose",
  "story": "She brought this to every church potluck. People would leave if she didn't bring it.",
  "origin_year": "1960s",
  "category": "Dessert",
  "tags": ["potluck", "church", "summer"]
}
```

**Response:** `201 Created`
```json
{
  "id": "rec_02KY8L4N...",
  "title": "Grandma Rose's Banana Pudding",
  "slug": "grandma-roses-banana-pudding",
  "status": "published",
  "created_at": "2026-04-15T10:00:00Z"
}
```

### 3.2 Read Recipe

Retrieve a single recipe by ID.

**Endpoint:** `GET /recipes/{id}`

**Response:** `200 OK` — returns the full recipe object (section 2).

**Error:** `404 Not Found` if the recipe does not exist or belongs to another user.

### 3.3 Update Recipe

Update an existing recipe. Partial updates are supported.

**Endpoint:** `PUT /recipes/{id}`

**Request:**
```json
{
  "servings": 12,
  "story": "She brought this to every church potluck. People would leave if she didn't bring it. Updated: Aunt Linda says the original used homemade pudding, not the box kind."
}
```

**Response:** `200 OK` — returns the updated recipe object.

### 3.4 Delete Recipe

Permanently delete a recipe.

**Endpoint:** `DELETE /recipes/{id}`

**Response:** `204 No Content`

**Note:** Deletion is permanent. Implementations SHOULD support soft-delete (status: `archived`) as an alternative.

### 3.5 Search Recipes

Search a cookbook by keyword, ingredient, tag, or source person.

**Endpoint:** `GET /recipes?search={query}`

**Query Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `search` | string | Free-text search across title, ingredients, tags, source_person |
| `category` | string | Filter by category |
| `tags` | string | Comma-separated tag filter |
| `source_person` | string | Filter by source person |
| `limit` | number | Max results (default: 20, max: 100) |
| `offset` | number | Pagination offset |

**Response:** `200 OK`
```json
{
  "recipes": [
    {
      "id": "rec_02KY8L4N...",
      "title": "Grandma Rose's Banana Pudding",
      "source_person": "Grandma Rose",
      "category": "Dessert",
      "tags": ["potluck", "church", "summer"]
    }
  ],
  "total": 1,
  "limit": 20,
  "offset": 0
}
```

### 3.6 Import Recipe

Import a recipe from an external source: a URL, plain text, or an image of a handwritten recipe card.

**Endpoint:** `POST /recipes/import`

**Request (from image):**
```json
{
  "source_type": "image",
  "image_data": "<base64-encoded image>",
  "media_type": "image/jpeg",
  "source_person": "Mama",
  "story": "Found this card in her recipe box after she passed.",
  "origin_year": "~1985"
}
```

**Request (from URL):**
```json
{
  "source_type": "url",
  "url": "https://example.com/recipe/chicken-pot-pie"
}
```

**Request (from text):**
```json
{
  "source_type": "text",
  "text": "Mama's Chicken & Dumplings\n\n1 whole chicken, skin on...\n\nBoil the chicken until..."
}
```

**Response:** `201 Created` — returns the created recipe object.

**Notes:**
- Image import uses AI vision to parse handwritten cards, even when upside down, faded, or partially illegible.
- The `notes` field in the response will include observations about corrections, crossed-out sections, or illegible portions.
- URL import extracts structured recipe data (Schema.org/Recipe JSON-LD when available).

### 3.7 Export Recipe

Export a recipe in a specified format.

**Endpoint:** `GET /recipes/{id}/export?format={format}`

**Supported Formats:**

| Format | Content-Type | Description |
|---|---|---|
| `json` | `application/json` | Full OFR Protocol recipe object |
| `pdf` | `application/pdf` | Printable recipe card (includes provenance) |
| `schema-org` | `application/ld+json` | Schema.org/Recipe for SEO and interoperability |

**Example (Schema.org export):**
```json
{
  "@context": "https://schema.org",
  "@type": "Recipe",
  "name": "Grandma Rose's Banana Pudding",
  "author": {
    "@type": "Person",
    "name": "Grandma Rose"
  },
  "recipeIngredient": [
    "6 medium ripe bananas",
    "1 box vanilla wafers",
    "2 boxes vanilla pudding mix",
    "3 cups milk",
    "1 tub whipped topping"
  ],
  "recipeInstructions": [
    "Make pudding according to package directions with milk. Refrigerate 10 minutes.",
    "Layer wafers on bottom of dish. Add sliced bananas. Pour pudding over top.",
    "Repeat layers. Top with whipped topping.",
    "Refrigerate at least 4 hours — overnight is better."
  ],
  "recipeYield": "10 servings"
}
```

## 4. Sage Integration

Sage is an AI cooking companion that operates as a protocol extension. Sage has deep context about a family's cookbook, dietary preferences, and cooking history.

### 4.1 sage_chat

Conversational interaction with Sage. Supports multi-turn conversations.

**Endpoint:** `POST /sage/chat`

**Request:**
```json
{
  "message": "What should I make with the chicken thighs I have? Something the kids will eat.",
  "conversation_history": [
    { "role": "user", "content": "We're trying to eat less pasta this week." },
    { "role": "assistant", "content": "Got it — I'll keep pasta off the suggestions..." }
  ],
  "mode": "chat"
}
```

**Response:**
```json
{
  "message": "Based on your cookbook, I'd suggest Mama's Baked Chicken Thighs — your family rated it 5 stars last time. The kids loved the honey glaze. I can also suggest a new recipe: crispy chicken thigh tacos with a simple slaw. Want the full recipe?",
  "recipe": null,
  "sources": ["rec_01JX7K9M..."]
}
```

**Capabilities:**
- Answers cooking questions using the family's own recipes first.
- Suggests substitutions based on dietary restrictions and preferences.
- Remembers past conversations and family preferences (powered by Wirable memory).
- Can generate new recipes that match a family's taste profile.

### 4.2 sage_meal_plan

Weekly meal planning powered by Sage.

**Endpoint:** `POST /sage/chat` (with `mode: "meal-planner"`)

**Request:**
```json
{
  "message": "Plan dinners for this week. Monday and Wednesday are busy — need quick meals. Weekend we can cook something bigger.",
  "conversation_history": [],
  "mode": "meal-planner"
}
```

**Response:**
```json
{
  "message": "Here's your week:\n\n**Monday (busy):** Mama's One-Pot Chicken & Rice (30 min, from your cookbook)\n**Tuesday:** Grandma Rose's Meatloaf (you haven't made it in a while)\n**Wednesday (busy):** Leftover meatloaf sandwiches + salad\n**Thursday:** New recipe — Sheet Pan Sausage & Veggies (simple, 35 min)\n**Friday:** Takeout night (you deserve it)\n**Saturday:** Daddy's Smoked Ribs (from your cookbook — low and slow)\n**Sunday:** Chicken & Dumplings (Mama's recipe, perfect for a lazy Sunday)\n\nWant me to generate a grocery list?"
}
```

**Behavior:**
- Pulls from the family cookbook first, fills gaps with new suggestions.
- Considers busy vs. relaxed nights.
- Accounts for leftovers and ingredient reuse across the week.
- Can generate a consolidated grocery list for the plan.

## 5. Authentication

The OFR Protocol supports two authentication methods.

### 5.1 API Key

For server-to-server and MCP integrations.

```
X-API-Key: ofr_abc123def456...
```

API keys are generated at `https://oldfamilyrecipe.com/settings/developer`. Keys are prefixed with `ofr_` for identification. The MCP server also accepts the same key in the `Authorization: Bearer ofr_...` header.

### 5.2 JWT Bearer Token

For browser-based and mobile applications.

```
Authorization: Bearer eyJhbGciOiJSUzI1NiIs...
```

JWTs are issued by the OFR authentication service (backed by AWS Cognito). Tokens include the user's `cookbook_id` and plan tier in their claims.

### 5.3 Authentication Errors

| Status | Meaning |
|---|---|
| `401 Unauthorized` | Missing or invalid credentials |
| `403 Forbidden` | Valid credentials but insufficient permissions or plan limits exceeded |

## 6. Agent Guidelines

AI agents integrating with the OFR Protocol MUST follow these guidelines.

### 6.1 Always Include Provenance

When creating a recipe on behalf of a user, agents SHOULD always ask:

1. **Who is this recipe from?** (source_person)
2. **What is the story behind it?** (story)
3. **When is it from?** (origin_year)

If the user does not know or does not want to provide provenance, the agent should still create the recipe — but should never silently skip the question.

### 6.2 Identify with agent_id

Agents MUST include their `agent_id` when creating or modifying recipes. This provides an audit trail of which agent performed which action.

```json
{
  "agent_id": "agent_claude_mcp_v1"
}
```

### 6.3 Respect Plan Limits

Agents MUST handle `403 Forbidden` responses gracefully when a user's plan quota is exceeded. The response body will include the limit that was hit:

```json
{
  "error": "plan_limit_exceeded",
  "limit": "recipes",
  "current": 50,
  "max": 50,
  "plan": "free",
  "upgrade_url": "https://oldfamilyrecipe.com/pricing"
}
```

### 6.4 Preserve Original Text

When importing from handwritten cards or dictation, agents SHOULD preserve the original voice and phrasing of the recipe (e.g., "a good handful of flour" rather than normalizing to "0.5 cups flour"). Family recipes are not clinical documents.

### 6.5 Do Not Hallucinate Recipes

Agents MUST NOT invent provenance. If a recipe was generated by AI (not from a family member), the agent should set `source_person` to `null` and indicate AI generation in metadata:

```json
{
  "source_person": null,
  "metadata": {
    "generated_by": "sage",
    "generation_context": "User asked for a weeknight chicken recipe"
  }
}
```

## 7. Provenance

Provenance is the philosophical core of the Old Family Recipe Protocol. It is what separates OFR from every other recipe API.

### 7.1 Why Provenance Is First-Class

Every recipe has a story. "Mama's stuffing" is not just cornbread and celery — it is Thanksgiving 1987, the kitchen in the old house, the way she hummed while she cooked. Generic recipe platforms treat this context as disposable. OFR treats it as the point.

The `provenance` object exists at the top level of every recipe — not buried in metadata, not an optional extension. It is architecturally impossible to create a recipe without the system acknowledging that provenance *exists*, even if the user chooses not to fill it in.

### 7.2 Provenance Chain

Recipes evolve. A daughter modifies her mother's cornbread recipe. The OFR Protocol supports provenance chains through the `contributed_by` field and recipe versioning:

- The original recipe has `source_person: "Mama"` and `contributed_by: "usr_daughter"`.
- A fork of the recipe retains the original `source_person` but adds its own `story` explaining the modification.
- The `metadata.forked_from` field links back to the parent recipe.

### 7.3 Handwritten Card Preservation

When a recipe is imported from a photo of a handwritten card, the `original_image_url` field preserves the original artifact. This is not a convenience feature — it is an archival function. Handwritten cards are irreplaceable primary sources.

## 8. MCP Server

The OFR Protocol is available as a Model Context Protocol (MCP) server for integration with AI assistants.

**Package:** `@oldfamilyrecipe/mcp-server`

**Configuration:**
```json
{
  "mcpServers": {
    "oldfamilyrecipe": {
      "command": "npx",
      "args": ["@oldfamilyrecipe/mcp-server"],
      "env": {
        "OFR_API_KEY": "ofr_your_key_here"
      }
    }
  }
}
```

### 8.1 Available Tools

The MCP server exposes 13 tools covering the full REST surface.

**Recipes:**

| Tool | Description |
|---|---|
| `recipe_create` | Create a recipe with ingredients, instructions, and provenance |
| `recipe_import_image` | Import from a photo of a handwritten recipe card (AI vision) |
| `recipe_list` | List recipes in the user's cookbook |
| `recipe_search` | Search by keyword, ingredient, or tag |
| `recipe_update` | Partial update of an existing recipe |
| `recipe_delete` | Delete a recipe from the cookbook |

**Sage AI:**

| Tool | Description |
|---|---|
| `sage_chat` | Conversational cooking assistant with family context |
| `sage_meal_plan` | Weekly meal planning from the family cookbook |

**Meal planning:**

| Tool | Description |
|---|---|
| `meal_plan_get` | Get the meal plan for a given week |
| `meal_plan_update` | Set meals for specific days and slots |
| `shopping_list` | Get the deduplicated shopping list from the current meal plan |

**Media & family:**

| Tool | Description |
|---|---|
| `image_upload` | Get a presigned URL to upload an image (recipe photo, card scan) |
| `family_invite` | Invite a family member to a shared cookbook |

### 8.2 Environment Variables

| Variable | Required | Description |
|---|---|---|
| `OFR_API_KEY` | Yes | API key from oldfamilyrecipe.com/settings/developer |
| `OFR_API_URL` | No | API base URL (default: `https://api.oldfamilyrecipe.com`) |

> Image OCR (`recipe_import_image`) runs server-side via the OFR backend — no Anthropic key needed on the client. The OFR account pays for Vision; usage counts against the user's monthly Sage quota.

## 9. Security Considerations

### 9.1 Authentication

- All API requests MUST be authenticated via API key or JWT.
- API keys MUST be transmitted over HTTPS only. Keys sent over HTTP MUST be rejected.
- API keys are scoped to a single user's cookbook. Cross-user access is not possible.

### 9.2 Rate Limits

Rate limits are enforced per API key and vary by plan tier.

| Plan | Requests/minute | Recipes | Sage messages/day |
|---|---|---|---|
| Free | 30 | 50 | 20 |
| Home Cook | 60 | 500 | 100 |
| Family | 120 | Unlimited | Unlimited |

Rate limit headers are included in every response:

```
X-RateLimit-Limit: 30
X-RateLimit-Remaining: 28
X-RateLimit-Reset: 1713200000
```

### 9.3 Plan-Based Quotas

When a quota is exceeded, the API returns `403 Forbidden` with a structured error body (see section 6.3).

### 9.4 Image Handling

- Uploaded images are stored in private S3 buckets, accessible only to the recipe owner.
- Image URLs are signed and time-limited for sharing.
- Original handwritten card images are retained indefinitely as archival records.

### 9.5 Data Privacy

- Recipe data belongs to the user. OFR does not use recipe content for model training.
- Users can export all their data at any time (see section 3.7).
- Account deletion removes all recipes, images, and Sage conversation history.

### 9.6 Agent Security

- Agents authenticate using the user's API key. Agents do not have independent credentials.
- All agent actions are logged with the `agent_id` for audit purposes.
- Users can revoke API keys at any time, immediately disabling all agents using that key.

---

*Version 1.0.0 — Draft. The Old Family Recipe Protocol is developed by Old Family Recipe (oldfamilyrecipe.com).*
