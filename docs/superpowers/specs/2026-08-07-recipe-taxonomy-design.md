# Recipe Taxonomy — Tag Groups — Design Spec

**Date:** 2026-08-07
**Status:** Approved (brainstorming)

## Problem

The app is meant to cover a whole day of eating — breakfast, main dishes, side
dishes, sauces, spices, desserts, cakes, cocktails — not just main meals. Tags are
technically sufficient to express that, but the flat single-namespace tag list breaks
down in use:

- **Space.** `RecipeList.tsx` renders *every* distinct tag in the household as a
  wrapping pill row. On mobile this pushes the recipe grid far down the page.
- **Findability.** With a large vocabulary it is hard to locate the tag you want,
  because meal types, cuisines, ingredients and personal labels are interleaved with
  no visual or structural distinction.

The goal is to give tags structure so the app can render them meaningfully, without
forcing that structure on anyone.

### Constraints that shape the design

1. **User autonomy is high value.** No app-owned closed list of courses. A user who
   only cooks main meals must never see a "dessert / cocktail" taxonomy they did not
   ask for.
2. **Guide, don't force.** The app suggests organization; it never requires it.
3. **Tags stay optional.** A user who wants no tags at all keeps working as today.
4. **Every avoidable click is removed.** Minimal user effort is the product thesis.
5. **Power users configure taxonomy in settings** and may want more than one promoted
   grouping.
6. **Onboarding does not exist yet** and is a separate future task.

### Explicitly rejected

- **Exclusive categories.** A risotto is both a main and a side. Every recipe app
  surveyed (Mealie, Tandoor, Paprika, AnyList, Cookidoo) is many-to-many on
  course/meal type; even Cookidoo, the most editorially controlled, lists "Main
  dishes" and "Side dishes" as peers a recipe can hold together. Real JSON-LD in the
  wild agrees — RecipeTin Eats emits `recipeCategory: ["Mains","Starter"]`.
- **A closed, app-owned course list.** Cheaper for import mapping and needs no
  seeding, but violates constraint 1.
- **Binding the taxonomy to `meal_slots.meal_type`.** Asking "is this breakfast or
  dinner?" when adding a recipe to a day is friction with no user value. `meal_type`
  was already declared unused by the 2026-06-09 multi-meal planner spec and stays
  that way.
- **Hierarchical tag trees (Tandoor's model).** Maximum flexibility, but trees are
  the hardest widget to make pleasant on mobile and force a recurring "which parent
  does this belong under?" decision with no right answer.

## Design

A **tag group** is an optional, user-created, user-named bucket that a tag may belong
to. Groups exist to give the UI something to render structure from. A household with
no groups behaves exactly as the app does today.

The key property: **grouping is an attribute of the tag, not of the act of tagging.**
Assigning a tag to a recipe never asks about groups, so the creation flow gains zero
friction. Groups are populated in settings, or (future work) by accepting a
suggestion.

### 1. Data model

`migration 017_tag_groups.sql`:

```sql
CREATE TABLE tag_groups (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  position     INT  NOT NULL DEFAULT 0,
  is_pinned    BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(household_id, name)
);

ALTER TABLE tag_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "household_access" ON tag_groups FOR ALL
  USING (household_id = public.user_household_id())
  WITH CHECK (household_id = public.user_household_id());

ALTER TABLE tags ADD COLUMN group_id UUID REFERENCES tag_groups(id) ON DELETE SET NULL;
```

That is the entire migration. Notably absent:

- **No normalization of `recipes.tags`.** It stays a `TEXT[]`. A tag's group is
  resolved by name-joining to `tags`, exactly the way `color` already is.
- **No backfill and no data migration.** Existing rows are untouched.
- **No `color` on `tag_groups`.** Group-inherited colour was considered and rejected;
  colour belongs to the individual tag (see Deferred work).

The `tags` table remains what it is today: sparse display metadata, with rows created
lazily. Today a row appears when a colour is set; now it also appears when a group is
assigned. The canonical tag list stays derived — `api/tags/route.ts` already unions
the distinct tags across recipe arrays with the metadata rows, and that logic is
unchanged.

`rename_tag` and `delete_tag` (migration 008) need no changes. `group_id` rides along
on rename because the row is updated in place, and disappears with the row on delete.

### 2. Semantics

**A tag has zero or one group.** "Ungrouped" is the absence of a row or a null
`group_id` — it is not a special group. Ungrouped tags are first-class everywhere:
filterable, displayable, never nagged.

**Deleting a group is lossless.** `ON DELETE SET NULL` means member tags survive and
become ungrouped. No recipe is ever affected. This is what makes accepting a
suggested group a safely reversible experiment rather than a commitment.

**`is_pinned` is per-group, and more than one group may be pinned.** A pinned group
gets its own labelled filter row and priority in the recipe card's tag budget.
`position` orders pinned groups relative to each other.

**No exclusivity within a group.** A recipe may hold `main` and `side` from the same
group. This is deliberate; see Explicitly rejected.

**Zero groups reproduces today exactly.** A household that never creates a group sees
no behavioural change on any surface except the filter-bar clamp (section 3), which
is an improvement in its own right.

### 3. Recipe list — filter bar

The filter bar has two renderings sharing one component.

**Without pinned groups.** A single wrapping pill area, most-used first (the ordering
`RecipeList.tsx` already computes), clamped to **two rows** with a "Show all tags"
toggle that expands it in place. This alone fixes the mobile space complaint for
users who never create a group, and can ship independently of the rest.

**With pinned groups.** One labelled section per pinned group, in `position` order,
each showing **all** of its tags in a full wrapping area — deliberately unbounded.
Below them, separated by a rule, a single clamped two-row area containing
**everything not in a pinned group**: ungrouped tags and tags belonging to unpinned
groups, flattened together, most-used first, with the same "Show all tags" toggle.

Rationale for flattening the remainder rather than giving unpinned groups their own
labelled sub-sections: expanding then merely grows the area instead of restructuring
it, and "unpinned" cleanly means "demoted back into the general pool."

Accepted consequence: a pinned group with many tags (say 25 cuisines) pushes the grid
down. Pinning is the user's own lever — if a group becomes unwieldy they unpin or
split it. No cap is imposed.

As today, the filter bar shows only tags present on at least one non-archived recipe.
A group member with no recipes using it appears in settings but not in the filter bar.

Implementation: pills are uniform height, so the two-row clamp is a `max-height` plus
`overflow: hidden`, toggled to unbounded on expand. No JS measurement, and therefore
no `+N` hidden-count indicator.

The group *label* above a row is what teaches the concept — a user learns what groups
are by seeing "Course" over a row of chips, without visiting settings.

### 4. Recipe list — filter semantics

Filtering moves from today's single-select `activeTag` to multi-select with standard
faceted rules:

- **OR within a group** — selecting `main` and `side` shows recipes matching either.
- **AND across groups** — adding `italian` narrows that set.
- Ungrouped tags AND together, and AND with every group.

Consequence: for a household with no groups, all selected tags AND together. The
semantics therefore differ slightly between the grouped and ungrouped renderings.
This is accepted as invisible in practice.

### 5. Recipe card

No layout change. `RecipeCard.tsx` keeps its existing three-tag budget and `+N`
overflow. Only the *ordering* changes: tags from pinned groups first (by group
`position`), then the remainder, then truncate as today. The card becomes more
informative without becoming larger — the pattern every surveyed app converged on.

### 6. Recipe form

**Untouched.** `TagInput.tsx` keeps its type-ahead and most-used quick-add and never
mentions groups. Per-group quick-pick chip rows were considered and rejected: they
would re-import the taxonomy into the creation flow, which is exactly the friction
this design exists to avoid.

### 7. Settings

`TagsEditor.tsx` grows group management:

- Create, rename and delete a group.
- Move a tag into a group or out of it.
- Pin / unpin a group.
- Reorder pinned groups (`position`).

Deleting a group prompts once, then removes the group and leaves its tags ungrouped.

### 8. Import

**Unchanged.** `api/recipes/import/route.ts` keeps its current rule of accepting only
tags already known to the household. Scraped `recipeCategory` / `recipeCuisine` are
not mapped to groups in this phase.

Context for the future work: real-world JSON-LD is unreliable in a way that makes
silent mapping a bad idea. BBC Good Food emits `recipeCategory` as a single
comma-joined string mixing meal slot, course and dish form; The Woks of Life puts an
ingredient there; `keywords` is SEO spam across the board. These values are useful as
*evidence for a suggestion*, not as tags to apply automatically.

## Deferred work

Out of scope for this spec, each its own task. No backend groundwork is done for them
now — designing for them here would be speculative.

1. **Suggestion engine.** Two trigger classes were discussed: *outlier-driven* ("you
   just added a cocktail — want a place for drinks?") and *pattern-driven* ("you have
   italian, mexican and asian — want a row to switch between them?"). The framing
   should sell the UI benefit, not the taxonomy concept: the user accepts a visible
   improvement and the structure arrives with it.
2. **Automatic tag colours.** Colour assigned at tag creation rather than hand-picked,
   ideally semantically linked (banana → yellow, beef → dark red). Note the knock-on:
   once every tag gets a colour on creation, `tags` stops being sparse and becomes a
   dense registry. Nothing breaks — the union in `api/tags/route.ts` still covers
   legacy tags with no row — but the mental model shifts.
3. **Onboarding presets.** Seeding groups for new users at signup.
4. **Import mapping into groups.** Per the evidence above, only alongside the
   suggestion engine.

## Testing

- **Group CRUD** at the API layer, including that deleting a group leaves its member
  tags intact and ungrouped, and that no recipe row is modified.
- **Group resolution** — mapping a recipe's tag name array to groups, covering tags
  with no `tags` row at all (the legacy case).
- **Card ordering** with zero, one and two pinned groups, asserting the three-slot
  budget and `+N` are preserved.
- **Filter semantics** — OR within a group, AND across groups, and the ungrouped
  interaction.
- **No-groups regression** — a household with zero groups produces identical card and
  filter output to the current implementation.
- **Two-row clamp** — the expand toggle switches between clamped and full height.
