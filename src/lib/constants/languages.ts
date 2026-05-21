export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'it', label: 'Italian' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'nl', label: 'Dutch' },
  { code: 'pl', label: 'Polish' },
  { code: 'ru', label: 'Russian' },
  { code: 'cs', label: 'Czech' },
  { code: 'sk', label: 'Slovak' },
] as const

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]['code']

/** Map from BCP-47 code to English name for use in AI prompts. */
export const LANGUAGE_NAMES: Record<string, string> = Object.fromEntries(
  SUPPORTED_LANGUAGES.map((l) => [l.code, l.label])
)

/** Ordered list of valid language codes. */
export const VALID_LANGUAGE_CODES: string[] = SUPPORTED_LANGUAGES.map((l) => l.code)
