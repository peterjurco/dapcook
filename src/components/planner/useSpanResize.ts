import { useState } from 'react'

interface UseSpanResizeParams {
  spanDays: number
  maxSpanDays: number
  /** Called on every column boundary crossed during drag — updates state only, no API */
  onSpanPreview: (newSpan: number) => void
  /** Called once on mouseup — persists the final span to the API */
  onSpanCommit: (newSpan: number) => void
}

/** Desktop drag-to-extend/shrink behavior shared by SlotCard and CustomLabelCard. */
export function useSpanResize({ spanDays, maxSpanDays, onSpanPreview, onSpanCommit }: UseSpanResizeParams) {
  const [isResizing, setIsResizing] = useState(false)

  const canExpand = spanDays < maxSpanDays && spanDays < 7
  const showResizeHandle = canExpand || spanDays > 1

  function handleResizeMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    e.preventDefault()
    e.stopPropagation() // prevent dnd-kit from treating this as a move drag

    const cardEl = e.currentTarget.parentElement as HTMLElement
    const cardRect = cardEl.getBoundingClientRect()
    const GAP = 12 // gap-3
    const singleColWidth = (cardRect.width - (spanDays - 1) * GAP) / spanDays
    const columnWidth = singleColWidth + GAP

    const startX = e.clientX
    const startWidth = cardRect.width
    const startSpan = spanDays
    let liveSpan = startSpan

    // Lock to pixel width and lift above adjacent slots so overflow is visible
    cardEl.style.width = `${startWidth}px`
    cardEl.style.zIndex = '20'

    setIsResizing(true)
    document.body.style.cursor = 'ew-resize'
    document.body.style.userSelect = 'none'

    function onMouseMove(ev: MouseEvent) {
      const dx = ev.clientX - startX
      // Stretch/shrink the card DOM element directly — no React re-render during drag
      const maxWidth = maxSpanDays * singleColWidth + (maxSpanDays - 1) * GAP
      const newWidth = Math.max(singleColWidth * 0.5, Math.min(maxWidth, startWidth + dx))
      cardEl.style.width = `${newWidth}px`

      // Track discrete snap so we know what to commit on mouseup
      const daysToAdd = Math.round(dx / columnWidth)
      liveSpan = Math.max(1, Math.min(maxSpanDays, startSpan + daysToAdd))
    }

    function onMouseUp() {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''

      if (liveSpan !== startSpan) {
        // Snap the card to the exact snapped width so the transition to the new
        // grid cell is invisible (card is already at that pixel width when React commits)
        const snappedWidth = liveSpan * singleColWidth + (liveSpan - 1) * GAP
        cardEl.style.width = `${snappedWidth}px`
        onSpanPreview(liveSpan)
        onSpanCommit(liveSpan)
      }

      // After React commits the new grid column span, clear the explicit width
      // rAF fires after microtasks (where React flushes state), so the grid
      // has already updated by the time we clear — no flash
      requestAnimationFrame(() => {
        cardEl.style.width = ''
        cardEl.style.zIndex = ''
        setIsResizing(false)
      })
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  return { isResizing, showResizeHandle, handleResizeMouseDown }
}
