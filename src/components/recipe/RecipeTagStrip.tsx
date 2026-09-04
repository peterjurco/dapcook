'use client'

import { useLayoutEffect, useRef, useState } from 'react'

const GAP_PX = 8 // matches gap-2

interface RecipeTagStripProps {
  /** Candidate tags in priority order. Only as many as fit the available
   *  width are actually rendered. */
  tags: string[]
  renderPill: (tag: string) => React.ReactNode
  /** Fires whenever the fitted count changes, so a caller can tell exactly
   *  which tags are currently visible (not just present in `tags`) — e.g.
   *  to decide whether selecting one needs to bring it into view. Should be
   *  a stable reference (a raw useState setter is fine) since it isn't in
   *  this component's own render/measure loop. */
  onVisibleCountChange?: (count: number) => void
}

/**
 * Renders as many pills as fit on one line, no horizontal scroll and no
 * partially-cut-off pill at the edge. Requires measuring actual rendered
 * pill widths (font/padding vary with content), which CSS alone can't do
 * cleanly — an `overflow-hidden` row would just clip the last pill mid-way.
 */
export function RecipeTagStrip({ tags, renderPill, onVisibleCountChange }: RecipeTagStripProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const [visibleCount, setVisibleCount] = useState(tags.length)

  useLayoutEffect(() => {
    const container = containerRef.current
    const measure = measureRef.current
    if (!container || !measure) return

    function recompute() {
      if (!container || !measure) return
      const availableWidth = container.clientWidth
      const pills = Array.from(measure.children) as HTMLElement[]

      let used = 0
      let count = 0
      for (const pill of pills) {
        const next = used + (count > 0 ? GAP_PX : 0) + pill.offsetWidth
        if (next > availableWidth) break
        used = next
        count++
      }
      setVisibleCount(count)
      onVisibleCountChange?.(count)
    }

    recompute()
    const observer = new ResizeObserver(recompute)
    observer.observe(container)
    return () => observer.disconnect()
  }, [tags, onVisibleCountChange])

  return (
    <div ref={containerRef} className="flex-1 min-w-0">
      {/* Hidden measurement pass: same pills, off-screen, used only to read
          their real rendered widths before deciding how many fit for real. */}
      <div
        ref={measureRef}
        className="flex items-center gap-2 absolute invisible pointer-events-none -z-10"
        style={{ top: -9999, left: -9999 }}
        aria-hidden="true"
      >
        {tags.map(renderPill)}
      </div>

      <div data-testid="tag-strip-visible" className="flex items-center gap-2 overflow-hidden">
        {tags.slice(0, visibleCount).map(renderPill)}
      </div>
    </div>
  )
}
