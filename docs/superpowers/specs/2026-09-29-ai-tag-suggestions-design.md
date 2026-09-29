# AI tag suggestions — design

## Problem

The tag field suggests the household's 8 most-used tags, regardless of the recipe.
A burrito gets `quick`, `dinner`, … but not `mexican`, even though it is the obvious fit.

## Goal

Suggest tags that fit the recipe being edited, picked from the household's own tags, plus at most
one high-confidence new tag. Suggestions are only offered — never applied automatically.

## Decisions

- **Input:** recipe title + ingredient names. Steps are not sent (long, low signal).
- **Output:** `{ existing: string[]; new: string | null }`
  - `existing` — up to 8 household tags, best fit first.
  - `new` — at most one tag the household does not have yet, only for an obvious **cuisine or dish
    type** (`italian` for carbonara, `mexican` for burrito, `dessert` for a cake). Dietary,
    health or occasion tags (`low-fat`, `party`) are never suggested as new. Written in the
    household's `preferred_language`, lowercase, matching the style of existing tags.
- **Never auto-applied.** Suggestions replace the "most used" row; a tap adds the tag.
- **No rejection memory in v1.** The one-new-tag limit and the cuisine/dish-type restriction are the only
  guard against repetitive suggestions. Revisit if it proves annoying.
- **Model:** Haiku 4.5.

## When suggestions are fetched (hybrid)

| Path | Source |
| --- | --- |
| URL import (`/api/recipes/import`) | Piggybacked on the existing `parseRecipeData` call — no extra AI call |
| Manual new recipe, edit, paste-text import | Lazy `POST /api/tags/suggest` on first focus of the tag field |

Paste-text import (`/api/recipes/parse-text`) has no title at parse time, so it does not
piggyback; it uses the lazy path like a manual recipe.

## Components

### `src/lib/ai/suggest-tags.ts` (new)

Single owner of the tag-suggestion rules.

- `tagSuggestionRules({ householdTags, language })` — prompt text describing the rules above for
  the `existing` / `new` fields. The caller describes the surrounding JSON shape (standalone
  call: `{ existing, new }`; parse call: a top-level `suggestedTags` field).
- `sanitizeTagSuggestions(raw, householdTags): TagSuggestions` — enforces the rules in code,
  independent of model compliance:
  - `existing`: lowercased, trimmed, deduplicated, dropped if not in `householdTags`, capped at 8.
  - `new`: lowercased, trimmed; dropped if empty, not a string, or already in `householdTags`
    (case-insensitive). If the model returns an array, only the first element is kept.
  - Any malformed input returns `{ existing: [], new: null }`.
- `suggestTags({ title, ingredientNames, householdTags, language, householdId })` — standalone
  Haiku call; logs usage as `tag_suggest`; returns sanitized suggestions; on any error returns
  the empty result (never throws to the caller).

### `parseRecipeData` (changed)

Takes an optional `tagContext: { title, householdTags, language }`. When present, the prompt
includes `tagSuggestionPromptSection` and the result carries `suggestedTags` (sanitized).
Malformed or missing `suggestedTags` in the response yields the empty result — it never triggers
the raw fallback for ingredients/steps. Without `tagContext` the prompt and behaviour are unchanged.

### `/api/recipes/import` (changed)

The household tag lookup and household settings query currently run in parallel with
`parseRecipeData`. They move before it so tag names and `preferred_language` can be passed as
`tagContext`. `suggestedTags` is added to the draft. Translation later in the route does not
touch `suggestedTags` (existing tags are household names; the new tag is already in the target
language).

### `POST /api/tags/suggest` (new)

- Body: `{ title: string; ingredientNames: string[] }`.
- Auth required; household resolved server-side. Household tags (from recipes' `tags` arrays and the
  `tags` table, as the import route does) and `preferred_language` are loaded server-side — never taken from the client.
- Returns `{ existing: [], new: null }` without calling AI when `TAG_SUGGEST_USE_AI !== 'true'`,
  when the title is empty, or when there is no household.
- Otherwise returns `suggestTags(...)`.

### `RecipeDraft` (changed)

Optional `suggestedTags?: TagSuggestions`.

### `RecipeForm` / `TagInput` (changed)

- `TagInput` gets an optional `suggestions?: TagSuggestions | null` prop and a
  `onRequestSuggestions?: () => void` callback fired on input focus.
- When `suggestions` is non-empty: render `existing` chips (minus already-selected tags) in place
  of "most used", and the `new` chip (if not already selected) with a small "New" marker.
  When empty/null (loading, disabled, failed): render "most used" exactly as today.
- `RecipeForm` owns fetching: seeds from `draft.suggestedTags` if present; otherwise on
  `onRequestSuggestions` calls `/api/tags/suggest` if the title is non-empty and the
  `(title, ingredient names)` pair differs from the last request. One request in flight at a time.
- New i18n key for the "New" marker (en + sk); the row label changes from "Most used" to
  "Suggested" when AI suggestions are shown.

## Cost guard

- `TAG_SUGGEST_USE_AI` env flag gates the lazy endpoint. Unset in `.env.local`, so opening the
  form locally never calls Anthropic. Set to `true` in Vercel (staging and production).
- The import piggyback is already gated by `RECIPE_IMPORT_USE_AI`.

## Testing

- `sanitizeTagSuggestions`: hallucinated existing tag dropped; >8 capped; duplicates and casing;
  `new` duplicating an existing tag dropped; `new` as array keeps first; malformed input → empty.
- `suggestTags`: SDK mocked; parses response, logs usage, returns empty on SDK error / bad JSON.
- `parseRecipeData`: with `tagContext` returns sanitized `suggestedTags`; broken tag JSON keeps
  ingredients/steps; without `tagContext` the prompt has no tag section.
- `/api/tags/suggest`: env flag off → empty, no SDK call; empty title → empty; unauthenticated → 401.
- `TagInput`: suggestions render instead of most-used; fallback when null; "New" marker; selected
  tags filtered out; focus fires `onRequestSuggestions`.
- `RecipeForm`: draft suggestions used without a fetch; refetch only when inputs changed.

## Out of scope

- Rejection tracking / cool-off for ignored suggestions.
- Auto-applying tags.
- Suggestions from steps, description or image.
