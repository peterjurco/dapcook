/// <reference types="vite/client" />

/**
 * Real English message catalogs, keyed by next-intl namespace. Used to mock
 * `useTranslations` in component tests so assertions check actual copy
 * instead of translation keys, and so a typo'd key fails the test (lookup
 * returns `undefined`) instead of silently rendering as a literal key path.
 *
 * Built automatically from every `messages/en/*.json` file, so adding a new
 * namespace file is enough to make it available here — no manual registration.
 */
const messageModules = import.meta.glob<{ default: Record<string, unknown> }>('../../messages/en/*.json', {
  eager: true,
})

const messagesByNamespace: Record<string, Record<string, unknown>> = Object.fromEntries(
  Object.entries(messageModules).map(([path, mod]) => {
    const namespace = path.match(/([^/]+)\.json$/)![1]
    return [namespace, mod.default]
  })
)

function getByPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in acc) {
      return (acc as Record<string, unknown>)[key]
    }
    return undefined
  }, obj)
}

/**
 * Resolves `key` (e.g. `'actions.cancel'`) against the real English messages
 * for `namespace` (e.g. `'common'`). Throws if the key doesn't exist, so a
 * component referencing a key that isn't in the message file fails its test
 * rather than rendering nothing.
 *
 * Use in a per-file `vi.mock`:
 * ```ts
 * vi.mock('next-intl', () => ({
 *   useTranslations: (namespace: string) => (key: string) => mockTranslate(namespace, key),
 * }))
 * ```
 */
export function mockTranslate(namespace: string, key: string): string {
  const value = getByPath(messagesByNamespace[namespace], key)
  if (typeof value !== 'string') {
    throw new Error(`mockTranslate: no string found for "${namespace}.${key}" — is the key in messages/en/${namespace}.json?`)
  }
  return value
}
