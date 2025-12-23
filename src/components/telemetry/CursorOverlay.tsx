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
  containerRef: React.RefObject<HTMLDivElement | null>
}) {
  const lineRef = useRef<HTMLDivElement>(null)
  
  // Helper to get actual plot area bounds by measuring the SVG
  // Uses multiple methods to find the exact plot area boundaries
  const getActualPlotBounds = (): { plotLeft: number; plotWidth: number } | null => {
    if (!containerRef?.current) return null
    
    // Find the SVG element inside the chart
    const svg = containerRef.current.querySelector('svg.recharts-surface') as SVGSVGElement | null
    if (!svg) return null
    
    // Get the container's bounding box for coordinate conversion
    const containerRect = containerRef.current.getBoundingClientRect()
    const svgRect = svg.getBoundingClientRect()
    const svgOffsetX = svgRect.left - containerRect.left
    
    // Method 1: Try to find the plot area by looking for the clipPath used by Recharts
    // The clipPath rectangle defines the exact plot area (excluding axes and labels)
    const clipPath = svg.querySelector('defs clipPath[id^="recharts-clip"]')
    if (clipPath) {
      const clipRect = clipPath.querySelector('rect')
      if (clipRect) {
        const plotX = parseFloat(clipRect.getAttribute('x') || '0')
        const plotWidthSvg = parseFloat(clipRect.getAttribute('width') || '0')
        
        if (plotWidthSvg > 0) {
          // Convert SVG coordinates to container pixel coordinates
          const viewBox = svg.viewBox.baseVal
          let plotLeftInPixels: number
          let plotWidthInPixels: number
          
          if (viewBox.width > 0 && viewBox.height > 0) {
            // SVG has a viewBox - coordinates need scaling
            const scaleX = svgRect.width / viewBox.width
            plotLeftInPixels = svgOffsetX + (plotX * scaleX)
            plotWidthInPixels = plotWidthSvg * scaleX
          } else {
            // No viewBox - coordinates are in pixel space relative to SVG
            // Check if SVG has explicit width that differs from rendered size
            const svgWidthAttr = svg.width?.baseVal?.value
            if (svgWidthAttr && svgWidthAttr > 0 && Math.abs(svgWidthAttr - svgRect.width) > 1) {
              // Need scaling
              const scaleX = svgRect.width / svgWidthAttr
              plotLeftInPixels = svgOffsetX + (plotX * scaleX)
              plotWidthInPixels = plotWidthSvg * scaleX
            } else {
              // 1:1 mapping - coordinates are already in container pixel space relative to SVG
              plotLeftInPixels = svgOffsetX + plotX
              plotWidthInPixels = plotWidthSvg
            }
          }
          
          return { plotLeft: plotLeftInPixels, plotWidth: plotWidthInPixels }
        }
      }
    }
    
    // Method 2: Try to find the X-axis line which spans the plot area
    const xAxisLines = svg.querySelectorAll('.recharts-cartesian-axis line, .recharts-xAxis line')
    for (const line of Array.from(xAxisLines)) {
      const x1 = parseFloat(line.getAttribute('x1') || '0')
      const x2 = parseFloat(line.getAttribute('x2') || '0')
      const plotLeftSvg = Math.min(x1, x2)
      const plotRightSvg = Math.max(x1, x2)
      const plotWidthSvg = plotRightSvg - plotLeftSvg
      
      if (plotWidthSvg > 0) {
        const viewBox = svg.viewBox.baseVal
        if (viewBox.width > 0) {
          const scaleX = svgRect.width / viewBox.width
          return {
            plotLeft: svgOffsetX + (plotLeftSvg * scaleX),
            plotWidth: plotWidthSvg * scaleX
          }
        } else {
          return {
            plotLeft: svgOffsetX + plotLeftSvg,
            plotWidth: plotWidthSvg
          }
        }
      }
    }
    
    return null
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
      const absoluteX = marginLeft + plotX
      // Use translate3d for GPU acceleration - center line (line is 2px wide, so offset by 1px)
      el.style.display = 'block'
      el.style.transform = `translate3d(${absoluteX - 1}px, 0, 0)`
      return
    }
    
    // Use actual plot area bounds
    const { plotLeft, plotWidth } = plotBounds
    const normalizedPosition = (cursorDistance - xMin) / xRange
    const plotX = normalizedPosition * plotWidth
    const absoluteX = plotLeft + plotX
    // Use translate3d for GPU acceleration - center line (line is 2px wide, so offset by 1px)
    el.style.display = 'block'
    el.style.transform = `translate3d(${absoluteX - 1}px, 0, 0)`
  }, [xMin, xMax, marginLeft, marginRight, containerRef])
  
  return (
    <div
      ref={lineRef}
      className="absolute top-0 bottom-0 pointer-events-none z-10"
      style={{
        display: 'none',
        left: '0',
        width: '2px',
        backgroundColor: 'white',
        willChange: 'transform',
      }}
    />
  )
}

