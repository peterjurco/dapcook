import { GripHorizontal } from 'lucide-react'
import { useTourStep } from '@/components/tour/TourProvider'

interface ResizeHandleProps {
  show: boolean
  isResizing: boolean
  title: string
  onMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void
}

/** Desktop-only drag-right-to-extend/shrink handle shared by SlotCard and CustomLabelCard. */
export function ResizeHandle({ show, isResizing, title, onMouseDown }: ResizeHandleProps) {
  // Hover-only in normal use; forced visible while the tour points at it.
  const highlighted = useTourStep('grid-resize')
  if (!show) return null
  return (
    <div
      data-tour="grid-resize"
      onMouseDown={onMouseDown}
      className={`hidden md:flex absolute top-0 bottom-0 right-[-10px] w-7 flex-col items-center justify-center cursor-ew-resize rounded-r-lg z-10 transition-opacity ${
        isResizing || highlighted ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
      }`}
      title={title}
      aria-label={title}
    >
      <GripHorizontal size={12} className="text-gray-400" />
    </div>
  )
}
