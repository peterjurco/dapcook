import { GripHorizontal } from 'lucide-react'

interface ResizeHandleProps {
  show: boolean
  isResizing: boolean
  title: string
  onMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void
}

/** Desktop-only drag-right-to-extend/shrink handle shared by SlotCard and CustomLabelCard. */
export function ResizeHandle({ show, isResizing, title, onMouseDown }: ResizeHandleProps) {
  if (!show) return null
  return (
    <div
      onMouseDown={onMouseDown}
      className={`hidden md:flex absolute top-0 bottom-0 right-[-10px] w-7 flex-col items-center justify-center cursor-ew-resize rounded-r-lg z-10 transition-opacity ${
        isResizing ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
      }`}
      title={title}
      aria-label={title}
    >
      <GripHorizontal size={12} className="text-gray-400" />
    </div>
  )
}
