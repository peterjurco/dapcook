import * as React from 'react'

/**
 * `React.cache` only exists in the react-server build Next uses on the server;
 * outside it (unit tests) fall back to calling through uncached.
 */
export const perRequest: <T extends () => Promise<unknown>>(fn: T) => T =
  (React as { cache?: <T extends () => Promise<unknown>>(fn: T) => T }).cache ?? ((fn) => fn)
