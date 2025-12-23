import { useState, useCallback, useMemo, useRef, memo, useEffect } from "react"
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ResponsiveContainer,
  ReferenceArea,
  CartesianGrid,
  Tooltip,
} from "recharts"
import { useCursorUpdate } from "@/lib/cursorStore"
import type { ChartSeries } from "./types"
import { sanitizeSvgId, formatYAxisTick } from "./utils"
import { CustomTooltipContent } from "./CustomTooltip"
import { CursorOverlay } from "./CursorOverlay"

// Synced chart component
export interface SyncedChartProps {
  data: any[]
  series: ChartSeries[]
  yDomain?: [number, number]
  chartType?: "monotone" | "stepAfter"
  showYAxisRight?: boolean
  margin?: { top: number; right: number; left: number; bottom: number }
  unit?: string
  formatValue?: (v: number) => string
  // Zoom props
  xMin?: number | null
  xMax?: number | null
  onZoomChange?: (xMin: number | null, xMax: number | null) => void
  originalXMax?: number
}

// Inner chart component - memoized, uses cursor store for updates
const SyncedChartInner = memo(function SyncedChartInner({
  data,
  series,
  yDomain,
  chartType = "monotone",
  showYAxisRight = true,
  margin = { top: 10, right: 40, left: 10, bottom: 10 },
  xMin: zoomXMin = null,
  xMax: zoomXMax = null,
  onZoomChange,
  originalXMax,
  unit,
  formatValue,
  children,
  innerRef,
}: SyncedChartProps & { children?: React.ReactNode; innerRef?: React.RefObject<HTMLDivElement | null> }) {
  // Use cursor store instead of props for updates
  const updateCursor = useCursorUpdate()
  // Use provided ref or create local one for accurate mouse position calculations
  const localRef = useRef<HTMLDivElement>(null)
  const chartRef = innerRef ?? localRef
  const [refAreaLeft, setRefAreaLeft] = useState<number | null>(null)
  const [refAreaRight, setRefAreaRight] = useState<number | null>(null)
  const [isSelecting, setIsSelecting] = useState(false)
  const rafRef = useRef<number | null>(null)
  const pendingDistanceRef = useRef<number | null>(null)

  const fullXMax = useMemo(() => {
    if (originalXMax != null) return originalXMax
    if (!data || data.length === 0) return 0
    let max = 0
    for (const d of data) {
      const v = d?.distance
      if (typeof v === "number" && Number.isFinite(v) && v > max) max = v
    }
    return max
  }, [data, originalXMax])

  const xMax = zoomXMax ?? fullXMax
  const xMin = zoomXMin ?? 0

  const visibleSeries = useMemo(() => {
    if (!data || data.length === 0) return []
    return series.filter((s) => data.some((d) => d?.[s.key] !== undefined && d?.[s.key] !== null))
  }, [data, series])

  const handleMouseDown = useCallback(
    (e: any) => {
      if (e?.activeLabel != null) {
        const distance = parseFloat(e.activeLabel)
        if (Number.isFinite(distance)) {
          setRefAreaLeft(distance)
          setIsSelecting(true)
        }
      }
    },
    [],
  )

  // Helper to get actual plot area bounds by measuring the SVG
  // Uses multiple methods to find the exact plot area boundaries
  const getActualPlotBounds = useCallback((): { plotLeft: number; plotWidth: number } | null => {
    if (!chartRef?.current) return null
    
    // Find the SVG element inside the chart
    const svg = chartRef.current.querySelector('svg.recharts-surface') as SVGSVGElement | null
    if (!svg) return null
    
    // Get the container's bounding box for coordinate conversion
    const containerRect = chartRef.current.getBoundingClientRect()
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
  }, [])

  // Helper to calculate distance from mouse X position
  const getDistanceFromMouseX = useCallback(
    (clientX: number): number | null => {
      if (!chartRef?.current) return null
      
      const rect = chartRef.current.getBoundingClientRect()
      const mouseX = clientX - rect.left
      
      // Get actual plot area bounds (accounts for label widths)
      const plotBounds = getActualPlotBounds()
      if (!plotBounds) {
        // Fallback to margin-based calculation if we can't find the plot area
        const chartWidth = rect.width
        if (chartWidth <= 0) return null
        const marginLeft = margin.left || 10
        const marginRight = margin.right || 40
        const plotWidth = Math.max(1, chartWidth - marginLeft - marginRight)
        const plotX = mouseX - marginLeft
        const clampedX = Math.max(0, Math.min(plotWidth, plotX))
        const normalizedX = clampedX / plotWidth
        const xRange = xMax - xMin
        const distance = xMin + normalizedX * xRange
        return Number.isFinite(distance) ? distance : null
      }
      
      // Use actual plot area bounds
      const { plotLeft, plotWidth } = plotBounds
      const plotX = mouseX - plotLeft
      
      // Clamp to plot area
      const clampedX = Math.max(0, Math.min(plotWidth, plotX))
      const normalizedX = clampedX / plotWidth
      const xRange = xMax - xMin
      const distance = xMin + normalizedX * xRange
      
      return Number.isFinite(distance) ? distance : null
    },
    [xMin, xMax, margin, getActualPlotBounds],
  )

  // Handle smooth mouse movement with RAF throttling for performance
  const handleContainerMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!chartRef?.current) return
      
      const distance = getDistanceFromMouseX(e.clientX)
      if (distance == null) return
      
      // If selecting (dragging to zoom), update immediately for visual feedback
      if (isSelecting) {
        setRefAreaRight(distance)
        return
      }
      
      // Throttle cursor updates using requestAnimationFrame
      pendingDistanceRef.current = distance
      if (rafRef.current == null) {
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null
          if (pendingDistanceRef.current != null) {
            updateCursor(pendingDistanceRef.current)
          }
        })
      }
    },
    [isSelecting, getDistanceFromMouseX, updateCursor],
  )

  const handleMouseMove = useCallback(
    (state: any) => {
      if (isSelecting && state?.activeLabel != null) {
        const distance = parseFloat(state.activeLabel)
        if (Number.isFinite(distance)) {
          setRefAreaRight(distance)
        }
      }
      // Fallback: Use Recharts' onMouseMove as backup for cursor tracking
      if (!isSelecting && state?.activePayload && state.activePayload.length > 0) {
        const distance = state.activePayload[0]?.payload?.distance
        if (distance !== undefined && Number.isFinite(distance)) {
          updateCursor(distance)
        }
      }
    },
    [isSelecting, updateCursor],
  )

  const handleMouseUp = useCallback(() => {
    if (refAreaLeft != null && refAreaRight != null && onZoomChange) {
      const [left, right] = [refAreaLeft, refAreaRight].sort((a, b) => a - b)
      onZoomChange(left, right)
    }
    setRefAreaLeft(null)
    setRefAreaRight(null)
    setIsSelecting(false)
  }, [refAreaLeft, refAreaRight, onZoomChange])

  const handleMouseLeave = useCallback(() => {
    if (isSelecting) {
      handleMouseUp()
    } else {
      updateCursor(null)
    }
  }, [isSelecting, handleMouseUp, updateCursor])

  const handleContainerMouseLeave = useCallback(() => {
    if (!isSelecting) {
      updateCursor(null)
    }
  }, [isSelecting, updateCursor])

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      if (!onZoomChange || !chartRef?.current || fullXMax === 0) return

      e.preventDefault()
      const zoomFactor = 0.1
      const direction = e.deltaY < 0 ? 1 : -1

      const currentRange = xMax - xMin
      const zoomAmount = currentRange * zoomFactor * direction

      const chartRect = chartRef.current.getBoundingClientRect()
      const mouseX = e.clientX - chartRect.left
      const chartWidth = chartRect.width
      const mousePercentage = mouseX / chartWidth

      const newXMin = Math.max(0, xMin + zoomAmount * mousePercentage)
      const newXMax = Math.min(fullXMax, xMax - zoomAmount * (1 - mousePercentage))

      if (newXMin < newXMax && newXMax - newXMin >= 0.01) {
        onZoomChange(newXMin, newXMax)
      }
    },
    [xMin, xMax, fullXMax, onZoomChange],
  )

  // Attach wheel event listener directly to DOM with passive: false
  useEffect(() => {
    const element = chartRef.current
    if (!element) return

    element.addEventListener('wheel', handleWheel, { passive: false })

    return () => {
      element.removeEventListener('wheel', handleWheel)
    }
  }, [handleWheel])

  const handleTouchMove = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (!onZoomChange || !chartRef?.current || fullXMax === 0 || e.touches.length !== 2) return

      e.preventDefault()
      const touch1 = e.touches[0]
      const touch2 = e.touches[1]
      const currentDistance = Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY)

      const lastDistance = (e.currentTarget as any).lastTouchDistance
      if (lastDistance == null) {
        ;(e.currentTarget as any).lastTouchDistance = currentDistance
        return
      }

      const direction = currentDistance > lastDistance ? 1 : -1
      const zoomFactor = 0.1
      ;(e.currentTarget as any).lastTouchDistance = currentDistance

      const currentRange = xMax - xMin
      const zoomAmount = currentRange * zoomFactor * direction

      const chartRect = chartRef.current.getBoundingClientRect()
      const centerX = (touch1.clientX + touch2.clientX) / 2 - chartRect.left
      const chartWidth = chartRect.width
      const mousePercentage = centerX / chartWidth

      const newXMin = Math.max(0, xMin + zoomAmount * mousePercentage)
      const newXMax = Math.min(fullXMax, xMax - zoomAmount * (1 - mousePercentage))

      if (newXMin < newXMax && newXMax - newXMin >= 0.01) {
        onZoomChange(newXMin, newXMax)
      }
    },
    [xMin, xMax, fullXMax, onZoomChange, chartRef],
  )

  return (
    <div
      className="relative w-full h-full min-w-0 min-h-0"
      ref={chartRef}
      onMouseMove={handleContainerMouseMove}
      onMouseLeave={handleContainerMouseLeave}
      onTouchMove={handleTouchMove}
      onDoubleClick={() => onZoomChange?.(null, null)}
      style={{ touchAction: "none" }}
    >
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
        <AreaChart
          data={data}
          margin={margin}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          syncId="telemetry"
        >
          <defs>
            {visibleSeries.map((s) => {
              const id = `fill_${sanitizeSvgId(s.key)}`
              return (
                <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={s.color} stopOpacity={0.6} />
                  <stop offset="95%" stopColor={s.color} stopOpacity={0.05} />
                </linearGradient>
              )
            })}
          </defs>

          <XAxis
            dataKey="distance"
            type="number"
            domain={[xMin, xMax]}
            tick={{ fontSize: 8, fill: "#6b7280" }}
            tickFormatter={(v) => `${v.toFixed(2)} km`}
            axisLine={{ stroke: "#374151" }}
            allowDataOverflow
          />
          <YAxis
            domain={yDomain}
            tick={{ fontSize: 8, fill: "#6b7280" }}
            tickFormatter={(value) => formatYAxisTick(value, yDomain)}
            axisLine={{ stroke: "#374151" }}
            orientation={showYAxisRight ? "right" : "left"}
            width={showYAxisRight ? 25 : 30}
          />

          <CartesianGrid
            strokeDasharray="3 3"
            stroke="#374151"
            opacity={0.2}
            horizontal={true}
            vertical={false}
          />

          {/* Data areas */}
          {visibleSeries.map((s) => {
            const fillId = `fill_${sanitizeSvgId(s.key)}`
            return (
              <Area
                key={s.key}
                type={chartType}
                dataKey={s.key}
                stroke={s.color}
                fill={`url(#${fillId})`}
                strokeWidth={1.5}
                isAnimationActive={false}
              />
            )
          })}

          {/* Zoom selection area */}
          {refAreaLeft != null && refAreaRight != null && (
            <ReferenceArea
              x1={refAreaLeft}
              x2={refAreaRight}
              strokeOpacity={0.3}
              fill="hsl(var(--foreground))"
              fillOpacity={0.05}
            />
          )}

          {/* Tooltip - cursor line rendered as overlay for performance */}
          <Tooltip
            content={(props) => (
              <CustomTooltipContent
                {...props}
                series={visibleSeries}
                unit={unit}
                formatValue={formatValue}
              />
            )}
            cursor={false}
            isAnimationActive={false}
            animationDuration={0}
          />
        </AreaChart>
      </ResponsiveContainer>
      {children}
    </div>
  )
})

// Wrapper component that adds cursor overlay
export const SyncedChart = memo(function SyncedChart(props: SyncedChartProps) {
  const margin = props.margin ?? { top: 10, right: 40, left: 10, bottom: 10 }
  const chartRef = useRef<HTMLDivElement | null>(null)
  
  // Calculate xMin and xMax for CursorOverlay
  const xMin = props.xMin ?? 0
  const fullXMax = useMemo(() => {
    if (props.originalXMax != null) return props.originalXMax
    if (!props.data || props.data.length === 0) return 0
    let max = 0
    for (const d of props.data) {
      const v = d?.distance
      if (typeof v === "number" && Number.isFinite(v) && v > max) max = v
    }
    return max
  }, [props.data, props.originalXMax])
  const xMax = props.xMax ?? fullXMax
  
  return (
    <SyncedChartInner {...props} margin={margin} innerRef={chartRef}>
      <CursorOverlay
        xMin={xMin}
        xMax={xMax}
        marginLeft={margin.left}
        marginRight={margin.right}
        containerRef={chartRef}
      />
    </SyncedChartInner>
  )
})

