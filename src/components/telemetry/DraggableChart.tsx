import { useRef, useState, useCallback, type ReactNode } from "react"
import { GripVertical } from "lucide-react"

interface DraggableChartProps {
  id: string
  title: string
  unit?: string
  children: ReactNode
  onDragStart: (id: string) => void
  onDragEnd: () => void
  onDragOver?: (id: string) => void
  onDrop: (draggedId: string, targetId: string) => void
  isDragging?: boolean
  dragOverId?: string | null
  className?: string
  style?: React.CSSProperties
}

export function DraggableChart({
  id,
  title,
  unit,
  children,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  dragOverId,
  className = "",
  style,
}: DraggableChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [isDraggingThis, setIsDraggingThis] = useState(false)

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      setIsDraggingThis(true)
      e.dataTransfer.effectAllowed = "move"
      e.dataTransfer.setData("text/plain", id)
      onDragStart(id)
    },
    [id, onDragStart],
  )

  const handleDragEnd = useCallback(
    () => {
      setIsDraggingThis(false)
      setIsDragOver(false)
      onDragEnd()
    },
    [onDragEnd],
  )

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.dataTransfer.dropEffect = "move"
      setIsDragOver(true)
      onDragOver?.(id)
    },
    [id, onDragOver],
  )

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    const relatedTarget = e.relatedTarget as HTMLElement
    // Only clear drag over if we're actually leaving the container
    if (!containerRef.current?.contains(relatedTarget)) {
      setIsDragOver(false)
      // Note: onDragOver callback is handled by parent, so we don't clear it here
    }
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)
      const draggedId = e.dataTransfer.getData("text/plain")
      if (draggedId && draggedId !== id) {
        onDrop(draggedId, id)
      }
    },
    [id, onDrop],
  )

  const isCurrentlyDraggedOver = dragOverId === id || (isDragOver && !isDraggingThis)

  return (
    <div
      ref={containerRef}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`relative bg-background transition-all group border flex flex-col ${className} ${isDraggingThis ? "opacity-50" : ""
        } ${isCurrentlyDraggedOver ? "ring-2 ring-primary ring-offset-1" : ""}`}
      style={style}
    >
      {/* Header with drag handle */}
      <div className="flex items-center justify-between mb-0.5 px-2 pt-1 relative flex-shrink-0">
        <div className="flex items-center gap-1">
          <div
            draggable
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            className="opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing touch-none select-none p-0.5 hover:bg-muted rounded"
            onMouseDown={(e) => {
              e.stopPropagation()
            }}
          >
            <GripVertical className="h-3 w-3 text-muted-foreground pointer-events-none" />
          </div>
          <span className="text-xs font-medium">{title}</span>
        </div>
        {unit && <span className="text-[10px] text-muted-foreground">{unit}</span>}
      </div>

      {/* Chart content */}
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  )
}

