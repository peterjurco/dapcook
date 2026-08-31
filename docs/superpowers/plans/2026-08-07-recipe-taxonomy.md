# Recipe Taxonomy (Tag Groups) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users optionally organize tags into named, pinnable groups so the recipe list can render structured filters, and let each user pick a default filter that is pre-applied on every visit.

**Architecture:** One new `tag_groups` table plus a nullable `tags.group_id` and a `profiles.default_recipe_filter` column. `recipes.tags` stays a `TEXT[]` — a tag's group is resolved by name-joining to the existing sparse `tags` metadata table, exactly the way `color` already is. All taxonomy logic (ordering, sectioning, filtering) lives in one pure module, `src/lib/tags/taxonomy.ts`, which is unit-tested in isolation; the React components stay thin. A household with zero groups renders and behaves exactly as today.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Supabase (Postgres + RLS), Tailwind, Vitest + @testing-library/react, lucide-react icons.

**Spec:** `docs/superpowers/specs/2026-08-07-recipe-taxonomy-design.md`

---

## File Structure

**Created:**

| Path | Responsibility |
|---|---|
| `supabase/migrations/017_tag_groups.sql` | Schema: `tag_groups` table, `tags.group_id`, `profiles.default_recipe_filter` |
| `src/lib/tags/taxonomy.ts` | All pure taxonomy logic: usage counts, card ordering, filter sectioning, filter predicate, default sanitization |
| `src/lib/tags/taxonomy.test.ts` | Unit tests for the above |
| `src/app/api/tag-groups/route.ts` | `GET` (list) + `POST` (create) tag groups |
| `src/app/api/tag-groups/route.test.ts` | Tests for the above |
| `src/app/api/tag-groups/[id]/route.ts` | `PATCH` (rename / pin / reorder) + `DELETE` (lossless) |
| `src/app/api/tag-groups/[id]/route.test.ts` | Tests for the above |
| `src/app/api/profile/route.ts` | `PATCH` for `default_recipe_filter` |
| `src/app/api/profile/route.test.ts` | Tests for the above |
| `src/components/settings/TagGroupsEditor.tsx` | Settings UI: create / rename / pin / reorder / delete groups |

**Modified:**

| Path | Change |
|---|---|
| `src/types/database.ts` | Add `tag_groups` table types, `tags.group_id`, `profiles.default_recipe_filter`, export `TagGroup` |
| `src/app/api/tags/route.ts` | `TagData` gains `groupId`; `GET` reads and returns it |
| `src/app/api/tags/[name]/route.ts` | `PATCH` accepts `groupId` |
| `src/components/recipe/RecipeCard.tsx` | Replace `tagColors` prop with `taxonomy`; order pinned-group tags first |
| `src/components/recipe/RecipeCard.test.tsx` | Update to the new prop |
| `src/components/recipe/RecipeList.tsx` | Multi-select filtering, two-row clamp, pinned group sections, default view action |
| `src/app/(app)/recipes/page.tsx` | Load groups + tag metadata + the user's default filter, build `Taxonomy` |
| `src/app/(app)/settings/page.tsx` | Load groups, render `TagGroupsEditor`, pass groups to `TagsEditor` |
| `src/components/settings/TagsEditor.tsx` | Per-tag group assignment dropdown |

**Conventions to follow (from the existing codebase):**

- API route tests start with `// @vitest-environment node`; component tests use the default jsdom environment.
- API routes resolve the household via a local `getHouseholdId(supabase, userId)` helper (see `src/app/api/shopping/categories/route.ts:4`).
- RLS uses the `household_access` policy shape from `supabase/migrations/009_shopping_categories.sql:14`.
- Run tests with `npx vitest run <path>`. Type-check with `npm run type-check`.

---

### Task 1: Migration and database types

**Files:**
- Create: `supabase/migrations/017_tag_groups.sql`
- Modify: `src/types/database.ts`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/017_tag_groups.sql`:

```sql
-- Tag groups: optional, user-created buckets a tag may belong to.
-- Tags remain a TEXT[] on recipes; group membership is metadata on the tags table.
CREATE TABLE tag_groups (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  position     INT  NOT NULL DEFAULT 0,
  is_pinned    BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(household_id, name)
);

CREATE INDEX idx_tag_groups_household ON tag_groups(household_id);

ALTER TABLE tag_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "household_access" ON tag_groups
  FOR ALL USING (household_id = public.user_household_id())
  WITH CHECK (household_id = public.user_household_id());

-- Deleting a group is lossless: member tags survive and become ungrouped.
ALTER TABLE tags ADD COLUMN group_id UUID REFERENCES tag_groups(id) ON DELETE SET NULL;
CREATE INDEX idx_tags_group ON tags(group_id);

-- Per-user default filter for the recipe list. Holds tag names.
ALTER TABLE profiles ADD COLUMN default_recipe_filter TEXT[] NOT NULL DEFAULT '{}';
```

- [ ] **Step 2: Add the `tag_groups` table to the generated types**

In `src/types/database.ts`, insert this block immediately before the `tags: {` entry (currently at line 163):

```ts
      tag_groups: {
        Row: {
          id: string
          household_id: string
          name: string
          position: number
          is_pinned: boolean
          created_at: string
        }
        Insert: {
          id?: string
          household_id: string
          name: string
          position?: number
          is_pinned?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          name?: string
          position?: number
          is_pinned?: boolean
          created_at?: string
        }
        Relationships: []
      }
```

- [ ] **Step 3: Add `group_id` to the `tags` table types**

In `src/types/database.ts`, in the `tags` entry, add `group_id` after `color` in all three shapes:

```ts
      tags: {
        Row: {
          id: string
          household_id: string
          name: string
          color: string | null
          group_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          household_id: string
          name: string
          color?: string | null
          group_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          name?: string
          color?: string | null
          group_id?: string | null
          created_at?: string
        }
        Relationships: []
      }
```

- [ ] **Step 4: Add `default_recipe_filter` to the `profiles` types**

In `src/types/database.ts`, in the `profiles` entry (starting line 39), add the field to all three shapes:

```ts
      profiles: {
        Row: {
          id: string
          household_id: string | null
          display_name: string | null
          avatar_url: string | null
          default_recipe_filter: string[]
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          household_id?: string | null
          display_name?: string | null
          avatar_url?: string | null
          default_recipe_filter?: string[]
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          household_id?: string | null
          display_name?: string | null
          avatar_url?: string | null
          default_recipe_filter?: string[]
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
```

- [ ] **Step 5: Export the `TagGroup` convenience type**

In `src/types/database.ts`, in the "Convenience types" block near the end (around line 483), add after `export type Profile = Tables<'profiles'>`:

```ts
export type TagGroup = Tables<'tag_groups'>
```

- [ ] **Step 6: Verify types compile**

Run: `npm run type-check`
Expected: exits 0, no output.

- [ ] **Step 7: Apply the migration to Supabase**

This repo has no `supabase/config.toml` and no migration script in `package.json`, so migrations are applied by hand. Paste the contents of `supabase/migrations/017_tag_groups.sql` into the Supabase SQL editor for the project and run it (or run `supabase db push` if the CLI is linked locally).

Expected: `CREATE TABLE`, `CREATE INDEX` and both `ALTER TABLE` statements succeed with no error.

**This step needs project credentials — stop and ask the user to run it if you don't have access.** Every task after this one reads `tag_groups`, `tags.group_id` and `profiles.default_recipe_filter`, so the app will 500 at runtime until it is applied. Unit tests mock Supabase and will still pass, so a green test run is not evidence the migration landed.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/017_tag_groups.sql src/types/database.ts
git commit -m "feat: add tag_groups schema and types"
```

---

### Task 2: Taxonomy module — pure logic

This is the DRY core. Every later task consumes it, so it is built and tested first, with no UI involved.

**Files:**
- Create: `src/lib/tags/taxonomy.ts`
- Test: `src/lib/tags/taxonomy.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/tags/taxonomy.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  EMPTY_TAXONOMY,
  buildFilterSections,
  filterRecipesByTags,
  orderTagsForCard,
  pinnedGroups,
  sanitizeDefaultFilter,
  tagsByUsage,
  type Taxonomy,
} from './taxonomy'
import type { Recipe } from '@/types/database'

function makeRecipe(id: string, tags: string[]): Recipe {
  return {
    id,
    household_id: 'hh-1',
    created_by: 'user-1',
    title: id,
    description: null,
    source_url: null,
    image_url: null,
    prep_time_min: null,
    cook_time_min: null,
    servings: null,
    tags,
    ingredients: [],
    steps: [],
    notes: null,
    is_archived: false,
    last_used_at: null,
    share_token: null,
    title_normalized: id,
    created_at: '2026-08-07T00:00:00.000Z',
    updated_at: '2026-08-07T00:00:00.000Z',
  } as Recipe
}

const course = { id: 'g-course', name: 'Course', position: 0, is_pinned: true }
const cuisine = { id: 'g-cuisine', name: 'Cuisine', position: 1, is_pinned: true }
const mood = { id: 'g-mood', name: 'Mood', position: 2, is_pinned: false }

const taxonomy: Taxonomy = {
  groups: [course, cuisine, mood],
  tags: {
    main: { color: null, groupId: 'g-course' },
    side: { color: null, groupId: 'g-course' },
    dessert: { color: null, groupId: 'g-course' },
    italian: { color: null, groupId: 'g-cuisine' },
    asian: { color: null, groupId: 'g-cuisine' },
    comfort: { color: null, groupId: 'g-mood' },
    quick: { color: null, groupId: null },
    vegan: { color: null, groupId: null },
  },
}

describe('pinnedGroups', () => {
  it('returns only pinned groups, ordered by position', () => {
    expect(pinnedGroups(taxonomy).map((g) => g.id)).toEqual(['g-course', 'g-cuisine'])
  })

  it('returns an empty array for a taxonomy with no groups', () => {
    expect(pinnedGroups(EMPTY_TAXONOMY)).toEqual([])
  })
})

describe('tagsByUsage', () => {
  it('orders tags by descending usage count', () => {
    const recipes = [
      makeRecipe('r1', ['main', 'italian']),
      makeRecipe('r2', ['main']),
      makeRecipe('r3', ['vegan']),
    ]
    expect(tagsByUsage(recipes)).toEqual(['main', 'italian', 'vegan'])
  })

  it('returns an empty array when no recipe has tags', () => {
    expect(tagsByUsage([makeRecipe('r1', [])])).toEqual([])
  })
})

describe('orderTagsForCard', () => {
  it('puts pinned-group tags first, ordered by group position', () => {
    const result = orderTagsForCard(['quick', 'italian', 'main'], taxonomy)
    expect(result).toEqual(['main', 'italian', 'quick'])
  })

  it('keeps tags from unpinned groups in the remainder', () => {
    const result = orderTagsForCard(['comfort', 'main'], taxonomy)
    expect(result).toEqual(['main', 'comfort'])
  })

  it('preserves the original order when no groups exist', () => {
    const result = orderTagsForCard(['quick', 'vegan'], EMPTY_TAXONOMY)
    expect(result).toEqual(['quick', 'vegan'])
  })

  it('preserves relative order within the same group', () => {
    const result = orderTagsForCard(['side', 'main'], taxonomy)
    expect(result).toEqual(['side', 'main'])
  })
})

describe('buildFilterSections', () => {
  const recipes = [
    makeRecipe('r1', ['main', 'italian', 'quick']),
    makeRecipe('r2', ['main', 'comfort']),
    makeRecipe('r3', ['dessert', 'vegan']),
  ]

  it('returns no pinned sections and all tags in rest when there are no groups', () => {
    const sections = buildFilterSections(recipes, EMPTY_TAXONOMY)
    expect(sections.pinned).toEqual([])
    expect(sections.rest).toEqual(['main', 'italian', 'quick', 'comfort', 'dessert', 'vegan'])
  })

  it('splits tags into pinned group sections and a flattened remainder', () => {
    const sections = buildFilterSections(recipes, taxonomy)
    expect(sections.pinned.map((s) => s.group.id)).toEqual(['g-course', 'g-cuisine'])
    expect(sections.pinned[0].tags).toEqual(['main', 'dessert'])
    expect(sections.pinned[1].tags).toEqual(['italian'])
    expect(sections.rest).toEqual(['quick', 'comfort', 'vegan'])
  })

  it('omits pinned group members that no recipe uses', () => {
    const sections = buildFilterSections([makeRecipe('r1', ['main'])], taxonomy)
    expect(sections.pinned[0].tags).toEqual(['main'])
    expect(sections.pinned[1].tags).toEqual([])
  })

  it('drops pinned sections that end up empty', () => {
    const sections = buildFilterSections([makeRecipe('r1', ['quick'])], taxonomy)
    expect(sections.pinned).toEqual([])
    expect(sections.rest).toEqual(['quick'])
  })
})

describe('filterRecipesByTags', () => {
  const recipes = [
    makeRecipe('r1', ['main', 'italian', 'quick']),
    makeRecipe('r2', ['side', 'italian']),
    makeRecipe('r3', ['main', 'asian']),
    makeRecipe('r4', ['dessert', 'quick', 'vegan']),
  ]

  it('returns everything when nothing is selected', () => {
    expect(filterRecipesByTags(recipes, [], taxonomy)).toHaveLength(4)
  })

  it('ORs tags within the same group', () => {
    const result = filterRecipesByTags(recipes, ['main', 'side'], taxonomy)
    expect(result.map((r) => r.id)).toEqual(['r1', 'r2', 'r3'])
  })

  it('ANDs across different groups', () => {
    const result = filterRecipesByTags(recipes, ['main', 'side', 'italian'], taxonomy)
    expect(result.map((r) => r.id)).toEqual(['r1', 'r2'])
  })

  it('ANDs ungrouped tags with each other', () => {
    const result = filterRecipesByTags(recipes, ['quick', 'vegan'], taxonomy)
    expect(result.map((r) => r.id)).toEqual(['r4'])
  })

  it('ANDs ungrouped tags with grouped ones', () => {
    const result = filterRecipesByTags(recipes, ['main', 'quick'], taxonomy)
    expect(result.map((r) => r.id)).toEqual(['r1'])
  })

  it('ANDs every tag when there are no groups', () => {
    const result = filterRecipesByTags(recipes, ['main', 'italian'], EMPTY_TAXONOMY)
    expect(result.map((r) => r.id)).toEqual(['r1'])
  })

  it('treats tags from unpinned groups as grouped', () => {
    const extra = [...recipes, makeRecipe('r5', ['comfort'])]
    const result = filterRecipesByTags(extra, ['comfort'], taxonomy)
    expect(result.map((r) => r.id)).toEqual(['r5'])
  })
})

describe('sanitizeDefaultFilter', () => {
  it('keeps only names that still exist', () => {
    expect(sanitizeDefaultFilter(['main', 'gone'], ['main', 'side'])).toEqual(['main'])
  })

  it('returns an empty array when nothing survives', () => {
    expect(sanitizeDefaultFilter(['gone'], ['main'])).toEqual([])
  })

  it('handles an empty stored default', () => {
    expect(sanitizeDefaultFilter([], ['main'])).toEqual([])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/tags/taxonomy.test.ts`
Expected: FAIL — `Failed to resolve import "./taxonomy"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/tags/taxonomy.ts`:

```ts
import type { Recipe, TagGroup } from '@/types/database'

export type TagGroupView = Pick<TagGroup, 'id' | 'name' | 'position' | 'is_pinned'>

export interface TagMeta {
  color: string | null
  groupId: string | null
}

export interface Taxonomy {
  /** Every group in the household, pinned or not. */
  groups: TagGroupView[]
  /** Tag name -> metadata. Tags absent from this map are ungrouped and uncoloured. */
  tags: Record<string, TagMeta>
}

export const EMPTY_TAXONOMY: Taxonomy = { groups: [], tags: {} }

export function tagColor(taxonomy: Taxonomy, name: string): string | null {
  return taxonomy.tags[name]?.color ?? null
}

export function tagGroupId(taxonomy: Taxonomy, name: string): string | null {
  return taxonomy.tags[name]?.groupId ?? null
}

export function pinnedGroups(taxonomy: Taxonomy): TagGroupView[] {
  return taxonomy.groups
    .filter((g) => g.is_pinned)
    .sort((a, b) => a.position - b.position)
}

/** Tag names used by at least one of the given recipes, most-used first. */
export function tagsByUsage(recipes: Recipe[]): string[] {
  const counts = new Map<string, number>()
  for (const recipe of recipes) {
    for (const tag of recipe.tags ?? []) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([tag]) => tag)
}

/**
 * Card ordering: tags belonging to pinned groups first (by group position),
 * then everything else. Relative order is preserved within each bucket.
 */
export function orderTagsForCard(tags: string[], taxonomy: Taxonomy): string[] {
  const rank = new Map<string, number>()
  pinnedGroups(taxonomy).forEach((group, index) => rank.set(group.id, index))

  const pinned: string[] = []
  const rest: string[] = []
  for (const tag of tags) {
    const groupId = tagGroupId(taxonomy, tag)
    if (groupId !== null && rank.has(groupId)) pinned.push(tag)
    else rest.push(tag)
  }

  pinned.sort((a, b) => rank.get(tagGroupId(taxonomy, a)!)! - rank.get(tagGroupId(taxonomy, b)!)!)
  return [...pinned, ...rest]
}

export interface FilterSection {
  group: TagGroupView
  tags: string[]
}

export interface FilterSections {
  /** One section per pinned group that has at least one in-use tag. */
  pinned: FilterSection[]
  /** Everything not in a pinned group, flattened, most-used first. */
  rest: string[]
}

export function buildFilterSections(recipes: Recipe[], taxonomy: Taxonomy): FilterSections {
  const inUse = tagsByUsage(recipes)
  const groups = pinnedGroups(taxonomy)
  const pinnedIds = new Set(groups.map((g) => g.id))

  const pinned: FilterSection[] = groups
    .map((group) => ({
      group,
      tags: inUse.filter((tag) => tagGroupId(taxonomy, tag) === group.id),
    }))
    .filter((section) => section.tags.length > 0)

  const rest = inUse.filter((tag) => {
    const groupId = tagGroupId(taxonomy, tag)
    return groupId === null || !pinnedIds.has(groupId)
  })

  return { pinned, rest }
}

/**
 * Faceted filtering: OR within a group, AND across groups.
 * Ungrouped tags AND with each other and with every group.
 */
export function filterRecipesByTags(
  recipes: Recipe[],
  selection: string[],
  taxonomy: Taxonomy
): Recipe[] {
  if (selection.length === 0) return recipes

  const byGroup = new Map<string, string[]>()
  const ungrouped: string[] = []
  for (const tag of selection) {
    const groupId = tagGroupId(taxonomy, tag)
    if (groupId === null) ungrouped.push(tag)
    else byGroup.set(groupId, [...(byGroup.get(groupId) ?? []), tag])
  }

  return recipes.filter((recipe) => {
    const tags = recipe.tags ?? []
    for (const tag of ungrouped) {
      if (!tags.includes(tag)) return false
    }
    for (const groupTags of byGroup.values()) {
      if (!groupTags.some((tag) => tags.includes(tag))) return false
    }
    return true
  })
}

/** Drop stored default-filter names that no longer exist, so a stale default
 *  degrades to "no default" rather than "no recipes". */
export function sanitizeDefaultFilter(stored: string[], knownTags: string[]): string[] {
  const known = new Set(knownTags)
  return stored.filter((name) => known.has(name))
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/tags/taxonomy.test.ts`
Expected: PASS — 21 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tags/taxonomy.ts src/lib/tags/taxonomy.test.ts
git commit -m "feat: add pure tag taxonomy module"
```

---

### Task 3: Tag groups API — list and create

**Files:**
- Create: `src/app/api/tag-groups/route.ts`
- Test: `src/app/api/tag-groups/route.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/app/api/tag-groups/route.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET, POST } from './route'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
import { createClient } from '@/lib/supabase/server'

const mockUser = { id: 'user-1' }

interface MockResult { data: unknown; error: null | { message: string } }

function makeQB(result: MockResult) {
  const qb: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
    maybeSingle: vi.fn().mockResolvedValue(result),
    then: (
      onfulfilled?: ((v: unknown) => unknown) | null,
      onrejected?: ((r: unknown) => unknown) | null
    ) => Promise.resolve(result).then(onfulfilled, onrejected),
  }
  return qb
}

function makeSupabase({
  user = mockUser as typeof mockUser | null,
  profileResult = { data: { household_id: 'hh-1' }, error: null } as MockResult,
  groupsResult = { data: [] as unknown[], error: null } as MockResult,
} = {}) {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
    from: vi.fn((table: string) => {
      if (table === 'profiles') return makeQB(profileResult)
      if (table === 'tag_groups') return makeQB(groupsResult)
      throw new Error(`Unexpected table: ${table}`)
    }),
  }
}

function req(url: string, opts?: Record<string, unknown>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new NextRequest(`http://localhost${url}`, opts as any)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/tag-groups', () => {
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(createClient).mockReturnValue(makeSupabase({ user: null }) as unknown as ReturnType<typeof createClient>)
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns 403 when the user has no household', async () => {
    vi.mocked(createClient).mockReturnValue(
      makeSupabase({ profileResult: { data: { household_id: null }, error: null } }) as unknown as ReturnType<typeof createClient>
    )
    const res = await GET()
    expect(res.status).toBe(403)
  })

  it('returns the household groups ordered by position', async () => {
    const groups = [{ id: 'g1', name: 'Course', position: 0, is_pinned: true }]
    const supabase = makeSupabase({ groupsResult: { data: groups, error: null } })
    vi.mocked(createClient).mockReturnValue(supabase as unknown as ReturnType<typeof createClient>)

    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(groups)

    const qb = supabase.from.mock.results[1].value
    expect(qb.order).toHaveBeenCalledWith('position')
  })
})

describe('POST /api/tag-groups', () => {
  it('returns 400 when name is missing', async () => {
    vi.mocked(createClient).mockReturnValue(makeSupabase() as unknown as ReturnType<typeof createClient>)
    const res = await POST(req('/api/tag-groups', { method: 'POST', body: JSON.stringify({}) }))
    expect(res.status).toBe(400)
  })

  it('creates a group at the end of the ordering and returns 201', async () => {
    const created = { id: 'g-new', name: 'Cuisine', position: 3, is_pinned: false }
    const supabase = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: mockUser } }) },
      from: vi.fn((table: string) => {
        if (table === 'profiles') return makeQB({ data: { household_id: 'hh-1' }, error: null })
        if (table === 'tag_groups') return makeQB({ data: created, error: null })
        throw new Error(`Unexpected table: ${table}`)
      }),
    }
    vi.mocked(createClient).mockReturnValue(supabase as unknown as ReturnType<typeof createClient>)

    const res = await POST(req('/api/tag-groups', {
      method: 'POST',
      body: JSON.stringify({ name: '  Cuisine  ' }),
    }))

    expect(res.status).toBe(201)
    expect(await res.json()).toEqual(created)

    const insertQB = supabase.from.mock.results[2].value
    const inserted = insertQB.insert.mock.calls[0][0] as Record<string, unknown>
    expect(inserted.name).toBe('Cuisine')
    expect(inserted.household_id).toBe('hh-1')
    expect(inserted.is_pinned).toBe(false)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/app/api/tag-groups/route.test.ts`
Expected: FAIL — `Failed to resolve import "./route"`.

- [ ] **Step 3: Write the implementation**

Create `src/app/api/tag-groups/route.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

async function getHouseholdId(supabase: ReturnType<typeof createClient>, userId: string) {
  const { data } = await supabase.from('profiles').select('household_id').eq('id', userId).single()
  return data?.household_id ?? null
}

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const householdId = await getHouseholdId(supabase, user.id)
  if (!householdId) return NextResponse.json({ error: 'No household' }, { status: 403 })

  const { data, error } = await supabase
    .from('tag_groups')
    .select('*')
    .eq('household_id', householdId)
    .order('position')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data ?? [])
}

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const householdId = await getHouseholdId(supabase, user.id)
  if (!householdId) return NextResponse.json({ error: 'No household' }, { status: 403 })

  const body = await request.json() as { name?: string; is_pinned?: boolean }
  const name = body.name?.trim()
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })

  const { data: last } = await supabase
    .from('tag_groups')
    .select('position')
    .eq('household_id', householdId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data, error } = await supabase
    .from('tag_groups')
    .insert({
      household_id: householdId,
      name,
      position: (last?.position ?? -1) + 1,
      is_pinned: body.is_pinned ?? false,
    })
    .select()
    .single()

  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Failed' }, { status: 500 })

  return NextResponse.json(data, { status: 201 })
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/app/api/tag-groups/route.test.ts`
Expected: PASS — 5 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/tag-groups/route.ts src/app/api/tag-groups/route.test.ts
git commit -m "feat: add tag groups list and create API"
```

---

### Task 4: Tag groups API — update and delete

`DELETE` must be lossless: the handler touches only `tag_groups`. The database clears `tags.group_id` via `ON DELETE SET NULL`, and no recipe is ever modified. The test asserts exactly that.

**Files:**
- Create: `src/app/api/tag-groups/[id]/route.ts`
- Test: `src/app/api/tag-groups/[id]/route.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/app/api/tag-groups/[id]/route.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { PATCH, DELETE } from './route'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
import { createClient } from '@/lib/supabase/server'

const mockUser = { id: 'user-1' }

interface MockResult { data: unknown; error: null | { message: string } }

function makeQB(result: MockResult) {
  const qb: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
    then: (
      onfulfilled?: ((v: unknown) => unknown) | null,
      onrejected?: ((r: unknown) => unknown) | null
    ) => Promise.resolve(result).then(onfulfilled, onrejected),
  }
  return qb
}

function makeSupabase({
  user = mockUser as typeof mockUser | null,
  profileResult = { data: { household_id: 'hh-1' }, error: null } as MockResult,
  groupResult = { data: { id: 'g1' }, error: null } as MockResult,
} = {}) {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
    from: vi.fn((table: string) => {
      if (table === 'profiles') return makeQB(profileResult)
      if (table === 'tag_groups') return makeQB(groupResult)
      throw new Error(`Unexpected table: ${table}`)
    }),
  }
}

function req(body?: unknown) {
  return new NextRequest('http://localhost/api/tag-groups/g1', {
    method: 'PATCH',
    body: JSON.stringify(body ?? {}),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)
}

const params = { params: { id: 'g1' } }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('PATCH /api/tag-groups/[id]', () => {
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(createClient).mockReturnValue(makeSupabase({ user: null }) as unknown as ReturnType<typeof createClient>)
    const res = await PATCH(req({ name: 'x' }), params)
    expect(res.status).toBe(401)
  })

  it('returns 400 when the body has no updatable field', async () => {
    vi.mocked(createClient).mockReturnValue(makeSupabase() as unknown as ReturnType<typeof createClient>)
    const res = await PATCH(req({}), params)
    expect(res.status).toBe(400)
  })

  it('updates the name, trimmed', async () => {
    const supabase = makeSupabase()
    vi.mocked(createClient).mockReturnValue(supabase as unknown as ReturnType<typeof createClient>)

    const res = await PATCH(req({ name: '  Course  ' }), params)
    expect(res.status).toBe(200)

    const qb = supabase.from.mock.results[1].value
    expect(qb.update).toHaveBeenCalledWith({ name: 'Course' })
    expect(qb.eq).toHaveBeenCalledWith('id', 'g1')
    expect(qb.eq).toHaveBeenCalledWith('household_id', 'hh-1')
  })

  it('updates is_pinned and position together', async () => {
    const supabase = makeSupabase()
    vi.mocked(createClient).mockReturnValue(supabase as unknown as ReturnType<typeof createClient>)

    await PATCH(req({ is_pinned: true, position: 2 }), params)

    const qb = supabase.from.mock.results[1].value
    expect(qb.update).toHaveBeenCalledWith({ is_pinned: true, position: 2 })
  })

  it('rejects an empty name', async () => {
    vi.mocked(createClient).mockReturnValue(makeSupabase() as unknown as ReturnType<typeof createClient>)
    const res = await PATCH(req({ name: '   ' }), params)
    expect(res.status).toBe(400)
  })
})

describe('DELETE /api/tag-groups/[id]', () => {
  it('returns 204 and deletes only from tag_groups', async () => {
    const supabase = makeSupabase()
    vi.mocked(createClient).mockReturnValue(supabase as unknown as ReturnType<typeof createClient>)

    const res = await DELETE(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      new NextRequest('http://localhost/api/tag-groups/g1', { method: 'DELETE' } as any),
      params
    )

    expect(res.status).toBe(204)

    const touched = supabase.from.mock.calls.map((c) => c[0])
    expect(touched).toEqual(['profiles', 'tag_groups'])
    expect(touched).not.toContain('recipes')
    expect(touched).not.toContain('tags')

    const qb = supabase.from.mock.results[1].value
    expect(qb.delete).toHaveBeenCalled()
    expect(qb.eq).toHaveBeenCalledWith('id', 'g1')
    expect(qb.eq).toHaveBeenCalledWith('household_id', 'hh-1')
  })

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(createClient).mockReturnValue(makeSupabase({ user: null }) as unknown as ReturnType<typeof createClient>)
    const res = await DELETE(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      new NextRequest('http://localhost/api/tag-groups/g1', { method: 'DELETE' } as any),
      params
    )
    expect(res.status).toBe(401)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/app/api/tag-groups/\[id\]/route.test.ts`
Expected: FAIL — `Failed to resolve import "./route"`.

- [ ] **Step 3: Write the implementation**

Create `src/app/api/tag-groups/[id]/route.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

async function getHouseholdId(supabase: ReturnType<typeof createClient>, userId: string) {
  const { data } = await supabase.from('profiles').select('household_id').eq('id', userId).single()
  return data?.household_id ?? null
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const householdId = await getHouseholdId(supabase, user.id)
  if (!householdId) return NextResponse.json({ error: 'No household' }, { status: 403 })

  const body = await request.json() as { name?: string; is_pinned?: boolean; position?: number }
  const updates: { name?: string; is_pinned?: boolean; position?: number } = {}

  if (body.name !== undefined) {
    const name = body.name.trim()
    if (!name) return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 })
    updates.name = name
  }
  if (body.is_pinned !== undefined) updates.is_pinned = body.is_pinned
  if (body.position !== undefined) updates.position = body.position

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const { error } = await supabase
    .from('tag_groups')
    .update(updates)
    .eq('id', params.id)
    .eq('household_id', householdId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const householdId = await getHouseholdId(supabase, user.id)
  if (!householdId) return NextResponse.json({ error: 'No household' }, { status: 403 })

  // Lossless by construction: tags.group_id is ON DELETE SET NULL, and no
  // recipe row is touched. Member tags simply become ungrouped.
  const { error } = await supabase
    .from('tag_groups')
    .delete()
    .eq('id', params.id)
    .eq('household_id', householdId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return new NextResponse(null, { status: 204 })
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/app/api/tag-groups/\[id\]/route.test.ts`
Expected: PASS — 7 tests passing.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/tag-groups/[id]/route.ts" "src/app/api/tag-groups/[id]/route.test.ts"
git commit -m "feat: add tag group update and lossless delete API"
```

---

### Task 5: Expose and set a tag's group

`TagData` gains `groupId`, and `PATCH /api/tags/[name]` accepts `groupId` so the settings UI can assign a tag to a group (or clear it with `null`).

**Files:**
- Modify: `src/app/api/tags/route.ts`
- Modify: `src/app/api/tags/[name]/route.ts`
- Test: `src/app/api/tags/route.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/app/api/tags/route.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from './route'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
import { createClient } from '@/lib/supabase/server'

const mockUser = { id: 'user-1' }

interface MockResult { data: unknown; error: null | { message: string } }

function makeQB(result: MockResult) {
  const qb: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
    then: (
      onfulfilled?: ((v: unknown) => unknown) | null,
      onrejected?: ((r: unknown) => unknown) | null
    ) => Promise.resolve(result).then(onfulfilled, onrejected),
  }
  return qb
}

function makeSupabase({
  recipesResult = { data: [] as unknown[], error: null } as MockResult,
  tagsResult = { data: [] as unknown[], error: null } as MockResult,
} = {}) {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: mockUser } }) },
    from: vi.fn((table: string) => {
      if (table === 'profiles') return makeQB({ data: { household_id: 'hh-1' }, error: null })
      if (table === 'recipes') return makeQB(recipesResult)
      if (table === 'tags') return makeQB(tagsResult)
      throw new Error(`Unexpected table: ${table}`)
    }),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/tags', () => {
  it('returns each tag with its colour and group id', async () => {
    const supabase = makeSupabase({
      recipesResult: { data: [{ tags: ['main', 'quick'] }, { tags: ['main'] }], error: null },
      tagsResult: { data: [{ name: 'main', color: '#ef4444', group_id: 'g-course' }], error: null },
    })
    vi.mocked(createClient).mockReturnValue(supabase as unknown as ReturnType<typeof createClient>)

    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([
      { name: 'main', color: '#ef4444', groupId: 'g-course', count: 2 },
      { name: 'quick', color: null, groupId: null, count: 1 },
    ])
  })

  it('includes unused tags that carry metadata', async () => {
    const supabase = makeSupabase({
      recipesResult: { data: [], error: null },
      tagsResult: { data: [{ name: 'orphan', color: null, group_id: 'g-course' }], error: null },
    })
    vi.mocked(createClient).mockReturnValue(supabase as unknown as ReturnType<typeof createClient>)

    const res = await GET()
    expect(await res.json()).toEqual([
      { name: 'orphan', color: null, groupId: 'g-course', count: 0 },
    ])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/api/tags/route.test.ts`
Expected: FAIL — received objects have no `groupId` property.

- [ ] **Step 3: Update `GET /api/tags`**

In `src/app/api/tags/route.ts`, replace the `TagData` interface and the body of `GET` (lines 4–48) with:

```ts
export interface TagData {
  name: string
  color: string | null
  groupId: string | null
  count: number
}

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('household_id').eq('id', user.id).single()
  if (!profile?.household_id) return NextResponse.json({ error: 'No household' }, { status: 403 })

  const [{ data: recipes }, { data: tagsMeta }] = await Promise.all([
    supabase.from('recipes').select('tags').eq('household_id', profile.household_id).eq('is_archived', false),
    supabase.from('tags').select('name, color, group_id').eq('household_id', profile.household_id),
  ])

  // Count usage per tag
  const counts = new Map<string, number>()
  for (const recipe of recipes ?? []) {
    for (const tag of recipe.tags ?? []) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
  }

  // Merge metadata
  const metaMap = new Map<string, { color: string | null; groupId: string | null }>()
  for (const t of tagsMeta ?? []) metaMap.set(t.name, { color: t.color, groupId: t.group_id })

  const result: TagData[] = Array.from(counts.entries())
    .map(([name, count]) => ({
      name,
      color: metaMap.get(name)?.color ?? null,
      groupId: metaMap.get(name)?.groupId ?? null,
      count,
    }))
    .sort((a, b) => b.count - a.count)

  // Also include tags with metadata but 0 usage (in case they were just coloured or grouped)
  for (const t of tagsMeta ?? []) {
    if (!counts.has(t.name)) {
      result.push({ name: t.name, color: t.color, groupId: t.group_id, count: 0 })
    }
  }

  return NextResponse.json(result)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/app/api/tags/route.test.ts`
Expected: PASS — 2 tests passing.

- [ ] **Step 5: Accept `groupId` in `PATCH /api/tags/[name]`**

In `src/app/api/tags/[name]/route.ts`, replace the body parse and the `body.color` block (lines 21–41) with:

```ts
  const body = await request.json() as {
    newName?: string
    color?: string | null
    groupId?: string | null
  }

  if (body.newName !== undefined) {
    const newName = body.newName.trim().toLowerCase()
    if (!newName) return NextResponse.json({ error: 'newName cannot be empty' }, { status: 400 })
    // Rename tag across all recipes + tags table atomically
    const { error } = await supabase.rpc('rename_tag', {
      p_household_id: householdId,
      p_old_name: oldName,
      p_new_name: newName,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (body.color !== undefined || body.groupId !== undefined) {
    const nameForMeta = body.newName?.trim().toLowerCase() ?? oldName
    const row: { household_id: string; name: string; color?: string | null; group_id?: string | null } = {
      household_id: householdId,
      name: nameForMeta,
    }
    if (body.color !== undefined) row.color = body.color
    if (body.groupId !== undefined) row.group_id = body.groupId

    const { error } = await supabase
      .from('tags')
      .upsert(row, { onConflict: 'household_id,name' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
```

Note: the existing `if (body.newName !== undefined)` block is shown again above because it sits between the parse and the metadata block — replace the whole span in one edit rather than leaving a duplicate.

- [ ] **Step 6: Fix the existing `TagData` consumers**

`TagData` now requires `groupId`. Update the two places that construct it.

In `src/app/(app)/settings/page.tsx`, replace the tag-count block (the `colorMap` / `allTags` section) with:

```ts
  const tagCounts = new Map<string, number>()
  for (const r of recipes ?? []) {
    for (const tag of r.tags ?? []) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
  }
  const metaMap = new Map((tagsMeta ?? []).map((t) => [t.name, { color: t.color, groupId: t.group_id }]))
  const allTags: TagData[] = Array.from(tagCounts.entries())
    .map(([name, count]) => ({
      name,
      color: metaMap.get(name)?.color ?? null,
      groupId: metaMap.get(name)?.groupId ?? null,
      count,
    }))
    .sort((a, b) => b.count - a.count)
  for (const t of tagsMeta ?? []) {
    if (!tagCounts.has(t.name)) {
      allTags.push({ name: t.name, color: t.color, groupId: t.group_id, count: 0 })
    }
  }
```

And in the same file's `Promise.all`, change the tags query to select the new column:

```ts
    supabase.from('tags').select('name, color, group_id').eq('household_id', profile.household_id),
```

- [ ] **Step 7: Verify the whole suite and types still pass**

Run: `npx vitest run && npm run type-check`
Expected: all tests PASS, type-check exits 0.

- [ ] **Step 8: Commit**

```bash
git add src/app/api/tags/route.ts src/app/api/tags/route.test.ts "src/app/api/tags/[name]/route.ts" "src/app/(app)/settings/page.tsx"
git commit -m "feat: expose and set tag group membership via the tags API"
```

---

### Task 6: Profile API — default recipe filter

**Files:**
- Create: `src/app/api/profile/route.ts`
- Test: `src/app/api/profile/route.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/app/api/profile/route.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { PATCH } from './route'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
import { createClient } from '@/lib/supabase/server'

const mockUser = { id: 'user-1' }

interface MockResult { data: unknown; error: null | { message: string } }

function makeQB(result: MockResult) {
  const qb: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
    then: (
      onfulfilled?: ((v: unknown) => unknown) | null,
      onrejected?: ((r: unknown) => unknown) | null
    ) => Promise.resolve(result).then(onfulfilled, onrejected),
  }
  return qb
}

function makeSupabase({
  user = mockUser as typeof mockUser | null,
  profileResult = { data: null, error: null } as MockResult,
} = {}) {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
    from: vi.fn((table: string) => {
      if (table === 'profiles') return makeQB(profileResult)
      throw new Error(`Unexpected table: ${table}`)
    }),
  }
}

function req(body: unknown) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new NextRequest('http://localhost/api/profile', { method: 'PATCH', body: JSON.stringify(body) } as any)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('PATCH /api/profile', () => {
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(createClient).mockReturnValue(makeSupabase({ user: null }) as unknown as ReturnType<typeof createClient>)
    const res = await PATCH(req({ default_recipe_filter: ['main'] }))
    expect(res.status).toBe(401)
  })

  it('stores the default filter for the current user only', async () => {
    const supabase = makeSupabase()
    vi.mocked(createClient).mockReturnValue(supabase as unknown as ReturnType<typeof createClient>)

    const res = await PATCH(req({ default_recipe_filter: ['main', 'italian'] }))
    expect(res.status).toBe(200)

    const qb = supabase.from.mock.results[0].value
    expect(qb.update).toHaveBeenCalledWith({ default_recipe_filter: ['main', 'italian'] })
    expect(qb.eq).toHaveBeenCalledWith('id', 'user-1')
  })

  it('accepts an empty array to clear the default', async () => {
    const supabase = makeSupabase()
    vi.mocked(createClient).mockReturnValue(supabase as unknown as ReturnType<typeof createClient>)

    const res = await PATCH(req({ default_recipe_filter: [] }))
    expect(res.status).toBe(200)

    const qb = supabase.from.mock.results[0].value
    expect(qb.update).toHaveBeenCalledWith({ default_recipe_filter: [] })
  })

  it('returns 400 when default_recipe_filter is not an array of strings', async () => {
    vi.mocked(createClient).mockReturnValue(makeSupabase() as unknown as ReturnType<typeof createClient>)
    const res = await PATCH(req({ default_recipe_filter: 'main' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when the body has no updatable field', async () => {
    vi.mocked(createClient).mockReturnValue(makeSupabase() as unknown as ReturnType<typeof createClient>)
    const res = await PATCH(req({}))
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/app/api/profile/route.test.ts`
Expected: FAIL — `Failed to resolve import "./route"`.

- [ ] **Step 3: Write the implementation**

Create `src/app/api/profile/route.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as { default_recipe_filter?: unknown }

  if (body.default_recipe_filter === undefined) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }
  if (
    !Array.isArray(body.default_recipe_filter) ||
    !body.default_recipe_filter.every((v) => typeof v === 'string')
  ) {
    return NextResponse.json({ error: 'default_recipe_filter must be an array of strings' }, { status: 400 })
  }

  const { error } = await supabase
    .from('profiles')
    .update({ default_recipe_filter: body.default_recipe_filter as string[] })
    .eq('id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/app/api/profile/route.test.ts`
Expected: PASS — 5 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/profile/route.ts src/app/api/profile/route.test.ts
git commit -m "feat: add profile API for the default recipe filter"
```

---

### Task 7: Recipe card — taxonomy prop and pinned-group ordering

Replaces the `tagColors` prop with a single `taxonomy` object so later tasks don't grow the prop list. The three-tag budget and `+N` overflow are unchanged; only the ordering changes.

**Files:**
- Modify: `src/components/recipe/RecipeCard.tsx`
- Modify: `src/components/recipe/RecipeCard.test.tsx`
- Modify: `src/components/recipe/RecipeList.tsx` (call site only, in this task)
- Modify: `src/app/(app)/recipes/page.tsx` (call site only, in this task)

- [ ] **Step 1: Write the failing tests**

Replace the whole contents of `src/components/recipe/RecipeCard.test.tsx` with:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RecipeCard } from './RecipeCard'
import { EMPTY_TAXONOMY, type Taxonomy } from '@/lib/tags/taxonomy'
import type { Recipe } from '@/types/database'

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}))

const baseRecipe = {
  id: 'recipe-1',
  household_id: 'household-1',
  created_by: 'user-1',
  title: 'Tomato Pasta',
  description: null,
  source_url: null,
  image_url: null,
  prep_time_min: null,
  cook_time_min: null,
  servings: null,
  tags: [],
  ingredients: [],
  steps: [],
  notes: null,
  is_archived: false,
  last_used_at: null,
  share_token: null,
  title_normalized: 'tomato pasta',
  created_at: '2026-06-04T00:00:00.000Z',
  updated_at: '2026-06-04T00:00:00.000Z',
} satisfies Recipe

const taxonomy: Taxonomy = {
  groups: [
    { id: 'g-course', name: 'Course', position: 0, is_pinned: true },
    { id: 'g-mood', name: 'Mood', position: 1, is_pinned: false },
  ],
  tags: {
    main: { color: null, groupId: 'g-course' },
    comfort: { color: null, groupId: 'g-mood' },
    quick: { color: null, groupId: null },
    vegan: { color: null, groupId: null },
  },
}

describe('RecipeCard', () => {
  it('keeps the add to plan button visible on mobile and hover-revealed on larger screens', () => {
    render(<RecipeCard recipe={baseRecipe} taxonomy={EMPTY_TAXONOMY} />)

    const planButton = screen.getByRole('button', { name: /add to plan/i })

    expect(planButton).toHaveClass('opacity-100')
    expect(planButton).toHaveClass('sm:opacity-0')
    expect(planButton).toHaveClass('sm:group-hover:opacity-100')
  })

  it('shows pinned-group tags before the rest within the three-tag budget', () => {
    const recipe = { ...baseRecipe, tags: ['quick', 'vegan', 'comfort', 'main'] }
    render(<RecipeCard recipe={recipe} taxonomy={taxonomy} />)

    expect(screen.getByText('main')).toBeInTheDocument()
    expect(screen.getByText('quick')).toBeInTheDocument()
    expect(screen.getByText('vegan')).toBeInTheDocument()
    expect(screen.queryByText('comfort')).not.toBeInTheDocument()
    expect(screen.getByText('+1')).toBeInTheDocument()
  })

  it('preserves the recipe tag order when no groups are pinned', () => {
    const recipe = { ...baseRecipe, tags: ['quick', 'vegan'] }
    render(<RecipeCard recipe={recipe} taxonomy={EMPTY_TAXONOMY} />)

    expect(screen.getByText('quick')).toBeInTheDocument()
    expect(screen.getByText('vegan')).toBeInTheDocument()
    expect(screen.queryByText(/^\+/)).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/recipe/RecipeCard.test.tsx`
Expected: FAIL — TypeScript/runtime error because `RecipeCard` has no `taxonomy` prop.

- [ ] **Step 3: Update `RecipeCard`**

In `src/components/recipe/RecipeCard.tsx`, replace the imports, the props interface, the component signature, and the Tags block:

```tsx
'use client'

import Link from 'next/link'
import { Clock, Users } from 'lucide-react'
import { AddToPlanButton } from './AddToPlanButton'
import { orderTagsForCard, tagColor, type Taxonomy } from '@/lib/tags/taxonomy'
import type { Recipe } from '@/types/database'

interface RecipeCardProps {
  recipe: Recipe
  taxonomy: Taxonomy
}
```

Change the component signature to:

```tsx
export function RecipeCard({ recipe, taxonomy }: RecipeCardProps) {
  const totalTime = (recipe.prep_time_min ?? 0) + (recipe.cook_time_min ?? 0)
  const orderedTags = orderTagsForCard(recipe.tags, taxonomy)
```

And replace the Tags block (currently lines 56–79) with:

```tsx
          {/* Tags — pinned-group tags first, same 3-slot budget */}
          {orderedTags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {orderedTags.slice(0, 3).map((tag) => {
                const color = tagColor(taxonomy, tag)
                return (
                  <span
                    key={tag}
                    className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={color
                      ? { backgroundColor: color + '28', color, borderColor: color + '60' }
                      : { backgroundColor: '#f3f4f6', color: '#4b5563' }
                    }
                  >
                    {tag}
                  </span>
                )
              })}
              {orderedTags.length > 3 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                  +{orderedTags.length - 3}
                </span>
              )}
            </div>
          )}
```

- [ ] **Step 4: Update the two call sites so the app still compiles**

In `src/components/recipe/RecipeList.tsx`, change the props interface and the `RecipeCard` usage. Replace lines 6–16 with:

```tsx
import { RecipeCard } from './RecipeCard'
import { tagColor, type Taxonomy } from '@/lib/tags/taxonomy'
import type { Recipe } from '@/types/database'

interface RecipeListProps {
  recipes: Recipe[]
  taxonomy: Taxonomy
}

export function RecipeList({ recipes, taxonomy }: RecipeListProps) {
  const [search, setSearch] = useState('')
  const [activeTag, setActiveTag] = useState<string | null>(null)
```

Replace the tag-colour lookup inside the filter pill map (line 80) with:

```tsx
            const color = tagColor(taxonomy, tag)
```

And replace the card render (line 104) with:

```tsx
            <RecipeCard key={recipe.id} recipe={recipe} taxonomy={taxonomy} />
```

In `src/app/(app)/recipes/page.tsx`, replace the whole file with:

```tsx
import { createClient } from '@/lib/supabase/server'
import { RecipeList } from '@/components/recipe/RecipeList'
import type { Taxonomy, TagMeta } from '@/lib/tags/taxonomy'
import type { Recipe } from '@/types/database'

export default async function RecipesPage() {
  const supabase = createClient()

  const [{ data: recipes }, { data: tagsMeta }, { data: groups }] = await Promise.all([
    supabase.from('recipes').select('*').eq('is_archived', false).order('created_at', { ascending: false }),
    supabase.from('tags').select('name, color, group_id'),
    supabase.from('tag_groups').select('id, name, position, is_pinned').order('position'),
  ])

  const tags: Record<string, TagMeta> = {}
  for (const t of tagsMeta ?? []) tags[t.name] = { color: t.color, groupId: t.group_id }

  const taxonomy: Taxonomy = { groups: groups ?? [], tags }

  return (
    <div className="p-6 lg:p-8">
      <RecipeList recipes={(recipes ?? []) as Recipe[]} taxonomy={taxonomy} />
    </div>
  )
}
```

- [ ] **Step 5: Run the tests and type-check**

Run: `npx vitest run src/components/recipe/RecipeCard.test.tsx && npm run type-check`
Expected: 3 tests PASS, type-check exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/components/recipe/RecipeCard.tsx src/components/recipe/RecipeCard.test.tsx src/components/recipe/RecipeList.tsx "src/app/(app)/recipes/page.tsx"
git commit -m "feat: order pinned-group tags first on recipe cards"
```

---

### Task 8: Recipe list — multi-select filtering and the two-row clamp

This is the no-groups rendering: one wrapping pill area clamped to two rows with a "Show all tags" toggle, and OR/AND multi-select semantics.

Pill height is `py-1 text-sm` ≈ 30px and the gap is `gap-2` = 8px, so two rows = `2 * 30 + 8` = 68px. The clamp is `max-h-[68px] overflow-hidden`.

**Files:**
- Modify: `src/components/recipe/RecipeList.tsx`
- Test: `src/components/recipe/RecipeList.test.tsx` (create)

- [ ] **Step 1: Write the failing tests**

Create `src/components/recipe/RecipeList.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RecipeList } from './RecipeList'
import { EMPTY_TAXONOMY, type Taxonomy } from '@/lib/tags/taxonomy'
import type { Recipe } from '@/types/database'

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}))

function makeRecipe(id: string, title: string, tags: string[]): Recipe {
  return {
    id,
    household_id: 'hh-1',
    created_by: 'user-1',
    title,
    description: null,
    source_url: null,
    image_url: null,
    prep_time_min: null,
    cook_time_min: null,
    servings: null,
    tags,
    ingredients: [],
    steps: [],
    notes: null,
    is_archived: false,
    last_used_at: null,
    share_token: null,
    title_normalized: title.toLowerCase(),
    created_at: '2026-08-07T00:00:00.000Z',
    updated_at: '2026-08-07T00:00:00.000Z',
  } as Recipe
}

const recipes = [
  makeRecipe('r1', 'Lasagne', ['main', 'italian']),
  makeRecipe('r2', 'Garlic Bread', ['side', 'italian']),
  makeRecipe('r3', 'Ramen', ['main', 'asian']),
]

const grouped: Taxonomy = {
  groups: [{ id: 'g-course', name: 'Course', position: 0, is_pinned: true }],
  tags: {
    main: { color: null, groupId: 'g-course' },
    side: { color: null, groupId: 'g-course' },
    italian: { color: null, groupId: null },
    asian: { color: null, groupId: null },
  },
}

describe('RecipeList filtering', () => {
  it('shows every recipe when nothing is selected', () => {
    render(<RecipeList recipes={recipes} taxonomy={EMPTY_TAXONOMY} defaultFilter={[]} />)
    expect(screen.getByText('Lasagne')).toBeInTheDocument()
    expect(screen.getByText('Garlic Bread')).toBeInTheDocument()
    expect(screen.getByText('Ramen')).toBeInTheDocument()
  })

  it('ORs tags within one group and ANDs across groups', async () => {
    const user = userEvent.setup()
    render(<RecipeList recipes={recipes} taxonomy={grouped} defaultFilter={[]} />)

    await user.click(screen.getByRole('button', { name: 'main' }))
    await user.click(screen.getByRole('button', { name: 'side' }))
    expect(screen.getByText('Lasagne')).toBeInTheDocument()
    expect(screen.getByText('Garlic Bread')).toBeInTheDocument()
    expect(screen.getByText('Ramen')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'italian' }))
    expect(screen.getByText('Lasagne')).toBeInTheDocument()
    expect(screen.getByText('Garlic Bread')).toBeInTheDocument()
    expect(screen.queryByText('Ramen')).not.toBeInTheDocument()
  })

  it('deselects a tag when it is clicked again', async () => {
    const user = userEvent.setup()
    render(<RecipeList recipes={recipes} taxonomy={grouped} defaultFilter={[]} />)

    await user.click(screen.getByRole('button', { name: 'asian' }))
    expect(screen.queryByText('Lasagne')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'asian' }))
    expect(screen.getByText('Lasagne')).toBeInTheDocument()
  })
})

describe('RecipeList tag area clamp', () => {
  it('clamps the tag area to two rows and expands on demand', async () => {
    const user = userEvent.setup()
    render(<RecipeList recipes={recipes} taxonomy={EMPTY_TAXONOMY} defaultFilter={[]} />)

    const area = screen.getByTestId('tag-area-rest')
    expect(area).toHaveClass('max-h-[68px]')
    expect(area).toHaveClass('overflow-hidden')

    await user.click(screen.getByRole('button', { name: /show all tags/i }))
    expect(screen.getByTestId('tag-area-rest')).not.toHaveClass('max-h-[68px]')

    await user.click(screen.getByRole('button', { name: /show fewer tags/i }))
    expect(screen.getByTestId('tag-area-rest')).toHaveClass('max-h-[68px]')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/recipe/RecipeList.test.tsx`
Expected: FAIL — `RecipeList` has no `defaultFilter` prop and there is no `tag-area-rest` element.

- [ ] **Step 3: Confirm `@testing-library/user-event` is installed**

Run: `node -e "require.resolve('@testing-library/user-event'); console.log('present')"`
Expected: prints `present`. If it throws, run `npm install -D @testing-library/user-event` first and commit the lockfile change with this task.

- [ ] **Step 4: Rewrite `RecipeList`**

Replace the whole contents of `src/components/recipe/RecipeList.tsx` with:

```tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Search, Import, Plus, ChevronDown, ChevronUp } from 'lucide-react'
import { RecipeCard } from './RecipeCard'
import {
  buildFilterSections,
  filterRecipesByTags,
  tagColor,
  type Taxonomy,
} from '@/lib/tags/taxonomy'
import type { Recipe } from '@/types/database'

interface RecipeListProps {
  recipes: Recipe[]
  taxonomy: Taxonomy
  defaultFilter: string[]
}

export function RecipeList({ recipes, taxonomy, defaultFilter }: RecipeListProps) {
  const [search, setSearch] = useState('')
  const [selection, setSelection] = useState<string[]>(defaultFilter)
  const [expanded, setExpanded] = useState(false)

  const sections = buildFilterSections(recipes, taxonomy)

  function toggleTag(tag: string) {
    setSelection((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    )
  }

  let filtered = filterRecipesByTags(recipes, selection, taxonomy)
  if (search.trim()) {
    const q = search.toLowerCase()
    filtered = filtered.filter((r) => r.title.toLowerCase().includes(q))
  }

  function renderPill(tag: string) {
    const color = tagColor(taxonomy, tag)
    const isActive = selection.includes(tag)
    return (
      <button
        key={tag}
        onClick={() => toggleTag(tag)}
        className="px-3 py-1 text-sm rounded-full border transition-colors"
        style={
          isActive
            ? color
              ? { backgroundColor: color, color: '#fff', borderColor: color }
              : { backgroundColor: '#111827', color: '#fff', borderColor: '#111827' }
            : color
              ? { color, borderColor: color + '60', backgroundColor: color + '14' }
              : undefined
        }
      >
        {tag}
      </button>
    )
  }

  const hasTags = sections.pinned.length > 0 || sections.rest.length > 0

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Recipes</h1>
        <div className="flex items-center gap-2">
          <Link
            href="/recipes/import"
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-700 transition-colors"
          >
            <Import size={14} />
            Import
          </Link>
          <Link
            href="/recipes/new"
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Plus size={14} />
            New recipe
          </Link>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search recipes..."
          className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gray-300"
        />
      </div>

      {/* Tag filters */}
      {hasTags && (
        <div className="mb-6">
          {sections.pinned.map((section) => (
            <div key={section.group.id} className="mb-3">
              <p className="text-xs text-gray-400 mb-1.5">{section.group.name}</p>
              <div className="flex flex-wrap gap-2">
                {section.tags.map(renderPill)}
              </div>
            </div>
          ))}

          {sections.rest.length > 0 && (
            <div className={sections.pinned.length > 0 ? 'pt-3 border-t border-gray-100' : undefined}>
              <div
                data-testid="tag-area-rest"
                className={`flex flex-wrap gap-2${expanded ? '' : ' max-h-[68px] overflow-hidden'}`}
              >
                {sections.rest.map(renderPill)}
              </div>
            </div>
          )}

          {/* Action row. Lives outside the remainder block so the default-view
              action in Task 10 still appears when every tag sits in a pinned group. */}
          <div className="mt-2 flex items-center justify-between gap-3">
            {sections.rest.length > 0 ? (
              <button
                onClick={() => setExpanded((v) => !v)}
                className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 transition-colors"
              >
                {expanded ? 'Show fewer tags' : 'Show all tags'}
                {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            ) : (
              <span />
            )}
          </div>
        </div>
      )}

      {/* Grid */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((recipe) => (
            <RecipeCard key={recipe.id} recipe={recipe} taxonomy={taxonomy} />
          ))}
        </div>
      ) : (
        <div className="text-center py-20 text-gray-400">
          {recipes.length === 0 ? (
            <div>
              <p className="text-lg font-medium text-gray-500 mb-2">No recipes yet</p>
              <p className="text-sm mb-6">Import from a URL or add one manually</p>
              <div className="flex justify-center gap-3">
                <Link
                  href="/recipes/import"
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-700 transition-colors"
                >
                  <Import size={15} />
                  Import recipe
                </Link>
                <Link
                  href="/recipes/new"
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <Plus size={15} />
                  Add manually
                </Link>
              </div>
            </div>
          ) : (
            <p>No recipes match your search</p>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Pass the new prop from the page**

In `src/app/(app)/recipes/page.tsx`, change the `RecipeList` usage to pass an empty default for now (Task 10 wires the real value):

```tsx
      <RecipeList recipes={(recipes ?? []) as Recipe[]} taxonomy={taxonomy} defaultFilter={[]} />
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/components/recipe/RecipeList.test.tsx && npm run type-check`
Expected: 4 tests PASS, type-check exits 0.

- [ ] **Step 7: Commit**

```bash
git add src/components/recipe/RecipeList.tsx src/components/recipe/RecipeList.test.tsx "src/app/(app)/recipes/page.tsx"
git commit -m "feat: multi-select tag filtering with a two-row clamped tag area"
```

---

### Task 9: Recipe list — pinned group sections

Task 8 already renders `sections.pinned`. This task adds the tests that lock the behaviour in, since it is the part most likely to regress.

**Files:**
- Modify: `src/components/recipe/RecipeList.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append to `src/components/recipe/RecipeList.test.tsx`:

```tsx
describe('RecipeList pinned group sections', () => {
  const twoGroups: Taxonomy = {
    groups: [
      { id: 'g-course', name: 'Course', position: 0, is_pinned: true },
      { id: 'g-cuisine', name: 'Cuisine', position: 1, is_pinned: true },
      { id: 'g-mood', name: 'Mood', position: 2, is_pinned: false },
    ],
    tags: {
      main: { color: null, groupId: 'g-course' },
      side: { color: null, groupId: 'g-course' },
      italian: { color: null, groupId: 'g-cuisine' },
      asian: { color: null, groupId: 'g-cuisine' },
      comfort: { color: null, groupId: 'g-mood' },
      quick: { color: null, groupId: null },
    },
  }

  const withExtras = [
    ...recipes,
    makeRecipe('r4', 'Stew', ['comfort', 'quick']),
  ]

  it('renders a labelled section per pinned group in position order', () => {
    render(<RecipeList recipes={withExtras} taxonomy={twoGroups} defaultFilter={[]} />)

    const labels = screen.getAllByText(/^(Course|Cuisine|Mood)$/).map((el) => el.textContent)
    expect(labels).toEqual(['Course', 'Cuisine'])
  })

  it('renders every tag of a pinned group without clamping', () => {
    render(<RecipeList recipes={withExtras} taxonomy={twoGroups} defaultFilter={[]} />)

    expect(screen.getByRole('button', { name: 'main' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'side' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'italian' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'asian' })).toBeInTheDocument()
  })

  it('puts unpinned-group tags and ungrouped tags in the clamped remainder', () => {
    render(<RecipeList recipes={withExtras} taxonomy={twoGroups} defaultFilter={[]} />)

    const rest = screen.getByTestId('tag-area-rest')
    expect(rest).toHaveTextContent('comfort')
    expect(rest).toHaveTextContent('quick')
    expect(rest).not.toHaveTextContent('main')
  })

  it('renders no pinned sections when no group is pinned', () => {
    const unpinned: Taxonomy = {
      groups: [{ id: 'g-mood', name: 'Mood', position: 0, is_pinned: false }],
      tags: { comfort: { color: null, groupId: 'g-mood' } },
    }
    render(<RecipeList recipes={withExtras} taxonomy={unpinned} defaultFilter={[]} />)

    expect(screen.queryByText('Mood')).not.toBeInTheDocument()
    expect(screen.getByTestId('tag-area-rest')).toHaveTextContent('comfort')
  })
})
```

- [ ] **Step 2: Run the tests**

Run: `npx vitest run src/components/recipe/RecipeList.test.tsx`
Expected: PASS — 8 tests total. If the "labelled section per pinned group" test fails, the section rendering from Task 8 Step 4 was not applied correctly; re-check that block.

- [ ] **Step 3: Commit**

```bash
git add src/components/recipe/RecipeList.test.tsx
git commit -m "test: cover pinned group sections in the recipe filter bar"
```

---

### Task 10: Default view

Pre-applies the user's stored filter, keeps deviations temporary, bypasses the default while searching, and adds the "Set as default" action to the "Show all tags" line.

**Files:**
- Modify: `src/components/recipe/RecipeList.tsx`
- Modify: `src/components/recipe/RecipeList.test.tsx`
- Modify: `src/app/(app)/recipes/page.tsx`

- [ ] **Step 1: Write the failing tests**

Append to `src/components/recipe/RecipeList.test.tsx`:

```tsx
describe('RecipeList default view', () => {
  it('pre-applies the default filter on mount', () => {
    render(<RecipeList recipes={recipes} taxonomy={grouped} defaultFilter={['main']} />)

    expect(screen.getByText('Lasagne')).toBeInTheDocument()
    expect(screen.getByText('Ramen')).toBeInTheDocument()
    expect(screen.queryByText('Garlic Bread')).not.toBeInTheDocument()
  })

  it('drops stored names that no longer exist instead of emptying the list', () => {
    render(<RecipeList recipes={recipes} taxonomy={grouped} defaultFilter={['gone']} />)

    expect(screen.getByText('Lasagne')).toBeInTheDocument()
    expect(screen.getByText('Garlic Bread')).toBeInTheDocument()
    expect(screen.getByText('Ramen')).toBeInTheDocument()
  })

  it('bypasses the untouched default while searching', async () => {
    const user = userEvent.setup()
    render(<RecipeList recipes={recipes} taxonomy={grouped} defaultFilter={['main']} />)

    expect(screen.queryByText('Garlic Bread')).not.toBeInTheDocument()

    await user.type(screen.getByPlaceholderText('Search recipes...'), 'garlic')
    expect(screen.getByText('Garlic Bread')).toBeInTheDocument()
    expect(screen.getByText(/searching all recipes/i)).toBeInTheDocument()
  })

  it('respects a manually changed selection while searching', async () => {
    const user = userEvent.setup()
    render(<RecipeList recipes={recipes} taxonomy={grouped} defaultFilter={['main']} />)

    await user.click(screen.getByRole('button', { name: 'side' }))
    await user.type(screen.getByPlaceholderText('Search recipes...'), 'a')

    expect(screen.getByText('Garlic Bread')).toBeInTheDocument()
    expect(screen.queryByText(/searching all recipes/i)).not.toBeInTheDocument()
  })

  it('hides the default action until something is selected', async () => {
    const user = userEvent.setup()
    render(<RecipeList recipes={recipes} taxonomy={grouped} defaultFilter={[]} />)

    expect(screen.queryByRole('button', { name: /set as default/i })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'main' }))
    expect(screen.getByRole('button', { name: /set as default/i })).toBeInTheDocument()
  })

  it('shows "Clear default" when the selection already is the default', () => {
    render(<RecipeList recipes={recipes} taxonomy={grouped} defaultFilter={['main']} />)

    expect(screen.getByRole('button', { name: /clear default/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /set as default/i })).not.toBeInTheDocument()
  })

  it('still offers the default action when every tag sits in a pinned group', async () => {
    const allPinned: Taxonomy = {
      groups: [{ id: 'g-course', name: 'Course', position: 0, is_pinned: true }],
      tags: {
        main: { color: null, groupId: 'g-course' },
        side: { color: null, groupId: 'g-course' },
        italian: { color: null, groupId: 'g-course' },
        asian: { color: null, groupId: 'g-course' },
      },
    }
    const user = userEvent.setup()
    render(<RecipeList recipes={recipes} taxonomy={allPinned} defaultFilter={[]} />)

    expect(screen.queryByTestId('tag-area-rest')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'main' }))
    expect(screen.getByRole('button', { name: /set as default/i })).toBeInTheDocument()
  })

  it('saves the selection as the default', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()

    render(<RecipeList recipes={recipes} taxonomy={grouped} defaultFilter={[]} />)
    await user.click(screen.getByRole('button', { name: 'main' }))
    await user.click(screen.getByRole('button', { name: /set as default/i }))

    expect(fetchMock).toHaveBeenCalledWith('/api/profile', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ default_recipe_filter: ['main'] }),
    }))
    expect(await screen.findByRole('button', { name: /clear default/i })).toBeInTheDocument()

    vi.unstubAllGlobals()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/recipe/RecipeList.test.tsx`
Expected: FAIL — the default is not sanitized, there is no search bypass, and no default action button exists.

- [ ] **Step 3: Update `RecipeList`**

In `src/components/recipe/RecipeList.tsx`, add `sanitizeDefaultFilter` and `tagsByUsage` to the taxonomy import:

```tsx
import {
  buildFilterSections,
  filterRecipesByTags,
  sanitizeDefaultFilter,
  tagColor,
  tagsByUsage,
  type Taxonomy,
} from '@/lib/tags/taxonomy'
```

Replace the state block and the filtering block (everything from `const [search, setSearch]` down to the end of the `filtered` computation) with:

```tsx
  const knownTags = tagsByUsage(recipes)
  const initialDefault = sanitizeDefaultFilter(defaultFilter, knownTags)

  const [search, setSearch] = useState('')
  const [selection, setSelection] = useState<string[]>(initialDefault)
  const [expanded, setExpanded] = useState(false)
  const [savedDefault, setSavedDefault] = useState<string[]>(initialDefault)
  const [selectionTouched, setSelectionTouched] = useState(false)
  const [savingDefault, setSavingDefault] = useState(false)

  const sections = buildFilterSections(recipes, taxonomy)

  function toggleTag(tag: string) {
    setSelectionTouched(true)
    setSelection((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    )
  }

  const searching = search.trim().length > 0
  // A search must never be narrowed by a default the user did not choose for
  // this visit. Once they change the selection themselves, it is theirs and applies.
  const defaultBypassed = searching && !selectionTouched && initialDefault.length > 0
  const effectiveSelection = defaultBypassed ? [] : selection

  const sameSet = (a: string[], b: string[]) =>
    a.length === b.length && a.every((v) => b.includes(v))
  const selectionIsDefault = selection.length > 0 && sameSet(selection, savedDefault)

  async function saveDefault(next: string[]) {
    setSavingDefault(true)
    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ default_recipe_filter: next }),
    })
    if (res.ok) setSavedDefault(next)
    setSavingDefault(false)
  }

  let filtered = filterRecipesByTags(recipes, effectiveSelection, taxonomy)
  if (searching) {
    const q = search.toLowerCase()
    filtered = filtered.filter((r) => r.title.toLowerCase().includes(q))
  }
```

Note: `saveDefault` sends `headers` while the test asserts with `expect.objectContaining`, so only `method` and `body` are matched — the header is not asserted and does not need to be omitted.

- [ ] **Step 4: Add the default action and the search hint to the markup**

In the same file, replace the action row added in Task 8 with one that carries both actions:

```tsx
          <div className="mt-2 flex items-center justify-between gap-3">
            {sections.rest.length > 0 ? (
              <button
                onClick={() => setExpanded((v) => !v)}
                className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 transition-colors"
              >
                {expanded ? 'Show fewer tags' : 'Show all tags'}
                {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            ) : (
              <span />
            )}

            {selection.length > 0 && (
              <button
                onClick={() => saveDefault(selectionIsDefault ? [] : selection)}
                disabled={savingDefault}
                className="text-sm text-gray-500 hover:text-gray-900 transition-colors disabled:opacity-50"
              >
                {selectionIsDefault ? 'Clear default' : 'Set as default'}
              </button>
            )}
          </div>
```

Then, directly below the search input's closing `</div>`, add the bypass hint:

```tsx
      {defaultBypassed && (
        <p className="text-xs text-gray-400 -mt-2 mb-4">Searching all recipes, ignoring your default view.</p>
      )}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/components/recipe/RecipeList.test.tsx`
Expected: PASS — 16 tests total.

- [ ] **Step 6: Load the real default in the page**

In `src/app/(app)/recipes/page.tsx`, replace the whole file with:

```tsx
import { createClient } from '@/lib/supabase/server'
import { RecipeList } from '@/components/recipe/RecipeList'
import type { Taxonomy, TagMeta } from '@/lib/tags/taxonomy'
import type { Recipe } from '@/types/database'

export default async function RecipesPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: recipes }, { data: tagsMeta }, { data: groups }, { data: profile }] = await Promise.all([
    supabase.from('recipes').select('*').eq('is_archived', false).order('created_at', { ascending: false }),
    supabase.from('tags').select('name, color, group_id'),
    supabase.from('tag_groups').select('id, name, position, is_pinned').order('position'),
    user
      ? supabase.from('profiles').select('default_recipe_filter').eq('id', user.id).single()
      : Promise.resolve({ data: null }),
  ])

  const tags: Record<string, TagMeta> = {}
  for (const t of tagsMeta ?? []) tags[t.name] = { color: t.color, groupId: t.group_id }

  const taxonomy: Taxonomy = { groups: groups ?? [], tags }

  return (
    <div className="p-6 lg:p-8">
      <RecipeList
        recipes={(recipes ?? []) as Recipe[]}
        taxonomy={taxonomy}
        defaultFilter={profile?.default_recipe_filter ?? []}
      />
    </div>
  )
}
```

- [ ] **Step 7: Verify the full suite and types**

Run: `npx vitest run && npm run type-check`
Expected: all tests PASS, type-check exits 0.

- [ ] **Step 8: Commit**

```bash
git add src/components/recipe/RecipeList.tsx src/components/recipe/RecipeList.test.tsx "src/app/(app)/recipes/page.tsx"
git commit -m "feat: add a per-user default recipe view"
```

---

### Task 11: Settings — group management and tag assignment

**Files:**
- Create: `src/components/settings/TagGroupsEditor.tsx`
- Modify: `src/components/settings/TagsEditor.tsx`
- Modify: `src/app/(app)/settings/page.tsx`

- [ ] **Step 1: Create the groups editor**

Create `src/components/settings/TagGroupsEditor.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { X, Pencil, Plus, Pin, PinOff, ChevronUp, ChevronDown } from 'lucide-react'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import type { TagGroup } from '@/types/database'

interface TagGroupsEditorProps {
  initialGroups: TagGroup[]
}

export function TagGroupsEditor({ initialGroups }: TagGroupsEditorProps) {
  const [groups, setGroups] = useState<TagGroup[]>(initialGroups)
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<TagGroup | null>(null)

  async function handleCreate() {
    const name = newName.trim()
    if (!name) return
    const res = await fetch('/api/tag-groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (res.ok) {
      const created = await res.json() as TagGroup
      setGroups((prev) => [...prev, created])
      setNewName('')
    }
  }

  async function patchGroup(id: string, updates: Partial<Pick<TagGroup, 'name' | 'is_pinned' | 'position'>>) {
    const res = await fetch(`/api/tag-groups/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    if (res.ok) {
      setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, ...updates } : g)))
    }
  }

  async function handleRename(id: string) {
    const name = renameValue.trim()
    setEditingId(null)
    if (!name) return
    await patchGroup(id, { name })
  }

  async function handleMove(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= groups.length) return
    const reordered = [...groups]
    const [moved] = reordered.splice(index, 1)
    reordered.splice(target, 0, moved)
    const withPositions = reordered.map((g, i) => ({ ...g, position: i }))
    setGroups(withPositions)
    await Promise.all(
      withPositions.map((g) =>
        fetch(`/api/tag-groups/${g.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ position: g.position }),
        })
      )
    )
  }

  async function handleDelete(group: TagGroup) {
    const res = await fetch(`/api/tag-groups/${group.id}`, { method: 'DELETE' })
    if (res.ok) setGroups((prev) => prev.filter((g) => g.id !== group.id))
    setDeleteTarget(null)
  }

  return (
    <>
      <div className="space-y-1">
        {groups.map((group, index) => (
          <div key={group.id} className="flex items-center gap-2 py-2 group">
            <button
              type="button"
              onClick={() => patchGroup(group.id, { is_pinned: !group.is_pinned })}
              className={group.is_pinned ? 'text-gray-900' : 'text-gray-300 hover:text-gray-600'}
              title={group.is_pinned ? 'Unpin from the recipe list' : 'Pin to the recipe list'}
            >
              {group.is_pinned ? <Pin size={14} /> : <PinOff size={14} />}
            </button>

            {editingId === group.id ? (
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRename(group.id)
                  if (e.key === 'Escape') setEditingId(null)
                }}
                onBlur={() => handleRename(group.id)}
                className="flex-1 text-sm px-2 py-0.5 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-gray-300"
              />
            ) : (
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                <span className="text-sm text-gray-900 font-medium">{group.name}</span>
                <button
                  type="button"
                  onClick={() => { setEditingId(group.id); setRenameValue(group.name) }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-gray-700"
                  title="Rename"
                >
                  <Pencil size={12} />
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => handleMove(index, -1)}
              disabled={index === 0}
              className="text-gray-300 hover:text-gray-700 disabled:opacity-30"
              title="Move up"
            >
              <ChevronUp size={14} />
            </button>
            <button
              type="button"
              onClick={() => handleMove(index, 1)}
              disabled={index === groups.length - 1}
              className="text-gray-300 hover:text-gray-700 disabled:opacity-30"
              title="Move down"
            >
              <ChevronDown size={14} />
            </button>
            <button
              type="button"
              onClick={() => setDeleteTarget(group)}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-red-500"
              title="Delete group"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 mt-3">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }}
          placeholder="New group, e.g. Course"
          className="flex-1 text-sm px-2 py-1 border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-gray-300"
        />
        <button
          type="button"
          onClick={handleCreate}
          className="inline-flex items-center gap-1 px-2 py-1 text-sm text-gray-700 border border-gray-200 rounded hover:bg-gray-50"
        >
          <Plus size={14} />
          Add
        </button>
      </div>

      {deleteTarget && (
        <ConfirmModal
          message={`Delete the group "${deleteTarget.name}"? Its tags stay on your recipes and simply become ungrouped.`}
          confirmLabel="Delete"
          onConfirm={() => handleDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </>
  )
}
```

- [ ] **Step 2: Add group assignment to `TagsEditor`**

In `src/components/settings/TagsEditor.tsx`, change the imports and props:

```tsx
import type { TagData } from '@/app/api/tags/route'
import type { TagGroup } from '@/types/database'

interface TagsEditorProps {
  initialTags: TagData[]
  groups: TagGroup[]
}

export function TagsEditor({ initialTags, groups }: TagsEditorProps) {
```

Add a handler next to `handleColorChange`:

```tsx
  async function handleGroupChange(name: string, groupId: string | null) {
    const res = await fetch(`/api/tags/${encodeURIComponent(name)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupId }),
    })
    if (res.ok) {
      setTags((prev) => prev.map((t) => t.name === name ? { ...t, groupId } : t))
    }
  }
```

And insert a select between the name block and the delete button (immediately before the `{/* Delete */}` comment):

```tsx
            {groups.length > 0 && (
              <select
                value={tag.groupId ?? ''}
                onChange={(e) => handleGroupChange(tag.name, e.target.value || null)}
                className="text-xs text-gray-500 border border-gray-200 rounded px-1.5 py-0.5 bg-white focus:outline-none focus:ring-2 focus:ring-gray-300 flex-shrink-0"
                aria-label={`Group for ${tag.name}`}
              >
                <option value="">No group</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            )}
```

- [ ] **Step 3: Wire both into the settings page**

In `src/app/(app)/settings/page.tsx`:

Add the import beside the other settings imports:

```tsx
import { TagGroupsEditor } from '@/components/settings/TagGroupsEditor'
```

Add a query to the existing `Promise.all` (append it to both the destructuring array and the query array):

```tsx
    supabase.from('tag_groups').select('*').eq('household_id', profile.household_id).order('position'),
```

so the destructuring becomes:

```tsx
  const [{ data: household }, { data: members }, { data: plannerRules }, { data: recipes }, { data: tagsMeta }, { data: shoppingCategories }, { data: shoppingRules }, { data: tagGroups }] = await Promise.all([
```

Then find the existing section that renders `<TagsEditor initialTags={allTags} />` and replace that element with:

```tsx
          <TagGroupsEditor initialGroups={tagGroups ?? []} />
          <div className="mt-6 pt-6 border-t border-gray-100">
            <TagsEditor initialTags={allTags} groups={tagGroups ?? []} />
          </div>
```

- [ ] **Step 4: Verify types and the full suite**

Run: `npm run type-check && npx vitest run`
Expected: type-check exits 0; all tests PASS.

- [ ] **Step 5: Verify in the browser**

Start the dev server and check, in order:
1. Settings → create a group named `Course`, pin it.
2. Settings → assign the `main` tag to `Course` via the dropdown.
3. Recipes → a labelled `Course` row appears above the clamped remainder; `main` is in it.
4. Select `main`, click "Set as default", reload → `main` is pre-selected and the action reads "Clear default".
5. Type a search term → the hint appears and results are not narrowed by `main`.
6. Settings → delete the `Course` group → the tag `main` still exists on its recipes and moves into the remainder area.

- [ ] **Step 6: Commit and push**

```bash
git add src/components/settings/TagGroupsEditor.tsx src/components/settings/TagsEditor.tsx "src/app/(app)/settings/page.tsx"
git commit -m "feat: manage tag groups and assign tags in settings"
git push
```

Per `CLAUDE.md`, Vercel is the testing ground — push so the deployment picks the change up.

---

## Out of scope

Per the spec's "Deferred work", none of these are implemented here and no groundwork is laid for them:

1. **Suggestion engine** (outlier-driven and pattern-driven group proposals).
2. **Automatic tag colours** at creation.
3. **Onboarding presets** that seed groups.
4. **Import mapping** of `recipeCategory` / `recipeCuisine` into groups — `src/app/api/recipes/import/route.ts` is untouched and keeps its known-tags-only rule.

Also deliberately untouched, per spec §7: `src/components/recipe/TagInput.tsx` and `src/components/recipe/RecipeForm.tsx`. The recipe creation flow must never mention groups. If a task seems to require editing them, stop — that is a sign the design has been misread.
