'use client'

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { placeCard, GUTTER } from './placement'
import type { TourStep } from './tours'

/** How long to wait for a step's target to mount before skipping the step. */
export const TARGET_TIMEOUT_MS = 1000
const SPOT_PADDING = 6
const CARD_WIDTH = 288
const CARD_EST_HEIGHT = 150

/** First element carrying the data-tour value that is actually rendered (not display:none). */
function findTarget(target: string): HTMLElement | null {
  const els = document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`)
  for (const el of Array.from(els)) if (el.getClientRects().length > 0) return el
  return null
}

interface TourOverlayProps {
  step: TourStep
  stepIndex: number
  total: number
  onNext: () => void
  onBack: () => void
  onClose: () => void
}

export function TourOverlay({ step, stepIndex, total, onNext, onBack, onClose }: TourOverlayProps) {
  const t = useTranslations('tour')
  const titleId = useId()
  const bodyId = useId()
  const [target, setTarget] = useState<HTMLElement | null>(null)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const [cardHeight, setCardHeight] = useState(CARD_EST_HEIGHT)

  // Latest callbacks in refs, so unstable callers can't re-run (and re-arm the timeout of) the effects below.
  const onNextRef = useRef(onNext)
  const onCloseRef = useRef(onClose)
  useLayoutEffect(() => {
    onNextRef.current = onNext
    onCloseRef.current = onClose
  })

  // Resolve the target, waiting briefly for it to mount; never trap the user on a missing one.
  // (The provider keys the overlay per step, so these resets only matter if step.target changes in place.)
  useEffect(() => {
    setTarget(null)
    setRect(null)
    const found = findTarget(step.target)
    if (found) {
      setTarget(found)
      return
    }
    const observer = new MutationObserver(() => {
      const el = findTarget(step.target)
      if (el) {
        observer.disconnect()
        clearTimeout(timer)
        setTarget(el)
      }
    })
    observer.observe(document.body, { childList: true, subtree: true, attributes: true })
    const timer = setTimeout(() => {
      observer.disconnect()
      onNextRef.current()
    }, TARGET_TIMEOUT_MS)
    return () => {
      observer.disconnect()
      clearTimeout(timer)
    }
  }, [step.target])

  // Keep the spotlight on the target through scrolling (any container) and resizes.
  useLayoutEffect(() => {
    if (!target) return
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    target.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' })
    const update = () => setRect(target.getBoundingClientRect())
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [target])

  // If the target node is replaced (re-render, data load), follow the live element.
  useEffect(() => {
    if (!target) return
    const observer = new MutationObserver(() => {
      if (target.isConnected) return
      const el = findTarget(step.target)
      if (el) setTarget(el)
    })
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [target, step.target])

  // Clicking the highlighted control is progress (e.g. tapping Plan or Edit).
  useEffect(() => {
    if (!target || !step.advanceOnTargetClick) return
    const onClick = () => onNextRef.current()
    target.addEventListener('click', onClick)
    return () => target.removeEventListener('click', onClick)
  }, [target, step.advanceOnTargetClick])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) onCloseRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // Move focus into the card once it is shown; stay unobtrusive when the user is meant to click the target.
  const shown = Boolean(target && rect)
  useEffect(() => {
    if (!shown) return
    const el = step.advanceOnTargetClick
      ? cardRef.current
      : cardRef.current?.querySelector<HTMLButtonElement>('[data-tour-primary]')
    el?.focus({ preventScroll: true })
  }, [shown, step.advanceOnTargetClick, stepIndex])

  useLayoutEffect(() => {
    const h = cardRef.current?.offsetHeight
    if (h && h !== cardHeight) setCardHeight(h)
  })

  if (!target || !rect) return null

  const spot = {
    top: rect.top - SPOT_PADDING,
    left: rect.left - SPOT_PADDING,
    width: rect.width + SPOT_PADDING * 2,
    height: rect.height + SPOT_PADDING * 2,
  }
  const viewport = { width: window.innerWidth, height: window.innerHeight }
  const cardWidth = Math.min(CARD_WIDTH, viewport.width - GUTTER * 2)
  const pos = placeCard(spot, step.placement, viewport, { width: cardWidth, height: cardHeight })
  const isLast = stepIndex === total - 1

  return createPortal(
    // The layer ignores pointer events so the highlighted control stays clickable.
    <div className="fixed inset-0 z-[60] pointer-events-none">
      <div
        className="absolute rounded-xl"
        style={{ ...spot, boxShadow: '0 0 0 9999px rgb(0 0 0 / 0.5)' }}
      />
      <div
        ref={cardRef}
        role="dialog"
        tabIndex={-1}
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        className="pointer-events-auto absolute rounded-xl bg-white p-4 shadow-xl focus:outline-none"
        style={{ top: pos.top, left: pos.left, width: cardWidth }}
      >
        <p id={titleId} className="text-sm font-semibold text-gray-900">{t(`${step.key}.title`)}</p>
        <p id={bodyId} className="mt-1 text-sm leading-5 text-gray-600">{t(`${step.key}.body`)}</p>
        <div className="mt-4 flex items-center gap-2">
          {total > 1 && (
            <span className="text-xs text-gray-500">{t('controls.stepOf', { current: stepIndex + 1, total })}</span>
          )}
          {total > 1 && (
            <button type="button" onClick={onClose} className="ml-auto text-xs font-medium text-gray-500 hover:text-gray-900 focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:outline-none">
              {t('controls.skip')}
            </button>
          )}
          {stepIndex > 0 && (
            <button
              type="button"
              onClick={onBack}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:outline-none ${total > 1 ? '' : 'ml-auto'}`}
            >
              {t('controls.back')}
            </button>
          )}
          <button
            type="button"
            data-tour-primary
            onClick={onNext}
            className={`rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700 focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:outline-none ${total > 1 ? '' : 'ml-auto'}`}
          >
            {total === 1 ? t('controls.gotIt') : isLast ? t('controls.done') : t('controls.next')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
