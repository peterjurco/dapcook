import { useEffect, useRef } from 'react'

/** Scrolls the page back to the top whenever `key` changes (not on first render). */
export function useScrollToTop(key: unknown) {
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    window.scrollTo({ top: 0 })
  }, [key])
}
