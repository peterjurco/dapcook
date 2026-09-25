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
      { en: 'Lunch', sk: 'Obed' },
      { en: 'Dinner', sk: 'Večera' },
      { en: 'Main dish', sk: 'Hlavné jedlo' },
      { en: 'Side dish', sk: 'Príloha' },
      { en: 'Soup', sk: 'Polievka' },
      { en: 'Salad', sk: 'Šalát' },
      { en: 'Appetizer', sk: 'Predjedlo' },
      { en: 'Snack', sk: 'Desiata' },
      { en: 'Dessert', sk: 'Dezert' },
      { en: 'Baking', sk: 'Pečenie' },
      { en: 'Sauce & dip', sk: 'Omáčka a dip' },
      { en: 'Drink', sk: 'Nápoj' },
      { en: 'Cocktail', sk: 'Koktail' },
    ],
  },
  {
    id: 'cuisine',
    name: { en: 'Cuisine', sk: 'Kuchyňa' },
    tags: [
      { en: 'Slovak', sk: 'Slovenská' },
      { en: 'Czech', sk: 'Česká' },
      { en: 'Traditional', sk: 'Tradičná' },
      { en: 'Italian', sk: 'Talianska' },
      { en: 'French', sk: 'Francúzska' },
      { en: 'Spanish', sk: 'Španielska' },
      { en: 'Greek', sk: 'Grécka' },
      { en: 'Mediterranean', sk: 'Stredomorská' },
      { en: 'Mexican', sk: 'Mexická' },
      { en: 'American', sk: 'Americká' },
      { en: 'Asian', sk: 'Ázijská' },
      { en: 'Chinese', sk: 'Čínska' },
      { en: 'Japanese', sk: 'Japonská' },
      { en: 'Thai', sk: 'Thajská' },
      { en: 'Vietnamese', sk: 'Vietnamská' },
      { en: 'Korean', sk: 'Kórejská' },
      { en: 'Indian', sk: 'Indická' },
      { en: 'Middle Eastern', sk: 'Blízkovýchodná' },
    ],
  },
  {
    id: 'diet',
    name: { en: 'Diet', sk: 'Stravovanie' },
    tags: [
      { en: 'Vegetarian', sk: 'Vegetariánske' },
      { en: 'Vegan', sk: 'Vegánske' },
      { en: 'Gluten-free', sk: 'Bezlepkové' },
      { en: 'Dairy-free', sk: 'Bez mliečnych výrobkov' },
      { en: 'Low-carb', sk: 'Nízkosacharidové' },
      { en: 'High-protein', sk: 'Vysokobielkovinové' },
      { en: 'Keto', sk: 'Keto' },
      { en: 'Light', sk: 'Ľahké' },
    ],
  },
  {
    id: 'ingredient',
    name: { en: 'Main ingredient', sk: 'Hlavná surovina' },
    tags: [
      { en: 'Chicken', sk: 'Kuracie' },
      { en: 'Beef', sk: 'Hovädzie' },
      { en: 'Pork', sk: 'Bravčové' },
      { en: 'Fish', sk: 'Ryby' },
      { en: 'Seafood', sk: 'Morské plody' },
      { en: 'Pasta', sk: 'Cestoviny' },
      { en: 'Rice', sk: 'Ryža' },
      { en: 'Legumes', sk: 'Strukoviny' },
      { en: 'Potatoes', sk: 'Zemiaky' },
      { en: 'Vegetables', sk: 'Zelenina' },
      { en: 'Eggs', sk: 'Vajcia' },
      { en: 'Mushrooms', sk: 'Huby' },
    ],
  },
  {
    id: 'effort',
    name: { en: 'Effort & time', sk: 'Náročnosť a čas' },
    tags: [
      { en: 'Quick (under 30 min)', sk: 'Rýchle (do 30 min)' },
      { en: 'Easy', sk: 'Jednoduché' },
      { en: 'Weekend project', sk: 'Víkendový projekt' },
      { en: 'One-pot', sk: 'Z jedného hrnca' },
      { en: 'Meal prep', sk: 'Varenie dopredu' },
      { en: 'Freezer-friendly', sk: 'Vhodné na zmrazenie' },
      { en: 'Slow cooker', sk: 'Pomalý hrniec' },
      { en: 'Air fryer', sk: 'Teplovzdušná fritéza' },
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
