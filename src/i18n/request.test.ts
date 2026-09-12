// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { resolveLocale } from './request'

// Note: this deliberately tests `resolveLocale` in isolation rather than
// invoking the module's default export (the `getRequestConfig`-wrapped
// callback). `next-intl/server` resolves to a different build depending on
// the `react-server` module condition, which Vitest doesn't set — so calling
// the wrapped callback here would hit next-intl's "not supported in Client
// Components" stub rather than exercising real behavior. `resolveLocale`
// holds all the branching logic this bug fix is about, so testing it
// directly is both reliable and representative.
describe('resolveLocale', () => {
  it('falls back to the ambient requestLocale when no explicit locale override is passed', () => {
    expect(resolveLocale(undefined, 'sk')).toBe('sk')
  })

  it('falls back to defaultLocale when neither locale nor requestLocale resolve to a supported locale', () => {
    expect(resolveLocale(undefined, undefined)).toBe('en')
  })

  it('prefers an explicit locale override over the ambient requestLocale', () => {
    expect(resolveLocale('en', 'sk')).toBe('en')
  })

  it('falls back to defaultLocale when requestLocale resolves to an unsupported locale', () => {
    expect(resolveLocale(undefined, 'fr')).toBe('en')
  })

  it('falls back to defaultLocale when the explicit locale override is unsupported', () => {
    expect(resolveLocale('fr', 'sk')).toBe('en')
  })
})
