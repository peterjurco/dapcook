import type { Locale } from '@/i18n/config'

export type Localized = Record<Locale, string>

export interface TagCatalogGroup {
  id: string
  name: Localized
  tags: Localized[]
}

/**
 * Tags offered during onboarding. They are stored as plain names in the UI
 * language the user picked, so labels live here (not in message files) — they
 * become data, not interface copy.
 */
export const TAG_CATALOG: TagCatalogGroup[] = [
  {
    id: 'course',
    name: { en: 'Course', sk: 'Chod' },
    tags: [
      { en: 'Breakfast', sk: 'Raňajky' },
      { en: 'Brunch', sk: 'Brunch' },
      { en: 'Main dish', sk: 'Hlavné jedlo' },
      { en: 'Soup', sk: 'Polievka' },
      { en: 'Salad', sk: 'Šalát' },
      { en: 'Dessert', sk: 'Dezert' },
    ],
  },
  {
    id: 'cuisine',
    name: { en: 'Cuisine', sk: 'Kuchyňa' },
    tags: [
      { en: 'Slovak', sk: 'Slovenská' },
      { en: 'Czech', sk: 'Česká' },
      { en: 'Italian', sk: 'Talianska' },
      { en: 'Greek', sk: 'Grécka' },
      { en: 'Mexican', sk: 'Mexická' },
      { en: 'Asian', sk: 'Ázijská' },
    ],
  },
  {
    id: 'diet',
    name: { en: 'Diet', sk: 'Stravovanie' },
    tags: [
      { en: 'Vegetarian', sk: 'Vegetariánske' },
      { en: 'Vegan', sk: 'Vegánske' },
      { en: 'Gluten-free', sk: 'Bezlepkové' },
      { en: 'Lactose-free', sk: 'Bezlaktózové' },
    ],
  },
]

export interface TagGroupPayload {
  name: string
  tags: string[]
}

/**
 * Turns the wizard's selection (tag names per catalog group id, custom ones
 * included) into what `POST /api/onboarding/tags` expects. Groups without a
 * selected tag are left out, so they are never created.
 */
export function buildTagGroupsPayload(selected: Record<string, string[]>, locale: Locale): TagGroupPayload[] {
  return TAG_CATALOG.map((group) => ({
    name: group.name[locale],
    tags: Array.from(new Set((selected[group.id] ?? []).map((t) => t.trim()).filter(Boolean))),
  })).filter((group) => group.tags.length > 0)
}

export interface TagSelection {
  /** Picked tag names per catalog group id, custom ones included. */
  selected: Record<string, string[]>
  /** Tags the user added per catalog group id, shown as extra chips. */
  custom: Record<string, string[]>
}

/**
 * The inverse of `buildTagGroupsPayload`: what the wizard shows for tags that
 * are already saved. Groups are matched by their name in `locale`; a saved tag
 * that is not in its group's catalog list becomes a custom chip.
 */
export function selectionFromSavedTags(groups: TagGroupPayload[], locale: Locale): TagSelection {
  const selection: TagSelection = { selected: {}, custom: {} }
  for (const saved of groups) {
    const group = TAG_CATALOG.find((g) => g.name[locale] === saved.name)
    if (!group || saved.tags.length === 0) continue
    const known = new Set(group.tags.map((tag) => tag[locale]))
    selection.selected[group.id] = saved.tags
    const custom = saved.tags.filter((name) => !known.has(name))
    if (custom.length > 0) selection.custom[group.id] = custom
  }
  return selection
}
