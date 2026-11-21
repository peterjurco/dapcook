# AI eval dataset

Input/output pairs for dapcook's AI prompts, collected by hand with the local
eval tool and meant to become automated evals later.

## Collecting

```bash
npm run dev
```

Open http://localhost:3000/dev/evals (dev only — it 404s in production). Each
prompt has its own page:

1. **Add an input.** For *Extract recipe from page* that's a URL: the tool fetches
   it and runs Readability exactly like the importer, and saves the article text
   the model receives. Adding a URL that's already there opens the existing input.
2. **Run the prompt** once or several times. Every run is kept. Runs call the
   real Anthropic API with the production request (`ANTHROPIC_API_KEY` from
   `.env.local`), so they cost money.
3. **Judge each run against the input, not the web page**, and add notes:
   - ✓ **Correct**: the output matches the article text.
   - ✗ **Model wrong**: the article text had it, the model missed or mangled it. These are prompt problems.
   - ⚠ **Bad input**: the output is wrong because the article text was (e.g. Readability dropped the
     ingredients). These are pipeline problems, not prompt problems.

   When the page has JSON-LD recipe data, the case page checks it against the article text
   automatically ("0 of 5 ingredients…"), so you can see which of the two it is.

The prompt page lists every input and its runs, with filters for incorrect, correct,
unrated and noted runs.

## Format

One JSON file per input: `evals/data/<prompt>/<caseId>.json` (see
`src/lib/evals/types.ts`).

- `source`: what was typed in (e.g. `{ url }`).
- `input`: what the prompt is built from, exactly as sent (for extract-recipe, the
  already-truncated `articleText`).
- `meta`: how the input was produced: page language, JSON-LD status,
  `productionCallsModel` (false when complete JSON-LD means the importer would
  skip the model), truncation.
- `reference`: the page's own answer (its JSON-LD recipe), used for the input check;
  `null` when the page has none.
- `runs[]`: for each call, the full `request` (model, max_tokens, rendered prompt),
  the untouched `rawText` reply, the parsed `output`, usage, `verdict`
  (`correct` / `incorrect` / `bad-input`) and `notes`.

Because every run stores its own request, runs from before and after a prompt
change stay distinguishable.

## Adding the other prompts

Write a runner in `src/lib/evals/runners.ts`. It needs `prepare`, which turns the
form input into the prompt's input, and `buildRequest`, which should be the production
request builder exported from `src/lib/ai/*` (see `buildExtractRecipeRequest`).
Then set `ready: true` in `src/lib/evals/prompts.ts` and give the page a form for that
input.
