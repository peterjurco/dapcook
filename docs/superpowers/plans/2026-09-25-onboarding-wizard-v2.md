# Onboarding Wizard v2 — feedback round

Follow-up to `2026-09-25-onboarding-wizard.md` (implemented). Branch `feat/onboarding-wizard`. Same ground rules: TDD, never hit real Supabase/Anthropic in tests, one commit per numbered item, trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, stage explicit paths only. TS target forbids `[...set]` / iterating `.entries()` → `Array.from`.

New step order: `language → intro → household → translation → units → tags → shopping_categories → invite → done` (progress "Step n of 7", language uncounted). Persisted steps: `translation, units, tags, shopping_categories, invite`.

## 1. Migration 021 + creator-only onboarding

`supabase/migrations/021_onboarding_invite_step.sql` (idempotent):

```sql
-- The shopping rules step became an invite step. Only the household's creator
-- walks the wizard; people who join mid-wizard go straight to the app.
ALTER TABLE households DROP CONSTRAINT IF EXISTS households_onboarding_step_check;
UPDATE households SET onboarding_step = 'invite' WHERE onboarding_step = 'shopping_rules';
ALTER TABLE households
  ADD CONSTRAINT households_onboarding_step_check
  CHECK (onboarding_step IN ('translation', 'units', 'tags', 'shopping_categories', 'invite'));
ALTER TABLE households ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
```

- `src/types/database.ts`: step union → replace `'shopping_rules'` with `'invite'`; add `created_by: string | null` (Row), optional in Insert/Update.
- `src/lib/onboarding/steps.ts`: new order above; `TOTAL_STEPS` becomes 7. Update tests.
- `src/lib/onboarding/status.ts`: replace `readOnboardingStep` with `readOnboardingStatus(householdId): Promise<{ step: PersistedStep | null; createdBy: string | null }>` (same caching/tag; still throws on query error). Add `export function needsOnboarding(status, userId): boolean` = `status.step !== null && status.createdBy === userId`. Tests.
- `createHousehold` inserts `created_by: user.id`.
- `(app)/layout.tsx`: redirect to `/onboarding` only when `needsOnboarding(await readOnboardingStatus(hh), user.id)`. Update layout test (add: a member who isn't the creator is not redirected).
- `src/app/onboarding/page.tsx`: select `created_by` and `invite_token` too; if the household exists and (`onboarding_step` is null OR `created_by !== user id`) → `redirect('/recipes')`. Stored step not in the new list (defensive) → start at `done`. Update page test.

## 2. Back navigation with remembered answers

- `StepFrame` gets optional `onBack` → renders a "Back" text button on the left of the footer (`t('onboarding.back')`: EN "Back", SK "Späť"), disabled while busy.
- Back is available on: intro (→ language), household (→ intro), units (→ translation), tags (→ units), shopping_categories (→ tags), invite (→ shopping_categories). Not on language, not on translation (household already exists). Back is client-side only: no PATCH, no analytics event; the stored step stays the furthest one reached.
- The wizard owns the answers so they survive back/forward: `translation {enabled, language}`, `units`, `tags {selected, custom}` live in `OnboardingWizard` state (initialised from props), and steps become controlled-ish: they receive the current value and report the saved value (`onSaved`) before `onNext`. Steps must render the remembered value when revisited.
- `LanguageStep` on revisit (from intro) just shows the buttons again; choosing re-saves the language.
- Tags must reflect what is saved: the page loads existing `tag_groups` + `tags` for the household and passes them in, so a resumed session (e.g. reload on shopping_categories, then Back) shows saved tags as selected. Map saved group names back to catalog group ids via the localized catalog name; saved tags whose name is not in that group's catalog list become custom chips of that group.
- `POST /api/onboarding/tags` becomes a full sync: the payload is the complete desired set. Only allowed while the household's `onboarding_step` is not null (else 409). It deletes the household's `tags` rows whose name is not in the payload and `tag_groups` whose name is not in the payload (use the existing `delete_tag` RPC for tags so recipe arrays stay consistent — there are no recipes yet, but keep it correct), then upserts as today. An empty payload therefore clears onboarding tags — so the TagsStep always POSTs (even with no selection) when there was a previous save or saved tags exist; with nothing ever selected it may skip the request. Tests for: removal of deselected tag/group, 409 when onboarding finished, existing cases.

## 3. Units examples never wrap mid-value

In `messages/{en,sk}/auth.json` `onboarding.units.metricExamples` / `imperialExamples`, use a non-breaking space (` `) between every number and its unit (`500 g`, `250 ml`, `180 °C`, `1 lb`, `1 cup`, `350 °F`). Remove `onboarding.units.spoons` and its usage/test.

## 4. Tags step copy + catalog

- `onboarding.tags.help`:
  - SK: "V dapcooku si budete ukladať recepty — z webu, z kuchárok alebo vlastné. Štítky ich pomáhajú triediť, aby ste neskôr rýchlo našli napríklad všetky polievky alebo vegánske jedlá. Vyberte len pár, ktoré vám dávajú zmysel — ďalšie môžete kedykoľvek pridať."
  - EN: "In dapcook you'll save recipes — from the web, cookbooks or your own. Tags keep them organized, so later you can quickly find, say, all your soups or vegan dishes. Just pick a few that make sense to you — you can add more anytime."
- `TAG_CATALOG`: remove the `effort` group. Diet: `{ en: 'High-protein', sk: 'Proteín' }`, `{ en: 'Dairy-free', sk: 'Bezmliečne' }`, add `{ en: 'Lactose-free', sk: 'Bezlaktózové' }` after Dairy-free, remove Low-carb and Light. Update catalog test (group ids now `course, cuisine, diet, ingredient`).

## 5. Shopping categories step

- `onboarding.shoppingCategories.help`:
  - SK: "Z receptov, ktoré si naplánujete, vám dapcook zostaví nákupný zoznam a položky roztriedi do týchto kategórií. V obchode potom idete podľa zoznamu a odškrtávate, čo už máte v košíku. Zoraďte kategórie tak, ako zvyčajne prechádzate obchodom — poradie zmeníte potiahnutím."
  - EN: "dapcook builds a shopping list from the recipes you plan and sorts the items into these categories. At the store you follow the list and tick things off as they go into your cart. Order the categories the way you usually walk through your store — drag to reorder."
- `ShoppingCategoriesEditor` (shared with Settings):
  - Replace the trailing `×` delete button with a `Trash2` (lucide) icon button placed right after the pencil. Same aria/title as today.
  - Pencil + bin: hidden until row hover on devices that can hover, always visible on touch: classes `opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100` (verify Tailwind generates them; otherwise add a small `@media (hover: hover)` rule in globals.css).
  - New prop `confirmDelete = true`; when false, delete immediately without `ConfirmModal`. The wizard passes `confirmDelete={false}`; Settings unchanged.
  - Tests for both delete modes.

## 6. Invite step replaces shopping rules

- Delete the rule-suggestion feature completely: `suggestions`/`suggestionsLabel` props and chips in `ShoppingRulesEditor` (restore the pre-suggestion shape, keep the `addRule` helper only if still useful), `ShoppingRulesEditor.test.tsx` (delete if it only tested suggestions), `SHOPPING_RULE_EXAMPLES` in `src/lib/onboarding/defaults.ts` and its test, `onboarding.shoppingRules.*` messages.
- `src/lib/utils/invite.ts`: add `inviteUrl(token: string): string` = `${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/join/${token}`; use it in `settings/page.tsx` too.
- `InviteLink` gains a "Share" button (lucide `Share2`) rendered only when `navigator.share` exists (check in an effect to stay SSR-safe); it calls `navigator.share({ title, text, url })` and ignores `AbortError`. Labels via `settings.inviteLink.share` (EN "Share", SK "Zdieľať") and share text passed as a prop from the wizard (`onboarding.invite.shareText`). Settings uses it too.
- Wizard `invite` step (persisted), inside `StepFrame` with Back, Skip, Next and the settings note:
  - `onboarding.invite.title` — SK "Varte spolu", EN "Cook together"
  - `onboarding.invite.help` — SK "dapcook je najlepší, keď ho používate spolu s ostatnými v domácnosti. Pošlite tento odkaz partnerovi, rodine alebo spolubývajúcim — uvidia rovnaké recepty, jedálniček aj nákupný zoznam, takže nakupovať môže ktokoľvek z vás." EN "dapcook works best when your whole household uses it. Send this link to your partner, family or housemates — they'll see the same recipes, meal plan and shopping list, so anyone can do the shopping."
  - `onboarding.invite.shareText` — SK "Pridaj sa k našej domácnosti v dapcooku", EN "Join our household on dapcook"
  - `InviteLink` with the household's invite URL (passed from the page).
- Leaving `shopping_categories` stores `invite`; leaving `invite` does **not** PATCH (Done finishes onboarding, as today for the last step). PostHog step name: `invite`.

## 7. Docs + verification

- Update `docs/superpowers/specs/2026-09-25-onboarding-wizard-design.md` to the new steps (invite instead of shopping rules, back navigation, creator-only guard, tag sync, catalog changes, migration 021).
- `npx vitest run --exclude '**/scraper.integration.test.ts'`, `npm run type-check`, `npm run lint`, `npm run build` all green.
