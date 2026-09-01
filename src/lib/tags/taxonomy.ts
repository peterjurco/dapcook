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

  const pinned: { tag: string; rank: number }[] = []
  const rest: string[] = []
  for (const tag of tags) {
    const groupId = tagGroupId(taxonomy, tag)
    const r = groupId !== null ? rank.get(groupId) : undefined
    if (r !== undefined) pinned.push({ tag, rank: r })
    else rest.push(tag)
  }

  pinned.sort((a, b) => a.rank - b.rank)
  return [...pinned.map((p) => p.tag), ...rest]
}

export interface FilterSection {
  group: TagGroupView
  tags: string[]
}

export interface FilterSections {
  /** One section per pinned group that has at least one in-use tag — an unused
   *  pinned group is dropped rather than shown as an empty header. */
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
    for (const groupTags of Array.from(byGroup.values())) {
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
