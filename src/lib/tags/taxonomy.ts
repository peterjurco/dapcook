import type { Recipe, TagGroup } from '@/types/database'

export type TagGroupView = Pick<TagGroup, 'id' | 'name' | 'position'>

export interface TagMeta {
  color: string | null
  groupId: string | null
}

/** Build a name -> metadata map from raw `tags` table rows. */
export function buildTagMeta(
  rows: { name: string; color: string | null; group_id: string | null }[]
): Record<string, TagMeta> {
  const meta: Record<string, TagMeta> = {}
  for (const row of rows) meta[row.name] = { color: row.color, groupId: row.group_id }
  return meta
}

export interface Taxonomy {
  /** Every group in the household. */
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

/** Every group, ordered by position. Every group is always shown — there is
 *  no hidden/unpinned state. */
export function sortedGroups(taxonomy: Taxonomy): TagGroupView[] {
  return [...taxonomy.groups].sort((a, b) => a.position - b.position)
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
 * Card ordering: grouped tags first (by group position), then ungrouped
 * tags. Relative order is preserved within each bucket.
 */
export function orderTagsForCard(tags: string[], taxonomy: Taxonomy): string[] {
  const rank = new Map<string, number>()
  sortedGroups(taxonomy).forEach((group, index) => rank.set(group.id, index))

  const grouped: { tag: string; rank: number }[] = []
  const ungrouped: string[] = []
  for (const tag of tags) {
    const groupId = tagGroupId(taxonomy, tag)
    const r = groupId !== null ? rank.get(groupId) : undefined
    if (r !== undefined) grouped.push({ tag, rank: r })
    else ungrouped.push(tag)
  }

  grouped.sort((a, b) => a.rank - b.rank)
  return [...grouped.map((g) => g.tag), ...ungrouped]
}

export interface FilterSection {
  group: TagGroupView
  tags: string[]
}

export interface FilterSections {
  /** One section per group that has at least one in-use tag — every group is
   *  always shown; a group with no in-use tags is dropped rather than shown
   *  as an empty header. */
  groups: FilterSection[]
  /** Ungrouped tags, flattened, most-used first. */
  ungrouped: string[]
}

export function buildFilterSections(recipes: Recipe[], taxonomy: Taxonomy): FilterSections {
  const inUse = tagsByUsage(recipes)
  const allGroups = sortedGroups(taxonomy)

  const groups: FilterSection[] = allGroups
    .map((group) => ({
      group,
      tags: inUse.filter((tag) => tagGroupId(taxonomy, tag) === group.id),
    }))
    .filter((section) => section.tags.length > 0)

  const ungrouped = inUse.filter((tag) => tagGroupId(taxonomy, tag) === null)

  return { groups, ungrouped }
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
