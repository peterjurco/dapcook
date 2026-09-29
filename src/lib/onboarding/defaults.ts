import type { Localized } from './tag-catalog'

/** Seeded for every new household, in the creator's UI language, in this order. */
export const DEFAULT_SHOPPING_CATEGORIES: (Localized & { color: string })[] = [
  { en: 'Veggies & Fruits', sk: 'Ovocie a zelenina', color: '#22c55e' },
  { en: 'Bakery', sk: 'Pečivo', color: '#f59e0b' },
  { en: 'Pantry', sk: 'Trvanlivé potraviny', color: '#ea580c' },
  { en: 'Herbs & Spices', sk: 'Bylinky a koreniny', color: '#65a30d' },
  { en: 'Dairy & Eggs', sk: 'Mliečne výrobky a vajcia', color: '#3b82f6' },
  { en: 'Frozen', sk: 'Mrazené', color: '#06b6d4' },
  { en: 'Meat', sk: 'Mäso', color: '#ef4444' },
  { en: 'Household', sk: 'Domácnosť', color: '#8b5cf6' },
  { en: 'Drinks', sk: 'Nápoje', color: '#ec4899' },
]
