'use client'

import { useSyncExternalStore } from 'react'

const noSubscription = () => () => {}

/**
 * A value only the browser knows (storage, `navigator`, `window.location`),
 * read during render instead of copied into state from an effect.
 *
 * The server render and hydration use `serverValue`; React then re-renders
 * with `read()` straight after hydrating, just as a mount effect would.
 * `read` runs on every render, so it must be cheap and return a primitive (or
 * the same object) for unchanged data. It is not re-read on outside changes.
 */
export function useClientValue<T>(read: () => T, serverValue: T): T {
  return useSyncExternalStore(noSubscription, read, () => serverValue)
}
