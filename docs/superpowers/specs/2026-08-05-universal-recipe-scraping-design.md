# Universal Recipe Scraping

## Problem

`scrapeRecipe()` (`src/lib/scraper/index.ts`) only extracts a complete recipe when the source page publishes `schema.org/Recipe` JSON-LD. When that markup is missing or incomplete — common on personal blogs and small cooking sites — the scraper falls back to OG/meta tags only, producing a `partial: true` draft with no ingredients or steps. There are no site-specific adapters; the pipeline is fully generic today, so this gap affects any non-schema.org site.

AI is already integrated behind `RECIPE_IMPORT_USE_AI`, but only to *structure* raw ingredient/step strings already extracted from JSON-LD (`src/lib/ai/parse-recipe.ts`) and to translate/convert units (`src/lib/ai/transform-recipe.ts`). Neither step can produce a recipe when JSON-LD never provided the raw text in the first place.

Scope for this design (confirmed with user):
- Assume `fetch` always returns usable static HTML — no headless browser / JS rendering support. That's a separate, larger effort if ever needed.
- Add a third extraction tier between JSON-LD and the meta fallback: LLM extraction over Readability-cleaned article content.

## Design

### Pipeline

```
fetch HTML → cheerio → parseJsonLd()
                              ↓
                 complete? (has ingredients AND steps)
                 ↓ yes                    ↓ no / missing
                done              extractArticleContent() [Readability]
                                              ↓
                                  extractRecipeFromContent() [AI]
                                              ↓
                          confident + complete?
                          ↓ yes                    ↓ no
                         done              parseMetaFallback() → partial:true (unchanged)
```

JSON-LD stays the first choice always — cheaper, deterministic, more precise when present. The new AI tier only runs when JSON-LD is absent or incomplete (missing ingredients or steps), and its own failure falls through to the existing meta fallback unchanged, so today's partial-import UX is preserved as the last resort.

### Content extraction — `src/lib/scraper/readability.ts`

`extractArticleContent(html: string, url: string): { title: string; textContent: string } | null`

Wraps `@mozilla/readability` over `jsdom` (jsdom already a dependency; `@mozilla/readability` is new). Returns `null` when Readability can't identify an article (e.g., non-article pages), which short-circuits straight to the meta fallback without spending an AI call.

### AI extraction — `src/lib/ai/extract-recipe.ts`

`extractRecipeFromContent(articleText: string, sourceUrl: string, householdId?: string): Promise<{ rawIngredients: string[]; rawSteps: string[] } | null>`

Deliberately mirrors the output shape of `parseJsonLd`/`parseMetaFallback` (raw string arrays), **not** a full `RecipeDraft`. This lets the extraction slot into the existing `rawIngredients`/`rawSteps` → `parseRecipeData()` structuring step in `route.ts` unchanged — no duplicate quantity/unit parsing logic, and translation/unit-conversion downstream keeps working exactly as it does for JSON-LD-sourced recipes today.

Same pattern as `parse-recipe.ts`/`transform-recipe.ts`: Anthropic client, `claude-haiku-4-5-20251001`, gated behind `RECIPE_IMPORT_USE_AI` (checked inside this function, matching `parse-recipe.ts`'s convention). Prompt asks the model to return the ingredient lines and instruction steps verbatim (no translation, no unit parsing) from the article text, or empty arrays if the text isn't a recipe / lacks a clear ingredient list or steps. A parse failure, missing JSON, or empty-arrays response all resolve to `null` — the caller treats this the same as "nothing found."

Logged via the existing `logAiUsage`, consistent with the other two AI call sites — `householdId` is threaded in from `scrapeRecipe()`'s caller the same way it already reaches `parseRecipeData()`.

### Orchestration — `scrapeRecipe()`

`scrapeRecipe()` gains a `householdId?: string` parameter (for AI usage logging), passed from `route.ts` where `profile.household_id` is already resolved before the stream starts.

After `parseJsonLd()`:
1. If it returned a non-partial result (`ingredients.length > 0 && steps.length > 0` — i.e. `!jsonLdResult.partial`), return it immediately — unchanged, tier 1 only.
2. Otherwise compute `base = jsonLdResult ?? parseMetaFallback($, url)` (keeps whatever title/description/image/times/tags tier 1 already found, or falls back to meta tags for those fields).
3. Run `extractArticleContent(html, url)`. If `null` (Readability found no article), skip straight to returning `base` — today's behavior, unchanged.
4. Run `extractRecipeFromContent(article.textContent, url, householdId)`. If it returns non-null arrays, return `{ ...base, rawIngredients, rawSteps, partial: false, partial_reason: undefined }`. If `null`, return `base` unchanged — falls through to today's partial/meta behavior.

Note: when tier 1's JSON-LD is *partially* populated (e.g. ingredients but no steps), a successful AI extraction replaces both raw arrays wholesale rather than splicing per-field — simpler, and this partial-JSON-LD case is rare enough not to warrant per-field merge logic.

### SSE stage — `src/app/api/recipes/import/route.ts`

Add an `extracting` stage event, emitted between `scraping`/`parsing` and `translating`/`converting`, so the import UI shows meaningful progress during the added LLM call instead of an unexplained pause.

## Error Handling

- Readability failure (no article detected) → immediate fallback to meta tags, no AI call spent.
- AI extraction failure (malformed JSON, "not a recipe" signal, API error) → fallback to meta tags, `partial: true`, same user-facing "fill in manually" messaging as today.
- `RECIPE_IMPORT_USE_AI=false` → behavior is unchanged from today (JSON-LD or meta-fallback only); the new tier is skipped entirely, same flag as the other two AI call sites.

## Testing

- Unit tests for `extract-recipe.ts` (mock Anthropic client): complete valid JSON, malformed JSON, explicit "not a recipe" response → `null`.
- Unit tests for `readability.ts`: real article HTML → populated `textContent`; non-article/garbage HTML → `null`.
- Extend `scraper.integration.test.ts` with a fixture page that has no JSON-LD (a plain blog-style HTML fixture), asserting the result is no longer `partial` and has populated ingredients/steps.
- Confirm existing fixtures (e.g. the `kuchynalidla.sk`-style malformed JSON-LD case) are unaffected, since that path already resolves via tier 1.

## Alternatives Rejected

- Add headless-browser rendering (Playwright) for JS-rendered pages: bigger lift (new infra, latency, cost) for a case not confirmed to be the actual pain point; deferred.
- Send full cheerio-cleaned HTML to the LLM without Readability: simpler, but noisier/more expensive prompts and higher risk of the model latching onto unrelated content (e.g. "related recipes" widgets, comments).
- Separate feature flag for the new AI tier: rejected for consistency — same `RECIPE_IMPORT_USE_AI` flag already gates the other two AI call sites in this pipeline.
