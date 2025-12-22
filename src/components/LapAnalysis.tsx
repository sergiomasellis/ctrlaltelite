import { useState, useCallback, useMemo, useRef } from "react"
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
import { readIbtHeader, readIbtSamples, readIbtVarHeaders, type IbtValue } from "@/lib/ibt"
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
  Tooltip,
} from "recharts"


// Track SVG path - realistic racing circuit
function TrackMap() {
  // Track outline path (scaled and centered)
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
  
  // Simplified racing line path that follows the track
  const racingLinePath = `
    M 55 125
    C 75 80, 100 55, 135 50
    C 170 45, 205 60, 235 80
    C 265 100, 285 125, 295 155
    C 305 185, 300 215, 280 240
    C 255 270, 215 285, 175 288
    C 135 290, 95 280, 65 258
    C 35 235, 22 195, 28 160
    C 34 125, 48 112, 55 125
    M 175 288
    C 198 276, 232 252, 265 218
    C 298 184, 328 145, 348 112
    C 368 79, 375 60, 368 48
    C 358 36, 335 32, 308 38
    C 280 44, 248 62, 235 80
  `

  return (
    <svg viewBox="0 0 400 320" className="w-full h-full max-h-[320px]">
      {/* Track background/outline */}
      <path 
        d={trackPath} 
        fill="none" 
        stroke="#2a2a2a" 
        strokeWidth="28" 
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Track surface */}
      <path 
        d={trackPath} 
        fill="none" 
        stroke="#1a1a1a" 
        strokeWidth="24" 
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Track edge markings */}
      <path 
        d={trackPath} 
        fill="none" 
        stroke="#333" 
        strokeWidth="26" 
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="4 8"
      />
      
      {/* Lap 1 racing line - Red */}
      <path 
        d={racingLinePath} 
        fill="none" 
        stroke="#e63946" 
        strokeWidth="2.5" 
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.9"
      />
      {/* Lap 2 racing line - Blue (slightly offset) */}
      <path 
        d={racingLinePath} 
        fill="none" 
        stroke="#457b9d" 
        strokeWidth="2.5" 
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.9"
        transform="translate(2, 1)"
      />
      {/* Lap 3 racing line - Purple (slightly offset other direction) */}
      <path 
        d={racingLinePath} 
        fill="none" 
        stroke="#9d4edd" 
        strokeWidth="2.5" 
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.9"
        transform="translate(-2, -1)"
      />
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

// Synced chart component
interface SyncedChartProps {
  data: any[]
  series: ChartSeries[]
  yDomain?: [number, number]
  cursorDistance: number | null
  onCursorMove: (distance: number | null) => void
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
  chartRef?: React.RefObject<HTMLDivElement | null>
}

function SyncedChart({
  data,
  series,
  yDomain,
  cursorDistance,
  onCursorMove,
  chartType = "monotone",
  showYAxisRight = true,
  margin = { top: 10, right: 40, left: 10, bottom: 10 },
  unit = "",
  formatValue = (v) => v.toFixed(1),
  xMin: zoomXMin = null,
  xMax: zoomXMax = null,
  onZoomChange,
  originalXMax,
  chartRef,
}: SyncedChartProps) {
  const [refAreaLeft, setRefAreaLeft] = useState<number | null>(null)
  const [refAreaRight, setRefAreaRight] = useState<number | null>(null)
  const [isSelecting, setIsSelecting] = useState(false)

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

  const handleMouseMove = useCallback(
    (state: any) => {
      if (isSelecting && state?.activeLabel != null) {
        const distance = parseFloat(state.activeLabel)
        if (Number.isFinite(distance)) {
          setRefAreaRight(distance)
        }
      } else if (state?.activePayload && state.activePayload.length > 0) {
        // Use activePayload to get the distance value directly from the data
        const distance = state.activePayload[0]?.payload?.distance
        if (distance !== undefined) {
          onCursorMove(distance)
        }
      }
    },
    [isSelecting, onCursorMove],
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
      onCursorMove(null)
    }
  }, [isSelecting, handleMouseUp, onCursorMove])

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
      onWheel={handleWheel}
      onTouchMove={handleTouchMove}
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
            axisLine={{ stroke: "#374151" }}
            orientation={showYAxisRight ? "right" : "left"}
            width={showYAxisRight ? 25 : 30}
          />

          {/* Sector highlighting (placeholder) */}
          <ReferenceLine x={1} stroke="#4a3535" strokeWidth={20} />
          <ReferenceLine x={3} stroke="#4a3535" strokeWidth={20} />

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

          {/* Cursor line - smooth position, rendered on top */}
          {cursorDistance !== null && cursorDistance >= xMin && cursorDistance <= xMax && (
            <ReferenceLine x={cursorDistance} stroke="#ffffff" strokeWidth={2} />
          )}

          {/* Tooltip with visible cursor line */}
          <Tooltip
            content={(props) => (
              <CustomTooltipContent
                {...props}
                series={visibleSeries}
                unit={unit}
                formatValue={formatValue}
              />
            )}
            cursor={{ stroke: "#ffffff", strokeWidth: 1, strokeOpacity: 0.5 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

type IbtLapPoint = {
  distanceKm: number
  timeSec: number
  speedKmh: number | null
  throttlePct: number | null
  brakePct: number | null
  gear: number | null
  rpm: number | null
  steeringDeg: number | null
}

type IbtLapData = {
  byDist: IbtLapPoint[]
  byTime: IbtLapPoint[]
  lapTimeSec: number
  distanceKm: number
  points: number
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

export function LapAnalysis() {
  // Shared cursor distance (smooth value, not snapped to data points)
  const [cursorDistance, setCursorDistance] = useState<number | null>(null)
  const [ibtLapDataByLap, setIbtLapDataByLap] = useState<Record<number, IbtLapData> | null>(null)
  const [ibtLaps, setIbtLaps] = useState<number[]>([])
  const [selectedLaps, setSelectedLaps] = useState<number[]>([])
  const [lapColors, setLapColors] = useState<Record<number, string>>({})
  const [ibtSourceLabel, setIbtSourceLabel] = useState<string | null>(null)
  const [ibtLoading, setIbtLoading] = useState(false)
  const [ibtProgress, setIbtProgress] = useState<{ processedRecords: number; totalRecords: number } | null>(null)
  const [ibtError, setIbtError] = useState<string | null>(null)
  
  // Zoom state (shared across all charts)
  const [zoomXMin, setZoomXMin] = useState<number | null>(null)
  const [zoomXMax, setZoomXMax] = useState<number | null>(null)
  const chartRef = useRef<HTMLDivElement>(null)

  const handleCursorMove = useCallback((distance: number | null) => {
    setCursorDistance(distance)
  }, [])

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
    setCursorDistance(null)
  }, [])

  const clearSelectedLaps = useCallback(() => {
    setSelectedLaps([])
    setCursorDistance(null)
  }, [])

  const loadIbt = useCallback(
    async (blob: Blob, label: string) => {
      setIbtLoading(true)
      setIbtError(null)
      setIbtProgress({ processedRecords: 0, totalRecords: 1 })
      try {
        const header = await readIbtHeader(blob)
        const vars = await readIbtVarHeaders(blob, header)

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

            raw.push({
              sessionTime,
              lapDistKm: lapDistM / 1000,
              speedKmh: speedMs != null ? speedMs * 3.6 : null,
              throttlePct: throttle != null ? throttle * 100 : null,
              brakePct: brake != null ? brake * 100 : null,
              gear: gear != null ? gear : null,
              rpm: rpm != null ? rpm : null,
              steeringDeg: steerRad != null ? (steerRad * 180) / Math.PI : null,
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
            }))
            .filter((p) => Number.isFinite(p.distanceKm) && p.distanceKm >= 0 && Number.isFinite(p.timeSec) && p.timeSec >= 0)

          if (points.length < 20) continue

          const byDist = [...points].sort((a, b) => a.distanceKm - b.distanceKm)
          const byTime = [...points].sort((a, b) => a.timeSec - b.timeSec)
          const lapTimeSec = Math.max(...byTime.map((p) => p.timeSec))
          const distanceKm = Math.max(...byDist.map((p) => p.distanceKm))

          lapDataByLap[lap] = {
            byDist,
            byTime,
            lapTimeSec,
            distanceKm,
            points: points.length,
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
        setCursorDistance(null)
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

  // Compute unified telemetry data from selected laps
  const telemetryData = useMemo(() => {
    if (!ibtLapDataByLap || selectedLaps.length === 0) {
      return []
    }

    const refLap = selectedLaps[0]
    const refData = ibtLapDataByLap[refLap]
    if (!refData) return []

    // Build distance grid from reference lap
    const distances = refData.byDist.map((p) => p.distanceKm)

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

        // Line distance: simplified as distance offset (positive = ahead, negative = behind)
        if (refTime != null) {
          const lapDistAtRefTime = interpolateValue(lapData.byTime, refTime, "timeSec", (p) => p.distanceKm)
          if (lapDistAtRefTime != null) {
            point[`lineDist_${lap}`] = lapDistAtRefTime - dist
          } else {
            point[`lineDist_${lap}`] = null
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

  return (
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

            {/* Sector times table with heatmap */}
            <div className="space-y-1 text-xs">
              {selectedLaps.length > 1 && ibtLapDataByLap ? (
                <div className="text-muted-foreground text-[10px]">Sector analysis coming soon</div>
              ) : (
                <div className="text-muted-foreground text-[10px]">Select multiple laps to compare gaps</div>
              )}
            </div>
          </div>
        </aside>

        {/* Center content */}
        <div className="flex flex-1 flex-col">
          <div className="flex flex-1">
            {/* Track and main charts */}
            <div className="flex flex-1 flex-col">
              {/* Track map and warning */}
              <div className="relative flex-1 border-b border-border p-4 overflow-hidden">
                <div className="absolute left-2 top-2 flex flex-col gap-1 z-10">
                  <Button variant="outline" size="icon-xs" className="h-5 w-5">
                    <span className="text-[8px]">≡</span>
                  </Button>
                </div>
                <div className="absolute right-4 top-4 z-10">
                  <div className="flex items-center gap-2 rounded bg-yellow-500/20 px-2 py-1 text-yellow-500">
                    <AlertTriangle className="h-4 w-4" />
                  </div>
                </div>
                <div className="mx-auto h-full max-w-md overflow-hidden">
                  <TrackMap />
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
                    {cursorDistance !== null && (
                      <span className="text-[10px] text-muted-foreground">{cursorDistance.toFixed(3)} km</span>
                    )}
                  </div>
                </div>
                <div className="h-[calc(100%-16px)] min-h-0 min-w-0">
                  <SyncedChart
                    data={telemetryData}
                    series={lineDistSeries}
                    yDomain={[-30, 30]}
                    cursorDistance={cursorDistance}
                    onCursorMove={handleCursorMove}
                    showYAxisRight={false}
                    margin={{ top: 5, right: 30, left: 30, bottom: 5 }}
                    unit=" m"
                    xMin={zoomXMin}
                    xMax={zoomXMax}
                    onZoomChange={handleZoomChange}
                    originalXMax={originalXMax ?? undefined}
                    chartRef={chartRef}
                  />
                </div>
              </div>

              {/* Time delta chart */}
              <div className="h-36 border-b border-border p-2 overflow-hidden">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-muted-foreground">Time delta</span>
                  {cursorDistance !== null && (
                    <span className="text-[10px] text-muted-foreground">{cursorDistance.toFixed(3)} km</span>
                  )}
                </div>
                <div className="h-[calc(100%-16px)] min-h-0 min-w-0">
                  <SyncedChart
                    data={telemetryData}
                    series={timeDeltaSeries}
                    cursorDistance={cursorDistance}
                    onCursorMove={handleCursorMove}
                    showYAxisRight={false}
                    margin={{ top: 5, right: 30, left: 30, bottom: 5 }}
                    unit=" sec"
                    xMin={zoomXMin}
                    xMax={zoomXMax}
                    onZoomChange={handleZoomChange}
                    originalXMax={originalXMax ?? undefined}
                    chartRef={chartRef}
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
            <div className="w-96 border-l border-border overflow-y-auto overflow-x-hidden">
              {/* Speed */}
              <div className="relative h-28 border-b border-border overflow-hidden min-h-0 min-w-0">
                <SyncedChart
                  data={telemetryData}
                  series={speedSeries}
                  yDomain={[0, 250]}
                  cursorDistance={cursorDistance}
                  onCursorMove={handleCursorMove}
                  unit=" km/h"
                  formatValue={(v) => v.toFixed(1)}
                  xMin={zoomXMin}
                  xMax={zoomXMax}
                  onZoomChange={handleZoomChange}
                  originalXMax={originalXMax ?? undefined}
                  chartRef={chartRef}
                />
                <div className="absolute right-12 top-2 text-[10px] text-muted-foreground pointer-events-none">Speed</div>
              </div>

              {/* Throttle */}
              <div className="relative h-28 border-b border-border overflow-hidden min-h-0 min-w-0">
                <SyncedChart
                  data={telemetryData}
                  series={throttleSeries}
                  yDomain={[0, 100]}
                  cursorDistance={cursorDistance}
                  onCursorMove={handleCursorMove}
                  unit="%"
                  formatValue={(v) => v.toFixed(0)}
                  xMin={zoomXMin}
                  xMax={zoomXMax}
                  onZoomChange={handleZoomChange}
                  originalXMax={originalXMax ?? undefined}
                  chartRef={chartRef}
                />
                <div className="absolute right-12 top-2 text-[10px] text-muted-foreground pointer-events-none">Throttle</div>
              </div>

              {/* Brake */}
              <div className="relative h-28 border-b border-border overflow-hidden min-h-0 min-w-0">
                <SyncedChart
                  data={telemetryData}
                  series={brakeSeries}
                  yDomain={[0, 100]}
                  cursorDistance={cursorDistance}
                  onCursorMove={handleCursorMove}
                  unit="%"
                  formatValue={(v) => v.toFixed(0)}
                  xMin={zoomXMin}
                  xMax={zoomXMax}
                  onZoomChange={handleZoomChange}
                  originalXMax={originalXMax ?? undefined}
                  chartRef={chartRef}
                />
                <div className="absolute right-12 top-2 text-[10px] text-muted-foreground pointer-events-none">Brake</div>
              </div>

              {/* Gear */}
              <div className="relative h-28 border-b border-border overflow-hidden min-h-0 min-w-0">
                <SyncedChart
                  data={telemetryData}
                  series={gearSeries}
                  yDomain={[0, 7]}
                  cursorDistance={cursorDistance}
                  onCursorMove={handleCursorMove}
                  chartType="stepAfter"
                  formatValue={(v) => v.toFixed(0)}
                  xMin={zoomXMin}
                  xMax={zoomXMax}
                  onZoomChange={handleZoomChange}
                  originalXMax={originalXMax ?? undefined}
                  chartRef={chartRef}
                />
                <div className="absolute right-12 top-2 text-[10px] text-muted-foreground pointer-events-none">Gear</div>
              </div>

              {/* RPM */}
              <div className="relative h-28 border-b border-border overflow-hidden min-h-0 min-w-0">
                <SyncedChart
                  data={telemetryData}
                  series={rpmSeries}
                  yDomain={[2000, 8000]}
                  cursorDistance={cursorDistance}
                  onCursorMove={handleCursorMove}
                  unit=" rpm"
                  formatValue={(v) => v.toFixed(0)}
                  xMin={zoomXMin}
                  xMax={zoomXMax}
                  onZoomChange={handleZoomChange}
                  originalXMax={originalXMax ?? undefined}
                  chartRef={chartRef}
                />
                <div className="absolute right-12 top-2 text-[10px] text-muted-foreground pointer-events-none">RPM</div>
              </div>

              {/* Steering wheel angle */}
              <div className="relative h-28 border-b border-border overflow-hidden min-h-0 min-w-0">
                <SyncedChart
                  data={telemetryData}
                  series={steeringSeries}
                  yDomain={[-200, 200]}
                  cursorDistance={cursorDistance}
                  onCursorMove={handleCursorMove}
                  unit="°"
                  formatValue={(v) => v.toFixed(1)}
                  xMin={zoomXMin}
                  xMax={zoomXMax}
                  onZoomChange={handleZoomChange}
                  originalXMax={originalXMax ?? undefined}
                  chartRef={chartRef}
                />
                <div className="absolute right-12 top-2 text-[10px] text-muted-foreground whitespace-nowrap pointer-events-none">Steering wheel angle</div>
              </div>
            </div>
          </div>

          {/* Sector indicators */}
          <div className="flex h-8 border-t border-border">
            <div className="flex flex-1 items-center justify-center border-r border-border bg-background">
              <span className="text-xs font-medium">S1</span>
            </div>
            <div className="flex flex-1 items-center justify-center border-r border-border bg-red-900/30">
              <span className="text-xs font-medium">S2</span>
            </div>
            <div className="flex flex-1 items-center justify-center bg-background">
              <span className="text-xs font-medium">S3</span>
            </div>
          </div>
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
  )
}
