import * as React from 'react'

type AsyncFn = (...args: never[]) => Promise<unknown>

/**
 * `React.cache` only exists in the react-server build Next uses on the server;
 * outside it (unit tests) fall back to calling through uncached.
 */
export const perRequest: <T extends AsyncFn>(fn: T) => T =
  (React as { cache?: <T extends AsyncFn>(fn: T) => T }).cache ?? ((fn) => fn)
