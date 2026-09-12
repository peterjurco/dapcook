/// <reference types="vite/client" />

import { createTranslator, type TranslationValues } from 'use-intl'

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

// One real next-intl translator per namespace, built from the actual English
// messages. Using the real translator (rather than a plain dot-path lookup)
// means ICU features used in the messages — plurals, number/date
// interpolation — resolve exactly as they do in production.
const translatorsByNamespace: Record<string, ReturnType<typeof createTranslator>> = {}

function getTranslator(namespace: string) {
  if (!(namespace in messagesByNamespace)) {
    throw new Error(`mockTranslate: no message file found for namespace "${namespace}" — is messages/en/${namespace}.json present?`)
  }
  if (!translatorsByNamespace[namespace]) {
    translatorsByNamespace[namespace] = createTranslator({
      locale: 'en',
      namespace,
      messages: { [namespace]: messagesByNamespace[namespace] },
      // Throw loudly on a missing key instead of use-intl's default
      // behaviour of logging and falling back to the key path — a typo'd
      // key should fail the test, not silently render as `namespace.key`.
      onError: (error) => {
        throw error
      },
    })
  }
  return translatorsByNamespace[namespace]
}

/**
 * Resolves `key` (e.g. `'actions.cancel'`) against the real English messages
 * for `namespace` (e.g. `'common'`), using the real next-intl translator so
 * ICU messages (e.g. plurals) are formatted exactly as in production. Pass
 * `values` for any message that takes interpolation arguments (e.g.
 * `t('filtersModal.showResults', { count })`). Throws if the key doesn't
 * exist, so a component referencing a key that isn't in the message file
 * fails its test rather than rendering nothing.
 *
 * Use in a per-file `vi.mock`:
 * ```ts
 * vi.mock('next-intl', () => ({
 *   useTranslations: (namespace: string) => (key: string, values?: Record<string, unknown>) =>
 *     mockTranslate(namespace, key, values),
 * }))
 * ```
 */
export function mockTranslate(namespace: string, key: string, values?: TranslationValues): string {
  return getTranslator(namespace)(key, values) as string
}
