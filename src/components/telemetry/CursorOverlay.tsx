import { useRef } from "react"
import { useCursorSubscription } from "@/lib/cursorStore"

// Cursor line overlay - uses subscription for direct DOM updates (no React re-renders)
export function CursorOverlay({
  xMin,
  xMax,
  marginLeft,
  marginRight,
  containerRef,
}: {
  xMin: number
  xMax: number
  marginLeft: number
  marginRight: number
  containerRef: React.RefObject<HTMLDivElement>
}) {
  const lineRef = useRef<HTMLDivElement>(null)
  
  // Helper to get actual plot area bounds by measuring the SVG
  const getActualPlotBounds = (): { plotLeft: number; plotWidth: number } | null => {
    if (!containerRef?.current) return null
    
    // Find the SVG element inside the chart
    const svg = containerRef.current.querySelector('svg.recharts-surface')
    if (!svg) return null
    
    // Find the plot area clipPath
    const clipPath = svg.querySelector('defs clipPath[id^="recharts-clip"]')
    if (!clipPath) return null
    
    // Get the clipPath rectangle which defines the plot area
    const clipRect = clipPath.querySelector('rect')
    if (!clipRect) return null
    
    const plotX = parseFloat(clipRect.getAttribute('x') || '0')
    const plotWidth = parseFloat(clipRect.getAttribute('width') || '0')
    
    if (plotWidth <= 0) return null
    
    return { plotLeft: plotX, plotWidth }
  }
  
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
    
    // Get actual plot area bounds (accounts for label widths)
    const plotBounds = getActualPlotBounds()
    if (!plotBounds) {
      // Fallback to margin-based calculation
      const container = el.parentElement
      if (!container) {
        el.style.display = 'none'
        return
      }
      const chartWidth = container.getBoundingClientRect().width
      const plotWidth = Math.max(1, chartWidth - marginLeft - marginRight)
      const normalizedPosition = (cursorDistance - xMin) / xRange
      const plotX = normalizedPosition * plotWidth
      el.style.display = 'block'
      el.style.left = `${marginLeft + plotX}px`
      return
    }
    
    // Use actual plot area bounds
    const { plotLeft, plotWidth } = plotBounds
    const normalizedPosition = (cursorDistance - xMin) / xRange
    const plotX = normalizedPosition * plotWidth
    const absoluteX = plotLeft + plotX
    
    el.style.display = 'block'
    el.style.left = `${absoluteX}px`
  }, [xMin, xMax, marginLeft, marginRight, containerRef])
  
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

