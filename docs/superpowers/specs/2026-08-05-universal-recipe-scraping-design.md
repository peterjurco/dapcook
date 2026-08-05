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

`extractRecipeFromContent(articleText: string, sourceUrl: string): Promise<RecipeDraft | null>`

Same pattern as `parse-recipe.ts`/`transform-recipe.ts`: Anthropic client, `claude-haiku-4-5-20251001`, gated behind `RECIPE_IMPORT_USE_AI`. Prompt asks the model to return `RecipeDraft`-shaped JSON (title, description, prep/cook time, servings, ingredients, steps) directly from the article text, and explicitly return a "not a recipe" signal when the text lacks a clear ingredient list and steps. That signal (or a JSON-parse/response failure, matching the existing `rawFallback` pattern in `parse-recipe.ts`) causes the function to return `null`.

Logged via the existing `logAiUsage`, consistent with the other two AI call sites.

### Orchestration — `scrapeRecipe()`

After `parseJsonLd()`, check completeness: `ingredients.length > 0 && steps.length > 0`. If incomplete:
1. Run `extractArticleContent()`. If `null`, skip straight to `parseMetaFallback()`.
2. Run `extractRecipeFromContent()`. If it returns a complete draft, use it (merging in any JSON-LD fields it didn't fill, e.g. `image_url`, if JSON-LD had partial data). If it returns `null`, fall through to `parseMetaFallback()` exactly as today.

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
