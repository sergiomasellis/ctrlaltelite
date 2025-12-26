import type { ReactNode } from "react"

interface DraggableChartProps {
  title: string
  unit?: string
  children: ReactNode
  handle?: ReactNode
  className?: string
  style?: React.CSSProperties
}

export function DraggableChart({
  title,
  unit,
  children,
  handle,
  className = "",
  style,
}: DraggableChartProps) {
  return (
    <div
      className={`relative bg-background transition-all group border flex flex-col ${className}`}
      style={style}
    >
      <div className="flex items-center justify-between mb-0.5 px-2 pt-1 relative flex-shrink-0">
        <div className="flex items-center gap-1">
          {handle}
          <span className="text-xs font-medium">{title}</span>
        </div>
        {unit && <span className="text-[10px] text-muted-foreground">{unit}</span>}
      </div>

      <div className="flex-1 min-h-0">{children}</div>
    </div>
  )
}
