'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { isTourId, type TourId } from '@/lib/tours/ids'
import { TOURS } from './tours'
import { TourOverlay } from './TourOverlay'

/** Lets layout and scroll settle before a tour appears. */
export const TOUR_START_DELAY_MS = 600

interface ActiveTour {
  id: TourId
  stepIndex: number
  pathname: string
}

interface TourContextValue {
  seen: ReadonlySet<TourId>
  active: ActiveTour | null
  start: (id: TourId) => void
  next: () => void
  back: () => void
  /** Ends the active tour (finished or skipped) and marks it seen. */
  close: () => void
  /** Marks a tour seen without showing it, e.g. once the user already did what it teaches. */
  markSeen: (id: TourId) => void
}

const TourContext = createContext<TourContextValue | null>(null)

export function TourProvider({ initialSeen, children }: { initialSeen: string[]; children: React.ReactNode }) {
  const pathname = usePathname()
  const [seen, setSeen] = useState<ReadonlySet<TourId>>(() => new Set(initialSeen.filter(isTourId)))
  const seenRef = useRef(seen)
  const [active, setActiveState] = useState<ActiveTour | null>(null)
  // Refs mirror state synchronously so two tours starting in one tick can't both win.
  const activeRef = useRef<ActiveTour | null>(null)
  const pathnameRef = useRef(pathname)
  pathnameRef.current = pathname

  const setActive = useCallback((next: ActiveTour | null) => {
    activeRef.current = next
    setActiveState(next)
  }, [])

  const markSeen = useCallback((id: TourId) => {
    if (seenRef.current.has(id)) return
    const next = new Set(seenRef.current).add(id)
    seenRef.current = next
    setSeen(next)
    fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tour_seen: id }),
    }).catch(() => {
      // Best effort — worst case the tour shows once more on another device.
    })
  }, [])

  const start = useCallback((id: TourId) => {
    if (seenRef.current.has(id) || activeRef.current) return
    setActive({ id, stepIndex: 0, pathname: pathnameRef.current })
  }, [setActive])

  const close = useCallback(() => {
    const current = activeRef.current
    if (!current) return
    setActive(null)
    markSeen(current.id)
  }, [markSeen, setActive])

  const next = useCallback(() => {
    const current = activeRef.current
    if (!current) return
    if (current.stepIndex + 1 >= TOURS[current.id].length) close()
    else setActive({ ...current, stepIndex: current.stepIndex + 1 })
  }, [close, setActive])

  const back = useCallback(() => {
    const current = activeRef.current
    if (!current || current.stepIndex === 0) return
    setActive({ ...current, stepIndex: current.stepIndex - 1 })
  }, [setActive])

  // Leaving the page ends the tour; it counts as skipped.
  useEffect(() => {
    if (activeRef.current && activeRef.current.pathname !== pathname) close()
  }, [pathname, close])

  const value = useMemo(
    () => ({ seen, active, start, next, back, close, markSeen }),
    [seen, active, start, next, back, close, markSeen],
  )

  return (
    <TourContext.Provider value={value}>
      {children}
      {active && (
        <TourOverlay
          key={`${active.id}-${active.stepIndex}`}
          step={TOURS[active.id][active.stepIndex]}
          stepIndex={active.stepIndex}
          total={TOURS[active.id].length}
          onNext={next}
          onBack={back}
          onClose={close}
        />
      )}
    </TourContext.Provider>
  )
}

/** Tour controls, or null outside a TourProvider. */
export function useTourControls(): TourContextValue | null {
  return useContext(TourContext)
}

/**
 * Shows tour `id` once `condition` holds (after a short settle delay), unless it was
 * already seen or another tour is running. Ends the tour if `condition` stops holding.
 */
export function useTour(id: TourId, condition: boolean) {
  const ctx = useContext(TourContext)
  const start = ctx?.start
  const close = ctx?.close
  const isSeen = ctx ? ctx.seen.has(id) : true
  const activeId = ctx?.active?.id ?? null

  useEffect(() => {
    if (!start || !condition || isSeen || activeId) return
    const timer = setTimeout(() => start(id), TOUR_START_DELAY_MS)
    return () => clearTimeout(timer)
  }, [start, id, condition, isSeen, activeId])

  useEffect(() => {
    if (!condition && activeId === id) close?.()
  }, [condition, activeId, id, close])
}

/** True while the active tour step highlights `target` — used to force hover-only controls visible. */
export function useTourStep(target: string): boolean {
  const active = useContext(TourContext)?.active
  if (!active) return false
  return TOURS[active.id][active.stepIndex]?.target === target
}
