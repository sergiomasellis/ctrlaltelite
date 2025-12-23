import { useRef } from "react"
import { useCursorSubscription } from "@/lib/cursorStore"

// Cursor line overlay - uses subscription for direct DOM updates (no React re-renders)
export function CursorOverlay({
  xMin,
  xMax,
  marginLeft,
  marginRight,
}: {
  xMin: number
  xMax: number
  marginLeft: number
  marginRight: number
}) {
  const lineRef = useRef<HTMLDivElement>(null)
  
  // Subscribe to cursor updates and directly manipulate DOM
  useCursorSubscription((cursorDistance) => {
    const el = lineRef.current
    if (!el) return
    
    if (cursorDistance === null || cursorDistance < xMin || cursorDistance > xMax) {
      el.style.display = 'none'
      return
    }
    
    const xRange = xMax - xMin
    if (xRange <= 0) {
      el.style.display = 'none'
      return
    }
    
    const normalizedPosition = (cursorDistance - xMin) / xRange
    el.style.display = 'block'
    el.style.left = `calc(${marginLeft}px + (100% - ${marginLeft + marginRight}px) * ${normalizedPosition})`
  }, [xMin, xMax, marginLeft, marginRight])
  
  return (
    <div
      ref={lineRef}
      className="absolute top-0 bottom-0 pointer-events-none z-10"
      style={{
        display: 'none',
        width: '2px',
        backgroundColor: 'white',
        transform: 'translateX(-50%)',
        willChange: 'left',
      }}
    />
  )
}

