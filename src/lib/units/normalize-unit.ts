/**
 * Canonical short forms for spoon measures in Slovak/Czech recipes.
 *
 * The AI prompts ask for ČL/PL, but recipes parsed from Slovak sources are never
 * translated, so units arrive exactly as the source wrote them — "čajová lyžička",
 * "lyžice", … — and the model occasionally spells them out anyway. Normalizing
 * deterministically is cheaper and more reliable than trusting the prompt.
 */
const SK_CS_VARIANTS = {
  ČL: [
    'čl',
    'kl',
    'lyžička',
    'lyžičky',
    'lyžičiek',
    'čajová lyžička',
    'čajové lyžičky',
    'čajových lyžičiek',
    'lžička',
    'lžičky',
    'lžiček',
    'čajová lžička',
  ],
  PL: [
    'pl',
    'lyžica',
    'lyžice',
    'lyžíc',
    'polievková lyžica',
    'polievkové lyžice',
    'polievkových lyžíc',
    'lžíce',
    'lžic',
    'polévková lžíce',
  ],
} as const

/**
 * English spellings only fold into ČL/PL when the recipe is actually Slovak or
 * Czech — an English recipe must keep its "tsp".
 */
const EN_VARIANTS = {
  ČL: ['tsp', 'tsps', 'teaspoon', 'teaspoons'],
  PL: ['tbsp', 'tbsps', 'tablespoon', 'tablespoons'],
} as const

const SPOON_LANGUAGES = new Set(['sk', 'cs'])

/**
 * Folded forms that collide with a different unit once diacritics are dropped:
 * "cl" is centilitres, only "čl" is a teaspoon. These match by exact spelling only.
 */
const AMBIGUOUS_FOLDED = new Set(['cl'])

function clean(unit: string): string {
  return unit.trim().toLowerCase().replace(/\s+/g, ' ').replace(/\.+$/, '')
}

function fold(unit: string): string {
  // NFD splits accented letters into base + combining mark; drop the marks
  return unit.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function buildLookup(variants: Record<string, readonly string[]>) {
  const exact = new Map<string, string>()
  const folded = new Map<string, string>()
  for (const [canonical, spellings] of Object.entries(variants)) {
    for (const spelling of spellings) {
      const key = clean(spelling)
      exact.set(key, canonical)
      const foldedKey = fold(key)
      if (!AMBIGUOUS_FOLDED.has(foldedKey)) folded.set(foldedKey, canonical)
    }
  }
  return { exact, folded }
}

const SK_CS_LOOKUP = buildLookup(SK_CS_VARIANTS)
const EN_LOOKUP = buildLookup(EN_VARIANTS)

/**
 * Maps teaspoon/tablespoon spellings to the short forms ČL/PL. Slovak and Czech
 * spellings always fold; English ones only when `language` is Slovak or Czech.
 * Any other unit is returned untouched.
 */
export function normalizeUnit(unit: string | null | undefined, language?: string | null): string {
  if (!unit) return ''

  const key = clean(unit)
  if (!key) return unit

  const lookups = SPOON_LANGUAGES.has(language ?? '') ? [SK_CS_LOOKUP, EN_LOOKUP] : [SK_CS_LOOKUP]
  const folded = fold(key)

  for (const lookup of lookups) {
    const exact = lookup.exact.get(key)
    if (exact) return exact
    if (!AMBIGUOUS_FOLDED.has(folded)) {
      const match = lookup.folded.get(folded)
      if (match) return match
    }
  }

  return unit
}
