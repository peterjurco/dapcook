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
3. **Judge each run against the input, not the web page**: ✓ correct / ✗ incorrect, plus notes.

**Bad inputs.** Before anything runs, the case page checks whether the input is a fair
test of the prompt: when the page has JSON-LD recipe data, it checks every ingredient and
step is in the article text. If something is missing (Readability dropped the recipe
box, say), the input is flagged as bad: it can't be run, isn't counted, and is listed
under **⚠ Bad inputs** as a pipeline bug instead of eval data. Pages without JSON-LD
need a glance at the article text, and a click on "Mark input as bad" if it's broken.
The flag can be undone if the automatic check got it wrong.

The prompt page lists every input and its runs, with filters for incorrect, correct,
unrated and noted runs, plus a separate tab of bad inputs.

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
- `inputProblem`: why the input is unusable, or null. **Leave cases with an
  `inputProblem` out of evals.**
- `runs[]`: for each call, the full `request` (model, max_tokens, rendered prompt),
  the untouched `rawText` reply, the parsed `output`, usage, `verdict`
  (`correct` / `incorrect`) and `notes`.

Because every run stores its own request, runs from before and after a prompt
change stay distinguishable.

## Adding the other prompts

Write a runner in `src/lib/evals/runners.ts`. It needs `prepare`, which turns the
form input into the prompt's input, and `buildRequest`, which should be the production
request builder exported from `src/lib/ai/*` (see `buildExtractRecipeRequest`).
Then set `ready: true` in `src/lib/evals/prompts.ts` and give the page a form for that
input.

## Checking the scraper on real pages

Every page the eval tool fetches is also saved, as raw HTML, to `evals/pages/`
(next to `evals/data/`). The folder is git-ignored because the pages are
third-party content and the repo is public. To see what a scraper change does
across all of them, run this before and after the change:

```bash
npm run check:recipe-pages
```

It prints, per page, whether production calls the model at all (not when the
JSON-LD is complete), the length of the text the model gets, and how many of
the JSON-LD's ingredients and steps reach it.

When a real page catches a bug, add a synthetic copy of it to
`src/lib/scraper/recipe-pages.fixtures.ts`: the same HTML structure, but our
own text. Check that it fails without the fix and passes with it, so the bug
stays covered in CI without committing anyone's content.

## Eval suite (extract-recipe)

Turns the collected inputs into a repeatable test of the prompt, for example to
compare a new model with the production one.

1. **Write the expected output** on an input's page ("Expected output"): one
   ingredient per line, steps separated by a blank line. Start from the page's
   JSON-LD or from a run marked correct, then correct it by hand. Inputs with an
   expected output (and not marked as bad input) are the suite's samples.
2. **Run the suite** from "Eval suite →" on the prompt page: pick the model under
   test (default: the production model) and how many runs per sample. It sends
   the production extraction request with that model and scores each output:
   - **Ingredients** (code): the same lines in any order, ignoring case,
     whitespace and punctuation; "¾", "3/4" and "3⁄4" are the same.
   - **Instruction completeness** (code): all steps joined and compared word by
     word with the same normalisation, so how the text is split into steps
     doesn't matter. Missing and extra passages are listed.
   - **Step division** (AI judge, `claude-sonnet-5-5`, prompt in
     `src/lib/evals/judge.ts`): only when completeness passed.

Each run makes paid API calls (one extraction per sample and run, plus one judge
call when completeness passes). Results are saved to `evals/results/`
(git-ignored) and listed on the suite page.
