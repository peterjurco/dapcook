'use client'

import { useSyncExternalStore } from 'react'

const QUERY = '(min-width: 768px)'

function hasMatchMedia(): boolean {
  return typeof window.matchMedia === 'function'
}

function subscribe(onChange: () => void): () => void {
  if (!hasMatchMedia()) return () => {}
  const mq = window.matchMedia(QUERY)
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}

function getSnapshot(): boolean | null {
  return hasMatchMedia() ? window.matchMedia(QUERY).matches : null
}

function getServerSnapshot(): null {
  return null
}

/** Tailwind `md` breakpoint. null until measured on the client (and in environments without matchMedia). */
export function useIsDesktop(): boolean | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
