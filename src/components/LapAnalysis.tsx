import { useState, useCallback, useMemo, useRef, memo, useEffect, createContext, useContext } from "react"
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Settings,
  AlertTriangle,
  Bell,
  HelpCircle,
  ArrowUpDown,
  RefreshCw,
  MessageSquare,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { readIbtHeader, readIbtSamples, readIbtVarHeaders, readIbtSessionInfoYaml, type IbtValue } from "@/lib/ibt"
import { 
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ResponsiveContainer,
  ReferenceArea,
  Tooltip,
  CartesianGrid,
} from "recharts"

// ============================================
// CURSOR STORE - Bypasses React state for performance
// Uses direct DOM manipulation like canvas-based apps
// ============================================

type CursorListener = (distance: number | null) => void

interface CursorStore {
  distance: number | null
  listeners: Set<CursorListener>
  setDistance: (distance: number | null) => void
  subscribe: (listener: CursorListener) => () => void
}

function createCursorStore(): CursorStore {
  const store: CursorStore = {
    distance: null,
    listeners: new Set(),
    setDistance: (distance: number | null) => {
      store.distance = distance
      // Notify all listeners synchronously (like canvas redraw)
      store.listeners.forEach(listener => listener(distance))
    },
    subscribe: (listener: CursorListener) => {
      store.listeners.add(listener)
      return () => store.listeners.delete(listener)
    }
  }
  return store
}

const CursorStoreContext = createContext<CursorStore | null>(null)

// Hook to subscribe to cursor updates with direct DOM manipulation
function useCursorSubscription(
  callback: CursorListener,
  deps: React.DependencyList = []
) {
  const store = useContext(CursorStoreContext)
  
  useEffect(() => {
    if (!store) return
    // Subscribe and return unsubscribe function
    return store.subscribe(callback)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, ...deps])
}

// Hook to get cursor update function (doesn't cause re-renders)
function useCursorUpdate() {
  const store = useContext(CursorStoreContext)
  return useCallback((distance: number | null) => {
    store?.setDistance(distance)
  }, [store])
}

// Cursor distance display - subscribes to cursor updates
function CursorDistanceDisplay() {
  const [distance, setDistance] = useState<number | null>(null)
  
  useCursorSubscription((d) => setDistance(d), [])
  
  if (distance === null) return null
  
  return (
    <span className="text-[10px] text-muted-foreground">{distance.toFixed(3)} km</span>
  )
}

// ============================================

// Track SVG path - realistic racing circuit
function TrackMap({
  lapDataByLap,
  selectedLaps,
  lapColors,
}: {
  lapDataByLap: Record<number, IbtLapData> | null
  selectedLaps: number[]
  lapColors: Record<number, string>
}) {
  // Ref for the cursor group element - updated via subscription
  const cursorGroupRef = useRef<SVGGElement>(null)
  // Calculate bounds from all selected laps
  const bounds = useMemo(() => {
    if (!lapDataByLap || selectedLaps.length === 0) return null
    
    let minLat = Infinity
    let maxLat = -Infinity
    let minLon = Infinity
    let maxLon = -Infinity
    
    for (const lap of selectedLaps) {
      const lapData = lapDataByLap[lap]
      if (!lapData) continue
      
      for (const p of lapData.byDist) {
        if (p.lat != null && p.lon != null) {
          minLat = Math.min(minLat, p.lat)
          maxLat = Math.max(maxLat, p.lat)
          minLon = Math.min(minLon, p.lon)
          maxLon = Math.max(maxLon, p.lon)
        }
      }
    }
    
    if (!Number.isFinite(minLat)) return null
    
    return { minLat, maxLat, minLon, maxLon }
  }, [lapDataByLap, selectedLaps])

  // Calculate SVG dimensions and aspect ratio based on GPS bounds
  const svgDimensions = useMemo(() => {
    if (!bounds) return { width: 400, height: 320, padding: 20 }
    
    const latRange = bounds.maxLat - bounds.minLat || 0.001
    const lonRange = bounds.maxLon - bounds.minLon || 0.001
    
    // Account for longitude compression at higher latitudes
    // Average latitude for the track
    const avgLat = (bounds.minLat + bounds.maxLat) / 2
    const lonScale = Math.cos((avgLat * Math.PI) / 180)
    
    // Calculate the actual aspect ratio of the GPS data
    const gpsAspectRatio = (lonRange * lonScale) / latRange
    
    // Base dimensions (can be adjusted)
    const baseWidth = 800
    const baseHeight = 600
    const padding = 20
    
    // Calculate dimensions that preserve the GPS aspect ratio
    let width: number
    let height: number
    
    if (gpsAspectRatio > baseWidth / baseHeight) {
      // GPS data is wider - fit to width
      width = baseWidth
      height = baseWidth / gpsAspectRatio
    } else {
      // GPS data is taller - fit to height
      height = baseHeight
      width = baseHeight * gpsAspectRatio
    }
    
    return { width, height, padding }
  }, [bounds])

  // Convert GPS coordinates to SVG coordinates
  const gpsToSvg = useCallback((lat: number, lon: number): { x: number; y: number } | null => {
    if (!bounds) return null
    
    const latRange = bounds.maxLat - bounds.minLat || 0.001
    const lonRange = bounds.maxLon - bounds.minLon || 0.001
    
    const { width, height, padding } = svgDimensions
    const plotWidth = width - padding * 2
    const plotHeight = height - padding * 2
    
    const x = padding + ((lon - bounds.minLon) / lonRange) * plotWidth
    const y = padding + ((bounds.maxLat - lat) / latRange) * plotHeight // Invert Y axis
    
    return { x, y }
  }, [bounds, svgDimensions])

  // Convert GPS coordinates to SVG path
  const gpsToSvgPath = useCallback((points: IbtLapPoint[]): string => {
    const validPoints = points.filter((p) => p.lat != null && p.lon != null)
    if (validPoints.length === 0) return ""

    const pathParts: string[] = []
    let first = true

    for (const p of validPoints) {
      const svgPos = gpsToSvg(p.lat!, p.lon!)
      if (!svgPos) continue

      if (first) {
        pathParts.push(`M ${svgPos.x.toFixed(2)} ${svgPos.y.toFixed(2)}`)
        first = false
      } else {
        pathParts.push(`L ${svgPos.x.toFixed(2)} ${svgPos.y.toFixed(2)}`)
      }
    }

    return pathParts.join(" ")
  }, [gpsToSvg])

  // Generate paths for selected laps
  const lapPaths = useMemo(() => {
    if (!lapDataByLap || selectedLaps.length === 0) return []
    return selectedLaps.map((lap) => {
      const lapData = lapDataByLap[lap]
      if (!lapData) return null
      const color = lapColors[lap] ?? LAP_COLOR_PALETTE[0]
      const path = gpsToSvgPath(lapData.byDist)
      return { lap, path, color, lapData }
    }).filter((p): p is { lap: number; path: string; color: string; lapData: IbtLapData } => p != null && p.path !== "")
  }, [lapDataByLap, selectedLaps, lapColors, gpsToSvgPath])

  // Build array of valid GPS points for interpolation (memoized separately for performance)
  const validGpsPoints = useMemo(() => {
    if (!lapDataByLap || selectedLaps.length === 0) return []
    
    const refLap = selectedLaps[0]
    if (refLap == null) return []
    
    const lapData = lapDataByLap[refLap]
    if (!lapData) return []
    
    // Filter to only points with valid GPS coordinates, sorted by distance
    return lapData.byDist
      .filter((p): p is IbtLapPoint & { lat: number; lon: number } => 
        p.lat != null && p.lon != null && Number.isFinite(p.lat) && Number.isFinite(p.lon)
      )
      .sort((a, b) => a.distanceKm - b.distanceKm)
  }, [lapDataByLap, selectedLaps])

  // Get total lap distance for percentage calculation
  const totalLapDistance = useMemo(() => {
    if (!lapDataByLap || selectedLaps.length === 0) return 0
    const refLap = selectedLaps[0]
    if (refLap == null) return 0
    const lapData = lapDataByLap[refLap]
    return lapData?.distanceKm ?? 0
  }, [lapDataByLap, selectedLaps])

  // Get reference lap color
  const refLapColor = useMemo(() => {
    const refLap = selectedLaps[0]
    if (refLap == null) return LAP_COLOR_PALETTE[0]
    return lapColors[refLap] ?? LAP_COLOR_PALETTE[0]
  }, [selectedLaps, lapColors])

  // Subscribe to cursor updates and directly manipulate SVG elements
  useCursorSubscription((cursorDistance) => {
    const g = cursorGroupRef.current
    if (!g) return
    
    // Hide if no valid cursor position
    if (cursorDistance == null || !bounds || validGpsPoints.length < 2 || totalLapDistance <= 0) {
      g.style.display = 'none'
      return
    }
    
    // Calculate percentage through the lap (0 to 1)
    const lapPercentage = Math.max(0, Math.min(1, cursorDistance / totalLapDistance))
    
    // Map percentage to an index in the valid GPS points array
    const floatIndex = lapPercentage * (validGpsPoints.length - 1)
    const indexLo = Math.floor(floatIndex)
    const indexHi = Math.min(indexLo + 1, validGpsPoints.length - 1)
    const t = floatIndex - indexLo // Fractional part for interpolation
    
    const p0 = validGpsPoints[indexLo]
    const p1 = validGpsPoints[indexHi]
    if (!p0 || !p1) {
      g.style.display = 'none'
      return
    }
    
    // Linear interpolation between the two GPS points
    const lat = p0.lat + (p1.lat - p0.lat) * t
    const lon = p0.lon + (p1.lon - p0.lon) * t
    
    // Use the same gpsToSvg function that the track paths use for consistent positioning
    const svgPos = gpsToSvg(lat, lon)
    if (!svgPos) {
      g.style.display = 'none'
      return
    }
    
    // Update all circle elements directly
    g.style.display = 'block'
    const circles = g.querySelectorAll('circle')
    circles.forEach(circle => {
      circle.setAttribute('cx', String(svgPos.x))
      circle.setAttribute('cy', String(svgPos.y))
    })
  }, [bounds, gpsToSvg, validGpsPoints, totalLapDistance])

  // Fallback to mock track if no GPS data
  if (lapPaths.length === 0) {
    const trackPath = `
      M 50 120
      C 72 70, 95 50, 130 45
      C 165 40, 200 55, 230 75
      C 260 95, 280 120, 290 150
      C 300 180, 295 210, 275 235
      C 255 260, 220 275, 180 280
      C 140 285, 100 275, 70 255
      C 40 235, 25 200, 30 165
      C 35 130, 45 115, 50 120
      M 180 280
      C 200 270, 230 250, 260 220
      C 290 190, 320 150, 340 120
      C 360 90, 370 70, 365 55
      C 360 40, 340 35, 315 40
      C 290 45, 260 60, 230 75
    `
    return (
      <svg viewBox="0 0 400 320" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
        <path d={trackPath} fill="none" stroke="#2a2a2a" strokeWidth="28" strokeLinecap="round" strokeLinejoin="round" />
        <path d={trackPath} fill="none" stroke="#1a1a1a" strokeWidth="24" strokeLinecap="round" strokeLinejoin="round" />
        <path d={trackPath} fill="none" stroke="#333" strokeWidth="26" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4 8" />
      </svg>
    )
  }

  const { width, height } = svgDimensions

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet">
      {/* Render racing lines for each selected lap */}
      {lapPaths.map(({ lap, path, color }) => (
        <path
          key={lap}
          d={path}
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.9"
        />
      ))}
      
      {/* Render cursor dot for reference lap only - updated via subscription for performance */}
      <g ref={cursorGroupRef} style={{ pointerEvents: "none", display: "none" }}>
        {/* Outer glow ring */}
        <circle
          r="12"
          fill="none"
          stroke={refLapColor}
          strokeWidth="2.5"
          opacity="0.5"
        />
        {/* Middle glow */}
        <circle
          r="8"
          fill={refLapColor}
          opacity="0.3"
        />
        {/* Main dot with white border */}
        <circle
          r="6"
          fill={refLapColor}
          stroke="#ffffff"
          strokeWidth="3"
        />
        {/* Inner highlight */}
        <circle
          r="3"
          fill="#ffffff"
          opacity="1"
        />
      </g>
    </svg>
  )
}

type ChartSeries = {
  key: string
  label: string
  color: string
}

function sanitizeSvgId(id: string) {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_")
}

// Custom tooltip content component for recharts
interface CustomTooltipProps {
  active?: boolean
  payload?: ReadonlyArray<any>
  label?: string | number
  series: ChartSeries[]
  unit?: string
  formatValue?: (v: number) => string
}

function CustomTooltipContent({
  active,
  payload,
  series,
  unit = "",
  formatValue = (v) => v.toFixed(1),
}: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null

  const data = payload[0]?.payload
  if (!data) return null

  const distance = data.distance

  const formatMaybe = (v: unknown) => {
    if (typeof v !== "number" || !Number.isFinite(v)) return "—"
    return `${formatValue(v)}${unit}`
  }

  const rows = series
    .map((s) => ({ ...s, value: data[s.key] }))
    .filter((r) => r.value !== undefined && r.value !== null)

  return (
    <div className="bg-card/95 backdrop-blur-sm border border-border rounded-lg px-3 py-2 shadow-xl">
      <div className="text-[10px] text-muted-foreground mb-1.5 font-medium">
        {typeof distance === "number" && Number.isFinite(distance) ? `${distance.toFixed(3)} km` : "—"}
      </div>
      <div className="space-y-1">
        {rows.map((r) => (
          <div key={r.key} className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: r.color }} />
            <span className="text-xs text-muted-foreground">{r.label}</span>
            <span className="ml-auto text-xs text-foreground font-medium">{formatMaybe(r.value)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Cursor line overlay - uses subscription for direct DOM updates (no React re-renders)
function CursorOverlay({
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

// Format Y-axis tick values intelligently
function formatYAxisTick(value: number, yDomain?: [number, number]): string {
  if (!Number.isFinite(value)) return ""
  
  // If domain is provided, use it to determine appropriate precision
  if (yDomain) {
    const [min, max] = yDomain
    const range = Math.abs(max - min)
    
    // For very large ranges, use no decimals
    if (range > 1000) {
      return Math.round(value).toString()
    }
    // For large ranges, use 0-1 decimals
    if (range > 100) {
      return value.toFixed(0)
    }
    // For medium ranges, use 1 decimal
    if (range > 10) {
      return value.toFixed(1)
    }
    // For small ranges, use 2 decimals
    if (range > 1) {
      return value.toFixed(2)
    }
    // For very small ranges, use 3 decimals
    return value.toFixed(3)
  }
  
  // Fallback: format based on value magnitude
  const absValue = Math.abs(value)
  if (absValue >= 1000) {
    return Math.round(value).toString()
  }
  if (absValue >= 100) {
    return value.toFixed(0)
  }
  if (absValue >= 10) {
    return value.toFixed(1)
  }
  if (absValue >= 1) {
    return value.toFixed(2)
  }
  return value.toFixed(3)
}

// Synced chart component
interface SyncedChartProps {
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
  unit = "",
  formatValue = (v: number) => v.toFixed(1),
  xMin: zoomXMin = null,
  xMax: zoomXMax = null,
  onZoomChange,
  originalXMax,
  children,
}: SyncedChartProps & { children?: React.ReactNode }) {
  // Use cursor store instead of props for updates
  const updateCursor = useCursorUpdate()
  // Each chart has its OWN ref for accurate mouse position calculations
  const chartRef = useRef<HTMLDivElement>(null)
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

  // Helper to calculate distance from mouse X position
  const getDistanceFromMouseX = useCallback(
    (clientX: number): number | null => {
      if (!chartRef?.current) return null
      
      const rect = chartRef.current.getBoundingClientRect()
      const mouseX = clientX - rect.left
      const chartWidth = rect.width
      
      if (chartWidth <= 0) return null
      
      // Account for margins - Recharts uses these margins for axes
      const marginLeft = margin.left || 10
      const marginRight = margin.right || 40
      const plotWidth = Math.max(1, chartWidth - marginLeft - marginRight)
      const plotX = mouseX - marginLeft
      
      // Clamp to plot area
      const clampedX = Math.max(0, Math.min(plotWidth, plotX))
      const normalizedX = clampedX / plotWidth
      const xRange = xMax - xMin
      const distance = xMin + normalizedX * xRange
      
      return Number.isFinite(distance) ? distance : null
    },
    [xMin, xMax, margin],
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
    (e: React.WheelEvent<HTMLDivElement>) => {
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
    [xMin, xMax, fullXMax, onZoomChange, chartRef],
  )

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
      onWheel={handleWheel}
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
const SyncedChart = memo(function SyncedChart(props: SyncedChartProps) {
  const margin = props.margin ?? { top: 10, right: 40, left: 10, bottom: 10 }
  const xMin = props.xMin ?? 0
  const xMax = props.xMax ?? props.originalXMax ?? 0
  
  return (
    <SyncedChartInner {...props} margin={margin}>
      <CursorOverlay
        xMin={xMin}
        xMax={xMax}
        marginLeft={margin.left}
        marginRight={margin.right}
      />
    </SyncedChartInner>
  )
})

type IbtLapPoint = {
  distanceKm: number
  timeSec: number
  speedKmh: number | null
  throttlePct: number | null
  brakePct: number | null
  gear: number | null
  rpm: number | null
  steeringDeg: number | null
  lat: number | null
  lon: number | null
}

type SectorBoundary = {
  sectorNum: number
  startPct: number
}

type SectorTimes = {
  sectorNum: number
  timeSec: number
  distanceKm: number
}

type IbtLapData = {
  byDist: IbtLapPoint[]
  byTime: IbtLapPoint[]
  lapTimeSec: number
  distanceKm: number
  points: number
  sectorTimes: SectorTimes[]
}

const LAP_COLOR_PALETTE = [
  "#e63946", // red
  "#457b9d", // blue
  "#9d4edd", // purple
  "#2a9d8f", // teal
  "#f4a261", // orange
  "#e9c46a", // yellow
  "#06b6d4", // cyan
  "#22c55e", // green
  "#f97316", // orange-2
  "#a855f7", // violet
]

function formatLapTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "—"
  const ms = Math.round(seconds * 1000)
  const m = Math.floor(ms / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  const milli = ms % 1000
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(milli).padStart(3, "0")}`
}

function formatDeltaSeconds(deltaSec: number) {
  if (!Number.isFinite(deltaSec)) return "—"
  const sign = deltaSec >= 0 ? "+" : "-"
  return `${sign}${Math.abs(deltaSec).toFixed(3)}s`
}

function formatSectorTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "—"
  return `${seconds.toFixed(3)}s`
}

// Simple YAML parser for sector boundaries
function parseSectorBoundaries(yaml: string): SectorBoundary[] {
  const sectors: SectorBoundary[] = []
  const lines = yaml.split("\n")
  let inSectors = false
  let indentLevel = 0
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.includes("Sectors:")) {
      inSectors = true
      indentLevel = line.match(/^(\s*)/)?.[1]?.length ?? 0
      continue
    }
    
    if (inSectors) {
      const currentIndent = line.match(/^(\s*)/)?.[1]?.length ?? 0
      // Exit if we hit a line at the same or less indent that's not part of the sectors list
      // (i.e., it's a new top-level key like "CarSetup:")
      if (currentIndent <= indentLevel && line.trim() && !line.includes("-") && !line.includes("SectorNum") && !line.includes("SectorStartPct")) {
        break // Exited sectors section
      }
      
      // Look for SectorNum in the current line or the previous line (for list item format)
      if (line.includes("SectorNum:")) {
        const sectorNumMatch = line.match(/SectorNum:\s*(\d+)/)
        // Look for SectorStartPct in the next line (indented)
        let startPctMatch = lines[i + 1]?.match(/SectorStartPct:\s*([\d.]+)/)
        // Also check current line in case it's on the same line
        if (!startPctMatch) {
          startPctMatch = line.match(/SectorStartPct:\s*([\d.]+)/)
        }
        
        if (sectorNumMatch && startPctMatch) {
          sectors.push({
            sectorNum: parseInt(sectorNumMatch[1], 10),
            startPct: parseFloat(startPctMatch[1]),
          })
        }
      }
    }
  }
  
  // Sort by sector number and ensure we have sector 0 (start/finish)
  sectors.sort((a, b) => a.sectorNum - b.sectorNum)
  if (sectors.length === 0 || sectors[0]!.sectorNum !== 0) {
    sectors.unshift({ sectorNum: 0, startPct: 0 })
  }
  
  // Ensure we have a final sector at 100% if the last sector is not at 100%
  const lastSector = sectors[sectors.length - 1]
  if (lastSector && lastSector.startPct < 100) {
    // Add a final sector boundary at 100% with the next sector number
    const maxSectorNum = Math.max(...sectors.map(s => s.sectorNum))
    sectors.push({ sectorNum: maxSectorNum + 1, startPct: 100 })
  }
  
  return sectors
}

// Calculate sector times for a lap
function calculateSectorTimes(
  lapData: IbtLapData,
  sectorBoundaries: SectorBoundary[],
): SectorTimes[] {
  const sectorTimes: SectorTimes[] = []
  
  if (sectorBoundaries.length === 0) return sectorTimes
  
  for (let i = 0; i < sectorBoundaries.length; i++) {
    const boundary = sectorBoundaries[i]!
    const sectorDistKm = (boundary.startPct * lapData.distanceKm) / 100
    
    // Find the time at this distance
    const timeAtDist = interpolateValue(
      lapData.byDist,
      sectorDistKm,
      "distanceKm",
      (p) => p.timeSec,
    )
    
    if (timeAtDist != null) {
      sectorTimes.push({
        sectorNum: boundary.sectorNum,
        timeSec: timeAtDist,
        distanceKm: sectorDistKm,
      })
    }
  }
  
  // Calculate actual sector times (time difference between boundaries)
  const actualSectorTimes: SectorTimes[] = []
  for (let i = 0; i < sectorTimes.length; i++) {
    const prev = i > 0 ? sectorTimes[i - 1] : { timeSec: 0, distanceKm: 0 }
    const curr = sectorTimes[i]!
    actualSectorTimes.push({
      sectorNum: curr.sectorNum,
      timeSec: curr.timeSec - prev.timeSec,
      distanceKm: curr.distanceKm - prev.distanceKm,
    })
  }
  
  return actualSectorTimes
}

function binarySearchLowerBound(points: IbtLapPoint[], x: number, xKey: "distanceKm" | "timeSec") {
  // returns greatest index i such that points[i][xKey] <= x
  let lo = 0
  let hi = points.length - 1
  let ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const v = points[mid][xKey]
    if (v <= x) {
      ans = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return ans
}

function interpolateValue(
  points: IbtLapPoint[],
  x: number,
  xKey: "distanceKm" | "timeSec",
  getY: (p: IbtLapPoint) => number | null,
): number | null {
  if (points.length === 0) return null
  const xMin = points[0][xKey]
  const xMax = points[points.length - 1][xKey]
  if (x < xMin || x > xMax) return null

  const i = binarySearchLowerBound(points, x, xKey)
  if (i < 0) return null
  if (i >= points.length - 1) return getY(points[points.length - 1])

  const p0 = points[i]
  const p1 = points[i + 1]
  const x0 = p0[xKey]
  const x1 = p1[xKey]
  const y0 = getY(p0)
  const y1 = getY(p1)
  if (y0 == null || y1 == null) return null
  if (x1 === x0) return y0

  const t = (x - x0) / (x1 - x0)
  return y0 + (y1 - y0) * t
}

// Calculate distance between two GPS coordinates using Haversine formula
// Returns distance in meters
function gpsDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000 // Earth's radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

// Interpolate GPS coordinates at a given distance
function interpolateGps(
  points: IbtLapPoint[],
  distanceKm: number,
): { lat: number; lon: number } | null {
  if (points.length === 0) return null
  
  const lat = interpolateValue(points, distanceKm, "distanceKm", (p) => p.lat)
  const lon = interpolateValue(points, distanceKm, "distanceKm", (p) => p.lon)
  
  if (lat == null || lon == null) return null
  return { lat, lon }
}

// Calculate signed perpendicular distance from a point to a line segment
// Returns positive if point is to the left of the line (when looking in direction of travel), negative if to the right
function perpendicularDistanceMeters(
  pointLat: number,
  pointLon: number,
  lineStartLat: number,
  lineStartLon: number,
  lineEndLat: number,
  lineEndLon: number,
): number {
  // Convert to local coordinates (meters) for simpler calculation
  // Use a simple approximation: 1 degree lat ≈ 111km, 1 degree lon ≈ 111km * cos(lat)
  const latToMeters = 111000
  const lonToMeters = 111000 * Math.cos((lineStartLat * Math.PI) / 180)
  
  const px = (pointLon - lineStartLon) * lonToMeters
  const py = (pointLat - lineStartLat) * latToMeters
  const dx = (lineEndLon - lineStartLon) * lonToMeters
  const dy = (lineEndLat - lineStartLat) * latToMeters
  
  // Calculate perpendicular distance using cross product
  // The sign indicates which side of the line the point is on
  const crossProduct = dx * py - dy * px
  const lineLength = Math.sqrt(dx * dx + dy * dy)
  
  if (lineLength === 0) {
    // Line segment has zero length, just return straight-line distance
    return Math.sqrt(px * px + py * py)
  }
  
  // Perpendicular distance (signed)
  return crossProduct / lineLength
}

export function LapAnalysis() {
  // Create cursor store once - bypasses React state for performance
  const cursorStoreRef = useRef<CursorStore | null>(null)
  if (!cursorStoreRef.current) {
    cursorStoreRef.current = createCursorStore()
  }
  const cursorStore = cursorStoreRef.current
  
  const [ibtLapDataByLap, setIbtLapDataByLap] = useState<Record<number, IbtLapData> | null>(null)
  const [ibtLaps, setIbtLaps] = useState<number[]>([])
  const [selectedLaps, setSelectedLaps] = useState<number[]>([])
  const [lapColors, setLapColors] = useState<Record<number, string>>({})
  const [ibtSourceLabel, setIbtSourceLabel] = useState<string | null>(null)
  const [ibtLoading, setIbtLoading] = useState(false)
  const [ibtProgress, setIbtProgress] = useState<{ processedRecords: number; totalRecords: number } | null>(null)
  const [ibtError, setIbtError] = useState<string | null>(null)
  const [sectorBoundaries, setSectorBoundaries] = useState<SectorBoundary[]>([])
  
  // Zoom state (shared across all charts)
  const [zoomXMin, setZoomXMin] = useState<number | null>(null)
  const [zoomXMax, setZoomXMax] = useState<number | null>(null)

  const handleZoomChange = useCallback((xMin: number | null, xMax: number | null) => {
    setZoomXMin(xMin)
    setZoomXMax(xMax)
  }, [])

  const handleResetZoom = useCallback(() => {
    setZoomXMin(null)
    setZoomXMax(null)
  }, [])

  const toggleLap = useCallback((lap: number) => {
    setSelectedLaps((prev) => {
      if (prev.includes(lap)) return prev.filter((x) => x !== lap)
      return [...prev, lap]
    })
    setLapColors((prev) => {
      if (prev[lap]) return prev
      const used = new Set(Object.values(prev))
      const nextColor =
        LAP_COLOR_PALETTE.find((c) => !used.has(c)) ??
        LAP_COLOR_PALETTE[Object.keys(prev).length % LAP_COLOR_PALETTE.length]
      return { ...prev, [lap]: nextColor }
    })
    cursorStore.setDistance(null)
  }, [cursorStore])

  const clearSelectedLaps = useCallback(() => {
    setSelectedLaps([])
    cursorStore.setDistance(null)
  }, [cursorStore])

  const loadIbt = useCallback(
    async (blob: Blob, label: string) => {
      setIbtLoading(true)
      setIbtError(null)
      setIbtProgress({ processedRecords: 0, totalRecords: 1 })
      try {
        const header = await readIbtHeader(blob)
        const vars = await readIbtVarHeaders(blob, header)

        // Parse session YAML to extract sector boundaries
        const sessionYaml = await readIbtSessionInfoYaml(blob, header)
        const sectors = parseSectorBoundaries(sessionYaml)
        setSectorBoundaries(sectors)

        const recordCount =
          header.diskSubHeader?.recordCount ??
          Math.floor((blob.size - (header.sessionInfoOffset + header.sessionInfoLen)) / header.bufLen)

        // Aim for ~10k sparse samples across the whole file (enough to build a clean lap trace).
        const targetPoints = 10_000
        const stride = Math.max(1, Math.floor(recordCount / targetPoints))

        const rows = await readIbtSamples(blob, header, vars, {
          varNames: [
            "SessionTime",
            "Lap",
            "LapDist",
            "Speed",
            "RPM",
            "Gear",
            "Throttle",
            "Brake",
            "SteeringWheelAngle",
            "Lat",
            "Lon",
          ],
          stride,
          onProgress: (p) => setIbtProgress(p),
        })

        const num = (v: IbtValue): number | null =>
          typeof v === "number" && Number.isFinite(v) ? v : null

        const byLap: Record<number, Array<Record<string, IbtValue>>> = {}
        for (const r of rows) {
          const lap = num(r["Lap"])
          if (lap == null) continue
          byLap[lap] ??= []
          byLap[lap].push(r)
        }

        const lapNums = Object.keys(byLap)
          .map((x) => Number(x))
          .filter((x) => Number.isFinite(x))
          .sort((a, b) => a - b)

        const lapDataByLap: Record<number, IbtLapData> = {}
        for (const lap of lapNums) {
          const lapRows = byLap[lap]
          const raw: Array<{
            sessionTime: number
            lapDistKm: number
            speedKmh: number | null
            throttlePct: number | null
            brakePct: number | null
            gear: number | null
            rpm: number | null
            steeringDeg: number | null
            lat: number | null
            lon: number | null
          }> = []

          for (const r of lapRows) {
            const sessionTime = num(r["SessionTime"])
            const lapDistM = num(r["LapDist"])
            if (sessionTime == null || lapDistM == null) continue

            const speedMs = num(r["Speed"])
            const rpm = num(r["RPM"])
            const gear = num(r["Gear"])
            const throttle = num(r["Throttle"])
            const brake = num(r["Brake"])
            const steerRad = num(r["SteeringWheelAngle"])
            const lat = typeof r["Lat"] === "number" && Number.isFinite(r["Lat"]) ? r["Lat"] : null
            const lon = typeof r["Lon"] === "number" && Number.isFinite(r["Lon"]) ? r["Lon"] : null

            raw.push({
              sessionTime,
              lapDistKm: lapDistM / 1000,
              speedKmh: speedMs != null ? speedMs * 3.6 : null,
              throttlePct: throttle != null ? throttle * 100 : null,
              brakePct: brake != null ? brake * 100 : null,
              gear: gear != null ? gear : null,
              rpm: rpm != null ? rpm : null,
              steeringDeg: steerRad != null ? (steerRad * 180) / Math.PI : null,
              lat,
              lon,
            })
          }

          if (raw.length < 20) continue

          const minTime = Math.min(...raw.map((p) => p.sessionTime))
          const minDist = Math.min(...raw.map((p) => p.lapDistKm))

          const points: IbtLapPoint[] = raw
            .map((p) => ({
              distanceKm: p.lapDistKm - minDist,
              timeSec: p.sessionTime - minTime,
              speedKmh: p.speedKmh,
              throttlePct: p.throttlePct,
              brakePct: p.brakePct,
              gear: p.gear,
              rpm: p.rpm,
              steeringDeg: p.steeringDeg,
              lat: p.lat,
              lon: p.lon,
            }))
            .filter((p) => Number.isFinite(p.distanceKm) && p.distanceKm >= 0 && Number.isFinite(p.timeSec) && p.timeSec >= 0)

          if (points.length < 20) continue

          const byDist = [...points].sort((a, b) => a.distanceKm - b.distanceKm)
          const byTime = [...points].sort((a, b) => a.timeSec - b.timeSec)
          const lapTimeSec = Math.max(...byTime.map((p) => p.timeSec))
          const distanceKm = Math.max(...byDist.map((p) => p.distanceKm))

          // Calculate sector times
          const sectorTimes = calculateSectorTimes(
            { byDist, byTime, lapTimeSec, distanceKm, points: points.length, sectorTimes: [] },
            sectors,
          )

          lapDataByLap[lap] = {
            byDist,
            byTime,
            lapTimeSec,
            distanceKm,
            points: points.length,
            sectorTimes,
          }
        }

        const allLaps = Object.keys(lapDataByLap)
          .map((x) => Number(x))
          .filter((x) => Number.isFinite(x))
          .sort((a, b) => a - b)

        if (allLaps.length === 0) {
          throw new Error("Could not find usable laps in this .ibt (missing SessionTime/Lap/LapDist?)")
        }

        // Find the maximum distance across all laps (approximates track length)
        const maxDist = Math.max(...allLaps.map((lap) => lapDataByLap[lap]!.distanceKm))
        
        // Filter to only completed laps:
        // - Must be at least 90% of the maximum distance (indicates full lap)
        // - Must have a valid lap time (> 0)
        // - Exclude lap 0 (typically incomplete)
        const completionThreshold = maxDist * 0.9
        const completedLaps = allLaps.filter((lap) => {
          const data = lapDataByLap[lap]!
          return (
            lap !== 0 &&
            data.distanceKm >= completionThreshold &&
            data.lapTimeSec > 0 &&
            Number.isFinite(data.lapTimeSec)
          )
        })

        if (completedLaps.length === 0) {
          throw new Error("No completed laps found in this .ibt file. All laps appear to be incomplete.")
        }

        // Choose a default reference lap: fastest completed lap
        const bestLap = completedLaps.reduce((best, lap) => {
          const a = lapDataByLap[best]!
          const b = lapDataByLap[lap]!
          return b.lapTimeSec < a.lapTimeSec ? lap : best
        }, completedLaps[0]!)

        // Only keep completed laps in the data
        const completedLapData: Record<number, IbtLapData> = {}
        for (const lap of completedLaps) {
          completedLapData[lap] = lapDataByLap[lap]!
        }

        setIbtLapDataByLap(completedLapData)
        setIbtLaps(completedLaps)
        setSelectedLaps([bestLap])
        setLapColors({ [bestLap]: LAP_COLOR_PALETTE[0] })
        setIbtSourceLabel(`${label} (stride ${stride}, tickRate ${header.tickRate})`)
        cursorStore.setDistance(null)
        setZoomXMin(null)
        setZoomXMax(null)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        setIbtError(msg)
      } finally {
        setIbtLoading(false)
        setIbtProgress(null)
      }
    },
    [],
  )

  const loadSample = useCallback(async () => {
    try {
      const samplePath = encodeURI(
        "/telemtry/acuransxevo22gt3_virginia 2022 full 2025-12-20 22-57-02.ibt",
      )
      const res = await fetch(samplePath)
      if (!res.ok) throw new Error(`Failed to fetch sample .ibt: ${res.status} ${res.statusText}`)
      const blob = await res.blob()
      await loadIbt(blob, "Sample .ibt")
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setIbtError(msg)
    }
  }, [loadIbt])

  // Compute original X max (full track distance)
  const originalXMax = useMemo(() => {
    if (!ibtLapDataByLap || selectedLaps.length === 0) return null
    const refLap = selectedLaps[0]
    const refData = ibtLapDataByLap[refLap]
    if (!refData) return null
    return refData.distanceKm
  }, [ibtLapDataByLap, selectedLaps])

  // Compute unified telemetry data from selected laps (downsampled for performance)
  const telemetryData = useMemo(() => {
    if (!ibtLapDataByLap || selectedLaps.length === 0) {
      return []
    }

    const refLap = selectedLaps[0]
    const refData = ibtLapDataByLap[refLap]
    if (!refData) return []

    // Downsample to max ~500 points for chart performance
    const MAX_CHART_POINTS = 500
    const allDistances = refData.byDist.map((p) => p.distanceKm)
    const stride = Math.max(1, Math.ceil(allDistances.length / MAX_CHART_POINTS))
    const distances = allDistances.filter((_, i) => i % stride === 0)

    // For each distance point, interpolate values from all selected laps
    const result: any[] = []
    for (const dist of distances) {
      const point: any = { distance: dist }

      // Reference lap values (always present)
      const refPoint = refData.byDist.find((p) => Math.abs(p.distanceKm - dist) < 0.001) ?? refData.byDist[0]
      point[`speed_${refLap}`] = refPoint.speedKmh
      point[`throttle_${refLap}`] = refPoint.throttlePct
      point[`brake_${refLap}`] = refPoint.brakePct
      point[`gear_${refLap}`] = refPoint.gear
      point[`rpm_${refLap}`] = refPoint.rpm
      point[`steering_${refLap}`] = refPoint.steeringDeg
      point[`lineDist_${refLap}`] = 0 // Reference lap is center line
      point[`timeDelta_${refLap}`] = 0 // Reference lap has zero delta

      // Other selected laps
      for (let i = 1; i < selectedLaps.length; i++) {
        const lap = selectedLaps[i]!
        const lapData = ibtLapDataByLap[lap]
        if (!lapData) continue

        // Interpolate at this distance
        const speed = interpolateValue(lapData.byDist, dist, "distanceKm", (p) => p.speedKmh)
        const throttle = interpolateValue(lapData.byDist, dist, "distanceKm", (p) => p.throttlePct)
        const brake = interpolateValue(lapData.byDist, dist, "distanceKm", (p) => p.brakePct)
        const gear = interpolateValue(lapData.byDist, dist, "distanceKm", (p) => p.gear)
        const rpm = interpolateValue(lapData.byDist, dist, "distanceKm", (p) => p.rpm)
        const steering = interpolateValue(lapData.byDist, dist, "distanceKm", (p) => p.steeringDeg)

        point[`speed_${lap}`] = speed
        point[`throttle_${lap}`] = throttle
        point[`brake_${lap}`] = brake
        point[`gear_${lap}`] = gear
        point[`rpm_${lap}`] = rpm
        point[`steering_${lap}`] = steering

        // Line distance: difference in lateral position (simplified as distance offset)
        // Time delta: interpolate time at this distance, compare to reference
        const lapTime = interpolateValue(lapData.byDist, dist, "distanceKm", (p) => p.timeSec)
        const refTime = interpolateValue(refData.byDist, dist, "distanceKm", (p) => p.timeSec)
        if (lapTime != null && refTime != null) {
          point[`timeDelta_${lap}`] = lapTime - refTime
        } else {
          point[`timeDelta_${lap}`] = null
        }

        // Line distance: perpendicular distance in meters from comparison lap to reference lap racing line
        // at the same distance through the lap (using GPS coordinates)
        // Positive = left of reference line, Negative = right of reference line
        const refGps = interpolateGps(refData.byDist, dist)
        const lapGps = interpolateGps(lapData.byDist, dist)
        
        if (refGps && lapGps) {
          // Get a point slightly ahead on the reference lap to determine direction
          const lookAheadDist = Math.min(dist + 0.01, refData.distanceKm) // 10 meters ahead
          const refGpsAhead = interpolateGps(refData.byDist, lookAheadDist)
          
          if (refGpsAhead) {
            // Calculate perpendicular distance from comparison lap point to reference lap line segment
            const perpDist = perpendicularDistanceMeters(
              lapGps.lat,
              lapGps.lon,
              refGps.lat,
              refGps.lon,
              refGpsAhead.lat,
              refGpsAhead.lon
            )
            point[`lineDist_${lap}`] = perpDist
          } else {
            // Fallback to straight-line distance if we can't determine direction
            const distanceMeters = gpsDistanceMeters(refGps.lat, refGps.lon, lapGps.lat, lapGps.lon)
            point[`lineDist_${lap}`] = distanceMeters
          }
        } else {
          point[`lineDist_${lap}`] = null
        }
      }

      result.push(point)
    }

    return result
  }, [ibtLapDataByLap, selectedLaps])

  // Create series arrays for charts
  const speedSeries = useMemo<ChartSeries[]>(() => {
    return selectedLaps.map((lap) => ({
      key: `speed_${lap}`,
      label: `Lap ${lap}`,
      color: lapColors[lap] ?? LAP_COLOR_PALETTE[0],
    }))
  }, [selectedLaps, lapColors])

  const throttleSeries = useMemo<ChartSeries[]>(() => {
    return selectedLaps.map((lap) => ({
      key: `throttle_${lap}`,
      label: `Lap ${lap}`,
      color: lapColors[lap] ?? LAP_COLOR_PALETTE[0],
    }))
  }, [selectedLaps, lapColors])

  const brakeSeries = useMemo<ChartSeries[]>(() => {
    return selectedLaps.map((lap) => ({
      key: `brake_${lap}`,
      label: `Lap ${lap}`,
      color: lapColors[lap] ?? LAP_COLOR_PALETTE[0],
    }))
  }, [selectedLaps, lapColors])

  const gearSeries = useMemo<ChartSeries[]>(() => {
    return selectedLaps.map((lap) => ({
      key: `gear_${lap}`,
      label: `Lap ${lap}`,
      color: lapColors[lap] ?? LAP_COLOR_PALETTE[0],
    }))
  }, [selectedLaps, lapColors])

  const rpmSeries = useMemo<ChartSeries[]>(() => {
    return selectedLaps.map((lap) => ({
      key: `rpm_${lap}`,
      label: `Lap ${lap}`,
      color: lapColors[lap] ?? LAP_COLOR_PALETTE[0],
    }))
  }, [selectedLaps, lapColors])

  const steeringSeries = useMemo<ChartSeries[]>(() => {
    return selectedLaps.map((lap) => ({
      key: `steering_${lap}`,
      label: `Lap ${lap}`,
      color: lapColors[lap] ?? LAP_COLOR_PALETTE[0],
    }))
  }, [selectedLaps, lapColors])

  const lineDistSeries = useMemo<ChartSeries[]>(() => {
    return selectedLaps.slice(1).map((lap) => ({
      key: `lineDist_${lap}`,
      label: `Lap ${lap}`,
      color: lapColors[lap] ?? LAP_COLOR_PALETTE[0],
    }))
  }, [selectedLaps, lapColors])

  const timeDeltaSeries = useMemo<ChartSeries[]>(() => {
    return selectedLaps.slice(1).map((lap) => ({
      key: `timeDelta_${lap}`,
      label: `Lap ${lap}`,
      color: lapColors[lap] ?? LAP_COLOR_PALETTE[0],
    }))
  }, [selectedLaps, lapColors])

  // Memoized formatValue functions to prevent SyncedChart re-renders
  const formatDecimal1 = useCallback((v: number) => v.toFixed(1), [])
  const formatDecimal0 = useCallback((v: number) => v.toFixed(0), [])

  return (
    <CursorStoreContext.Provider value={cursorStore}>
    <div className="flex h-screen flex-col bg-background text-foreground">
      {/* Header */}
      <header className="flex h-12 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded bg-primary text-primary-foreground text-xs font-bold">
              ⌘
            </div>
            <span className="text-sm font-semibold">CTRL ALT ELITE</span>
            <span className="text-xs text-muted-foreground">alpha</span>
          </div>
          <nav className="flex items-center gap-1">
            {["Overview", "Analyze", "Laps", "Setups", "Data packs", "Teams", "Streams"].map(
              (item) => (
                <Button
                  key={item}
                  variant="ghost"
                  size="sm"
                  className={item === "Analyze" ? "bg-muted" : ""}
                >
                  {item}
                  {item === "Laps" && <ChevronDown className="ml-1 h-3 w-3" />}
                </Button>
              )
            )}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon-sm">
            <Bell className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon-sm">
            <HelpCircle className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2 rounded-full bg-muted px-2 py-1">
            <div className="h-6 w-6 rounded-full bg-primary" />
            <span className="text-xs">Sergio</span>
            <ChevronDown className="h-3 w-3" />
          </div>
        </div>
      </header>

      {/* Sub header */}
      <div className="flex h-10 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            Navigate
          </Button>
          <Button variant="ghost" size="icon-sm">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Select defaultValue="driving-style" items={[
            { label: "Driving style", value: "driving-style" },
            { label: "Performance", value: "performance" },
            { label: "Consistency", value: "consistency" },
          ]}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="driving-style">Driving style</SelectItem>
              <SelectItem value="performance">Performance</SelectItem>
              <SelectItem value="consistency">Consistency</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="ghost" size="icon-sm">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="text-sm font-medium">Untitled lap analysis</div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon-sm">
            <MessageSquare className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm">
            Configure
          </Button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar */}
        <aside className="flex w-64 flex-col border-r border-border">
          {/* Telemetry source */}
          <div className="border-b border-border p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Telemetry (.ibt)</span>
              {ibtSourceLabel && <span className="text-[10px] text-muted-foreground truncate">{ibtSourceLabel}</span>}
            </div>

            <Input
              type="file"
              accept=".ibt"
              disabled={ibtLoading}
              onChange={(e) => {
                const f = e.currentTarget.files?.[0]
                if (!f) return
                void loadIbt(f, f.name)
              }}
            />

            <div className="mt-2">
              <Button variant="outline" size="xs" className="w-full" disabled={ibtLoading} onClick={() => void loadSample()}>
                Load sample
              </Button>
            </div>

            {ibtLaps.length > 0 && (
              <div className="mt-2 space-y-1">
                <div className="text-[10px] text-muted-foreground mb-1">Select laps to compare:</div>
                {ibtLaps.map((lap) => {
                  const isSelected = selectedLaps.includes(lap)
                  const color = lapColors[lap] ?? LAP_COLOR_PALETTE[0]
                  const lapData = ibtLapDataByLap?.[lap]
                  const lapTime = lapData ? formatLapTime(lapData.lapTimeSec) : null
                  return (
                    <div
                      key={lap}
                      className={`flex items-center gap-2 rounded px-2 py-1 text-xs cursor-pointer hover:bg-muted/50 ${
                        isSelected ? "bg-muted/50" : ""
                      }`}
                      onClick={() => toggleLap(lap)}
                    >
                      <div className="h-3 w-3 rounded-sm" style={{ backgroundColor: color }} />
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="font-medium">Lap {lap}</span>
                        {lapTime && (
                          <span className="text-[10px] text-muted-foreground">{lapTime}</span>
                        )}
                      </div>
                      {isSelected && selectedLaps[0] === lap && (
                        <span className="text-[10px] text-muted-foreground ml-auto whitespace-nowrap">(reference)</span>
                      )}
                    </div>
                  )
                })}
                {selectedLaps.length > 0 && (
                  <Button variant="ghost" size="xs" className="w-full mt-2" onClick={clearSelectedLaps}>
                    Clear selection
                  </Button>
                )}
              </div>
            )}

            {ibtProgress && (
              <div className="mt-2 text-[10px] text-muted-foreground">
                Parsing… {Math.floor((ibtProgress.processedRecords / ibtProgress.totalRecords) * 100)}%
              </div>
            )}
            {ibtError && <div className="mt-2 text-[10px] text-red-400">{ibtError}</div>}
          </div>

          {/* Laps section */}
          <div className="p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Laps:</span>
              <Button variant="ghost" size="icon-xs">
                <Settings className="h-3 w-3" />
              </Button>
            </div>
            <div className="space-y-1">
              {selectedLaps.length > 0 && ibtLapDataByLap ? (
                selectedLaps.map((lap) => {
                  const lapData = ibtLapDataByLap[lap]
                  const color = lapColors[lap] ?? LAP_COLOR_PALETTE[0]
                  const lapTime = lapData ? formatLapTime(lapData.lapTimeSec) : `Lap ${lap}`
                  const isRef = selectedLaps[0] === lap
                  const refLap = selectedLaps[0]
                  const refData = ibtLapDataByLap[refLap]
                  const delta = !isRef && refData && lapData
                    ? formatDeltaSeconds(lapData.lapTimeSec - refData.lapTimeSec)
                    : null
                  return (
                    <div
                      key={lap}
                      className="flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-muted/50"
                    >
                      <div className="h-3 w-3 rounded-sm" style={{ backgroundColor: color }} />
                      <span className="font-medium">{lapTime}</span>
                      {delta && <span className="text-muted-foreground">({delta})</span>}
                      {isRef && <span className="text-muted-foreground text-[10px]">(reference)</span>}
                    </div>
                  )
                })
              ) : (
                <div className="text-xs text-muted-foreground px-2 py-1">
                  No laps loaded. Load a .ibt file to begin analysis.
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Gaps section */}
          <div className="p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Gaps:</span>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon-xs">
                  <ArrowUpDown className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="icon-xs">
                  <RefreshCw className="h-3 w-3" />
                </Button>
              </div>
            </div>
            
            {/* Lap indicators */}
            {selectedLaps.length > 1 && ibtLapDataByLap && (
              <div className="mb-2 flex items-center gap-4">
                {selectedLaps.map((lap, idx) => {
                  const color = lapColors[lap] ?? LAP_COLOR_PALETTE[0]
                  return (
                    <div key={lap} className="flex items-center gap-1">
                      <div className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} />
                      <span className="text-[10px]">{idx + 1}</span>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Sector times table */}
            <div className="space-y-1 text-xs" style={{ "--lap-count": selectedLaps.length } as React.CSSProperties}>
              {selectedLaps.length > 0 && ibtLapDataByLap && sectorBoundaries.length > 0 ? (
                <div className="space-y-2">
                  {/* Header */}
                  <div className="grid gap-1 text-[10px] text-muted-foreground border-b border-border pb-1" style={{ gridTemplateColumns: `60px repeat(${selectedLaps.length}, 1fr)` }}>
                    <div>Sector</div>
                    {selectedLaps.map((lap) => (
                      <div key={lap} className="flex items-center gap-1 justify-center">
                        <div className="h-2 w-2 rounded-sm" style={{ backgroundColor: lapColors[lap] ?? LAP_COLOR_PALETTE[0] }} />
                        <span>Lap {lap}</span>
                      </div>
                    ))}
                  </div>
                  {/* Sector rows */}
                  {sectorBoundaries.slice(1).map((sector) => {
                    const sectorNum = sector.sectorNum
                    return (
                      <div key={sectorNum} className="grid gap-1 text-[10px]" style={{ gridTemplateColumns: `60px repeat(${selectedLaps.length}, 1fr)` }}>
                        <div className="font-medium">S{sectorNum}</div>
                        {selectedLaps.map((lap) => {
                          const lapData = ibtLapDataByLap[lap]
                          const sectorTime = lapData?.sectorTimes.find((st) => st.sectorNum === sectorNum)
                          const refLap = selectedLaps[0]
                          const refData = ibtLapDataByLap[refLap]
                          const refSectorTime = refData?.sectorTimes.find((st) => st.sectorNum === sectorNum)
                          const delta = sectorTime && refSectorTime ? sectorTime.timeSec - refSectorTime.timeSec : null
                          const isRef = lap === refLap
                          return (
                            <div key={lap} className={`text-center ${isRef ? "font-medium" : ""}`}>
                              {sectorTime ? (
                                <div>
                                  <div>{formatSectorTime(sectorTime.timeSec)}</div>
                                  {!isRef && delta != null && (
                                    <div className={`text-[9px] ${delta >= 0 ? "text-red-400" : "text-green-400"}`}>
                                      {delta >= 0 ? "+" : ""}{delta.toFixed(3)}s
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="text-muted-foreground">—</div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              ) : selectedLaps.length === 0 ? (
                <div className="text-muted-foreground text-[10px]">Select laps to compare sector times</div>
              ) : sectorBoundaries.length === 0 ? (
                <div className="text-muted-foreground text-[10px]">No sector data available</div>
              ) : null}
            </div>
          </div>
        </aside>

        {/* Center content */}
        <div className="flex flex-1 flex-col">
          <div className="flex flex-1">
            {/* Track and main charts */}
            <div className="flex flex-1 flex-col min-h-0">
              {/* Track map and warning */}
              <div className="relative flex-shrink-0 h-[400px] border-b border-border p-4 overflow-hidden">
                <div className="absolute left-2 top-2 flex flex-col gap-1 z-10">
                  <Button variant="outline" size="icon-xs" className="h-5 w-5">
                    <span className="text-[8px]">≡</span>
                  </Button>
                  {(zoomXMin != null || zoomXMax != null) && (
                    <Button 
                      variant="outline" 
                      size="xs" 
                      onClick={handleResetZoom} 
                      className="h-5 text-[9px] px-1.5"
                      title="Reset chart zoom (or double-click any chart)"
                    >
                      <RefreshCw className="h-3 w-3 mr-1" />
                      Reset
                    </Button>
                  )}
                </div>
                <div className="absolute right-4 top-4 z-10">
                  <div className="flex items-center gap-2 rounded bg-yellow-500/20 px-2 py-1 text-yellow-500">
                    <AlertTriangle className="h-4 w-4" />
                  </div>
                </div>
                <div className="w-full h-full overflow-hidden">
                  <TrackMap 
                    lapDataByLap={ibtLapDataByLap} 
                    selectedLaps={selectedLaps} 
                    lapColors={lapColors}
                  />
                </div>
              </div>

              {/* Line distance chart */}
              <div className="h-36 border-b border-border p-2 overflow-hidden">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-muted-foreground">Line distance</span>
                  <div className="flex items-center gap-2">
                    {(zoomXMin != null || zoomXMax != null) && (
                      <Button variant="ghost" size="xs" onClick={handleResetZoom} className="h-5 text-[10px]">
                        Reset zoom
                      </Button>
                    )}
                    <CursorDistanceDisplay />
                  </div>
                </div>
                <div className="h-[calc(100%-16px)] min-h-0 min-w-0">
                  <SyncedChart
                    data={telemetryData}
                    series={lineDistSeries}
                    yDomain={[-15, 15]}
                    showYAxisRight={true}
                    margin={{ top: 5, right: 30, left: 30, bottom: 5 }}
                    unit=" m"
                    xMin={zoomXMin}
                    xMax={zoomXMax}
                    onZoomChange={handleZoomChange}
                    originalXMax={originalXMax ?? undefined}
                  />
                </div>
              </div>

              {/* Time delta chart */}
              <div className="h-36 border-b border-border p-2 overflow-hidden">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-muted-foreground">Time delta</span>
                  <CursorDistanceDisplay />
                </div>
                <div className="h-[calc(100%-16px)] min-h-0 min-w-0">
                  <SyncedChart
                    data={telemetryData}
                    series={timeDeltaSeries}
                    showYAxisRight={true}
                    margin={{ top: 5, right: 30, left: 30, bottom: 5 }}
                    unit=" sec"
                    xMin={zoomXMin}
                    xMax={zoomXMax}
                    onZoomChange={handleZoomChange}
                    originalXMax={originalXMax ?? undefined}
                  />
                </div>
              </div>

              {/* Legend */}
              <div className="flex items-center gap-6 border-b border-border p-3">
                {selectedLaps.map((lap) => {
                  const color = lapColors[lap] ?? LAP_COLOR_PALETTE[0]
                  const lapData = ibtLapDataByLap?.[lap]
                  const lapTime = lapData ? formatLapTime(lapData.lapTimeSec) : `Lap ${lap}`
                  const isRef = selectedLaps[0] === lap
                  return (
                    <div key={lap} className="flex items-center gap-2 text-xs">
                      <div className="h-3 w-3 rounded-sm" style={{ backgroundColor: color }} />
                      <span>{lapTime}</span>
                      {isRef && <span className="text-muted-foreground">(reference)</span>}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Right telemetry charts */}
            <div className="w-96 border-l border-border flex flex-col overflow-hidden">
              {telemetryData.length > 0 && selectedLaps.length > 0 && ibtLapDataByLap ? (
                <>
                  {/* Speed */}
                  <div className="relative flex-1 border-b border-border overflow-hidden min-h-0 min-w-0">
                    <SyncedChart
                      data={telemetryData}
                      series={speedSeries}
                      yDomain={[0, 250]}
                      unit=" km/h"
                      formatValue={formatDecimal1}
                      xMin={zoomXMin}
                      xMax={zoomXMax}
                      onZoomChange={handleZoomChange}
                      originalXMax={originalXMax ?? undefined}
                    />
                    <div className="absolute left-2 top-2 text-[10px] text-muted-foreground pointer-events-none">Speed</div>
                  </div>

                  {/* Throttle */}
                  <div className="relative flex-1 border-b border-border overflow-hidden min-h-0 min-w-0">
                <SyncedChart
                  data={telemetryData}
                  series={throttleSeries}
                  yDomain={[0, 100]}
                  unit="%"
                  formatValue={formatDecimal0}
                  xMin={zoomXMin}
                  xMax={zoomXMax}
                  onZoomChange={handleZoomChange}
                  originalXMax={originalXMax ?? undefined}
                />
                    <div className="absolute left-2 top-2 text-[10px] text-muted-foreground pointer-events-none">Throttle</div>
                  </div>

                  {/* Brake */}
                  <div className="relative flex-1 border-b border-border overflow-hidden min-h-0 min-w-0">
                    <SyncedChart
                      data={telemetryData}
                      series={brakeSeries}
                      yDomain={[0, 100]}
                      unit="%"
                      formatValue={formatDecimal0}
                      xMin={zoomXMin}
                      xMax={zoomXMax}
                      onZoomChange={handleZoomChange}
                      originalXMax={originalXMax ?? undefined}
                    />
                    <div className="absolute left-2 top-2 text-[10px] text-muted-foreground pointer-events-none">Brake</div>
                  </div>

                  {/* Gear */}
                  <div className="relative flex-1 border-b border-border overflow-hidden min-h-0 min-w-0">
                    <SyncedChart
                      data={telemetryData}
                      series={gearSeries}
                      yDomain={[0, 7]}
                      chartType="stepAfter"
                      formatValue={formatDecimal0}
                      xMin={zoomXMin}
                      xMax={zoomXMax}
                      onZoomChange={handleZoomChange}
                      originalXMax={originalXMax ?? undefined}
                    />
                    <div className="absolute left-2 top-2 text-[10px] text-muted-foreground pointer-events-none">Gear</div>
                  </div>

                  {/* RPM */}
                  <div className="relative flex-1 border-b border-border overflow-hidden min-h-0 min-w-0">
                    <SyncedChart
                      data={telemetryData}
                      series={rpmSeries}
                      yDomain={[2000, 8000]}
                      unit=" rpm"
                      formatValue={formatDecimal0}
                      xMin={zoomXMin}
                      xMax={zoomXMax}
                      onZoomChange={handleZoomChange}
                      originalXMax={originalXMax ?? undefined}
                    />
                    <div className="absolute left-2 top-2 text-[10px] text-muted-foreground pointer-events-none">RPM</div>
                  </div>

                  {/* Steering wheel angle */}
                  <div className="relative flex-1 border-b border-border overflow-hidden min-h-0 min-w-0">
                    <SyncedChart
                      data={telemetryData}
                      series={steeringSeries}
                      yDomain={[-200, 200]}
                      unit="°"
                      formatValue={formatDecimal1}
                      xMin={zoomXMin}
                      xMax={zoomXMax}
                      onZoomChange={handleZoomChange}
                      originalXMax={originalXMax ?? undefined}
                    />
                    <div className="absolute left-2 top-2 text-[10px] text-muted-foreground whitespace-nowrap pointer-events-none">Steering wheel angle</div>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                  Load a .ibt file to view telemetry charts
                </div>
              )}
            </div>
          </div>

          {/* Sector indicators */}
          {sectorBoundaries.length > 1 && (
            <div className="flex h-8 border-t border-border">
              {sectorBoundaries.slice(1).map((sector, index) => {
                const sectorNum = sector.sectorNum
                // Alternate background colors for visual distinction
                const isEven = index % 2 === 0
                const isLast = index === sectorBoundaries.length - 2
                return (
                  <div
                    key={sectorNum}
                    className={`flex flex-1 items-center justify-center ${
                      !isLast ? "border-r border-border" : ""
                    } ${isEven ? "bg-background" : "bg-muted/30"}`}
                  >
                    <span className="text-xs font-medium">S{sectorNum}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="flex h-8 items-center justify-between border-t border-border px-4">
        <Button variant="ghost" size="icon-xs">
          <MessageSquare className="h-3 w-3" />
        </Button>
        <div className="flex-1" />
      </footer>
    </div>
    </CursorStoreContext.Provider>
  )
}
