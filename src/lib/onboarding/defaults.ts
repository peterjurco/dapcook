import type { Localized } from './tag-catalog'

/** Seeded for every new household, in the creator's UI language, in this order. */
export const DEFAULT_SHOPPING_CATEGORIES: Localized[] = [
  { en: 'Veggies & Fruits', sk: 'Ovocie a zelenina' },
  { en: 'Bakery', sk: 'Pečivo' },
  { en: 'Pantry', sk: 'Trvanlivé potraviny' },
  { en: 'Herbs & Spices', sk: 'Bylinky a koreniny' },
  { en: 'Dairy & Eggs', sk: 'Mliečne výrobky a vajcia' },
  { en: 'Frozen', sk: 'Mrazené' },
  { en: 'Meat', sk: 'Mäso' },
  { en: 'Household', sk: 'Domácnosť' },
  { en: 'Drinks', sk: 'Nápoje' },
]

/** One-tap shopping rule suggestions shown in the onboarding wizard. */
export const SHOPPING_RULE_EXAMPLES: Localized[] = [
  { en: 'Merge all kinds of onions into one item', sk: 'Všetky druhy cibule zlúč do jednej položky' },
  { en: 'Skip salt, pepper, oil and water — we always have them', sk: 'Vynechaj soľ, korenie, olej a vodu — tie máme vždy doma' },
  { en: 'Round up to whole packages (1 pack of butter, not 125 g)', sk: 'Zaokrúhli na celé balenia (1 maslo, nie 125 g)' },
  { en: 'Count eggs in pieces, not grams', sk: 'Vajcia počítaj na kusy, nie na gramy' },
  { en: 'Merge the same cheese from different recipes', sk: 'Rovnaký syr z rôznych receptov zlúč do jednej položky' },
]
