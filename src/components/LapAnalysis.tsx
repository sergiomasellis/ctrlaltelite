import { useState, useCallback, useMemo } from "react"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ResponsiveContainer,
  ReferenceLine,
  Tooltip,
} from "recharts"

// Mock telemetry data - generate once with fixed seed for consistency
const generateTelemetryData = (points: number) => {
  const data = []
  // Use seeded random for consistent data
  const seededRandom = (seed: number) => {
    const x = Math.sin(seed) * 10000
    return x - Math.floor(x)
  }
  
  for (let i = 0; i < points; i++) {
    const distance = (i / points) * 5 // 0 to 5 km
    const rand1 = seededRandom(i * 1.1)
    const rand2 = seededRandom(i * 2.2)
    const rand3 = seededRandom(i * 3.3)
    
    data.push({
      distance,
      speed1: 80 + Math.sin(i * 0.1) * 60 + rand1 * 20,
      speed2: 85 + Math.sin(i * 0.1 + 0.5) * 55 + rand2 * 20,
      speed3: 75 + Math.sin(i * 0.1 + 1) * 65 + rand3 * 20,
      throttle1: Math.max(0, Math.min(100, 50 + Math.sin(i * 0.15) * 50)),
      throttle2: Math.max(0, Math.min(100, 55 + Math.sin(i * 0.15 + 0.3) * 45)),
      throttle3: Math.max(0, Math.min(100, 45 + Math.sin(i * 0.15 + 0.6) * 55)),
      brake1: Math.max(0, Math.min(100, Math.cos(i * 0.15) > 0.7 ? (Math.cos(i * 0.15) - 0.7) * 300 : 0)),
      brake2: Math.max(0, Math.min(100, Math.cos(i * 0.15 + 0.2) > 0.7 ? (Math.cos(i * 0.15 + 0.2) - 0.7) * 280 : 0)),
      brake3: Math.max(0, Math.min(100, Math.cos(i * 0.15 + 0.4) > 0.7 ? (Math.cos(i * 0.15 + 0.4) - 0.7) * 320 : 0)),
      gear1: Math.floor(1 + Math.abs(Math.sin(i * 0.08)) * 5),
      gear2: Math.floor(1 + Math.abs(Math.sin(i * 0.08 + 0.2)) * 5),
      gear3: Math.floor(1 + Math.abs(Math.sin(i * 0.08 + 0.4)) * 5),
      rpm1: 3000 + Math.abs(Math.sin(i * 0.1)) * 5000,
      rpm2: 3200 + Math.abs(Math.sin(i * 0.1 + 0.2)) * 4800,
      rpm3: 2800 + Math.abs(Math.sin(i * 0.1 + 0.4)) * 5200,
      steering1: Math.sin(i * 0.2) * 180,
      steering2: Math.sin(i * 0.2 + 0.1) * 175,
      steering3: Math.sin(i * 0.2 + 0.2) * 185,
      lineDist1: Math.sin(i * 0.05) * 10,
      lineDist2: Math.sin(i * 0.05 + 0.3) * 8,
      lineDist3: Math.sin(i * 0.05 + 0.6) * 12,
      timeDelta1: 0,
      timeDelta2: Math.sin(i * 0.02) * 5 + i * 0.05,
      timeDelta3: Math.sin(i * 0.03) * 8 + i * 0.1,
    })
  }
  return data
}

const telemetryData = generateTelemetryData(200)
const MAX_DISTANCE = 5

// Lap data
const laps = [
  { id: 1, time: "01:58.973", driver: "Sergio Masellis", color: "#e63946", delta: null },
  { id: 2, time: "01:56.689", driver: "Ihar Zalatukha", color: "#457b9d", delta: "-2.283s" },
  { id: 3, time: "02:23.158", driver: "Sergio Masellis", color: "#9d4edd", delta: "+24.185s" },
]

// Sector gaps
const sectorGaps = [
  { sector: "S1", lap1: "41.638", lap2: "-1.144s", lap2Color: "text-green-400", lap3: "+6.431s", lap3Color: "text-red-400" },
  { sector: "S2", lap1: "43.393", lap2: "-0.788s", lap2Color: "text-green-400", lap3: "+17.189s", lap3Color: "text-red-400" },
  { sector: "S3", lap1: "33.952", lap2: "-0.352s", lap2Color: "text-green-400", lap3: "+0.563s", lap3Color: "text-red-400" },
]

// Interpolate values at a given distance
function interpolateAtDistance(distance: number, dataKey: string): number {
  if (distance <= 0) return telemetryData[0][dataKey as keyof typeof telemetryData[0]] as number
  if (distance >= MAX_DISTANCE) return telemetryData[telemetryData.length - 1][dataKey as keyof typeof telemetryData[0]] as number
  
  const index = (distance / MAX_DISTANCE) * (telemetryData.length - 1)
  const lowerIndex = Math.floor(index)
  const upperIndex = Math.ceil(index)
  const fraction = index - lowerIndex
  
  if (lowerIndex === upperIndex) {
    return telemetryData[lowerIndex][dataKey as keyof typeof telemetryData[0]] as number
  }
  
  const lowerValue = telemetryData[lowerIndex][dataKey as keyof typeof telemetryData[0]] as number
  const upperValue = telemetryData[upperIndex][dataKey as keyof typeof telemetryData[0]] as number
  
  return lowerValue + (upperValue - lowerValue) * fraction
}

// Helper function to get heatmap color based on delta value
function getHeatmapStyle(deltaString: string): string {
  // Parse the delta value (e.g., "-1.144s" -> -1.144, "+6.431s" -> 6.431)
  const match = deltaString.match(/([+-]?\d+\.?\d*)s?/)
  if (!match) return 'bg-muted/50'
  
  const delta = parseFloat(match[1])
  if (delta === 0) return 'bg-muted/50'
  
  // Calculate intensity (0 to 1) based on delta magnitude
  // Use a scale where ~0.5s = light, ~2s = medium, ~10s+ = intense
  const absValue = Math.abs(delta)
  const intensity = Math.min(1, absValue / 10) // Max intensity at 10 seconds
  
  // Calculate opacity (30% to 70% based on intensity)
  const opacity = Math.round(30 + intensity * 40)
  
  if (delta < 0) {
    // Faster - green gradient
    if (intensity < 0.15) return `bg-green-500/20 text-green-300`
    if (intensity < 0.3) return `bg-green-500/35 text-green-400`
    if (intensity < 0.5) return `bg-green-500/50 text-green-400`
    return `bg-green-500/70 text-green-300`
  } else {
    // Slower - red gradient
    if (intensity < 0.15) return `bg-red-500/20 text-red-300`
    if (intensity < 0.3) return `bg-red-500/35 text-red-400`
    if (intensity < 0.5) return `bg-red-500/50 text-red-400`
    return `bg-red-500/70 text-red-300`
  }
}

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

// Cursor state type
interface CursorState {
  distance: number | null
  chartWidth: number
  chartLeft: number
}

// Custom tooltip content component for recharts
interface CustomTooltipProps {
  active?: boolean
  payload?: any[]
  label?: number
  dataKey1: string
  dataKey2: string
  dataKey3: string
  unit?: string
  formatValue?: (v: number) => string
}

function CustomTooltipContent({ active, payload, dataKey1, dataKey2, dataKey3, unit = "", formatValue = (v) => v.toFixed(1) }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null
  
  const data = payload[0]?.payload
  if (!data) return null
  
  const v1 = data[dataKey1]
  const v2 = data[dataKey2]
  const v3 = data[dataKey3]
  const distance = data.distance
  
  return (
    <div className="bg-card/95 backdrop-blur-sm border border-border rounded-lg px-3 py-2 shadow-xl">
      <div className="text-[10px] text-muted-foreground mb-1.5 font-medium">
        {distance?.toFixed(3)} km
      </div>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-sm bg-[#e63946]" />
          <span className="text-xs text-foreground font-medium">{formatValue(v1)}{unit}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-sm bg-[#457b9d]" />
          <span className="text-xs text-foreground font-medium">{formatValue(v2)}{unit}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-sm bg-[#9d4edd]" />
          <span className="text-xs text-foreground font-medium">{formatValue(v3)}{unit}</span>
        </div>
      </div>
    </div>
  )
}

// Synced chart component
interface SyncedChartProps {
  dataKey1: string
  dataKey2: string
  dataKey3: string
  yDomain?: [number, number]
  title: string
  cursorDistance: number | null
  onCursorMove: (distance: number | null) => void
  chartType?: "monotone" | "stepAfter"
  showYAxisRight?: boolean
  margin?: { top: number; right: number; left: number; bottom: number }
  unit?: string
  formatValue?: (v: number) => string
}

function SyncedChart({
  dataKey1,
  dataKey2,
  dataKey3,
  yDomain,
  title,
  cursorDistance,
  onCursorMove,
  chartType = "monotone",
  showYAxisRight = true,
  margin = { top: 10, right: 40, left: 10, bottom: 10 },
  unit = "",
  formatValue = (v) => v.toFixed(1),
}: SyncedChartProps) {
  
  const handleMouseMove = useCallback((state: any) => {
    // Use activePayload to get the distance value directly from the data
    if (state?.activePayload && state.activePayload.length > 0) {
      const distance = state.activePayload[0]?.payload?.distance
      if (distance !== undefined) {
        onCursorMove(distance)
      }
    }
  }, [onCursorMove])

  const handleMouseLeave = useCallback(() => {
    onCursorMove(null)
  }, [onCursorMove])

  return (
    <div className="relative w-full h-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart 
          data={telemetryData} 
          margin={margin}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          syncId="telemetry"
        >
          <defs>
            <linearGradient id="fillLap1" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#e63946" stopOpacity={0.6} />
              <stop offset="95%" stopColor="#e63946" stopOpacity={0.05} />
            </linearGradient>
            <linearGradient id="fillLap2" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#457b9d" stopOpacity={0.6} />
              <stop offset="95%" stopColor="#457b9d" stopOpacity={0.05} />
            </linearGradient>
            <linearGradient id="fillLap3" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#9d4edd" stopOpacity={0.6} />
              <stop offset="95%" stopColor="#9d4edd" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="distance"
            type="number"
            domain={[0, MAX_DISTANCE]}
            ticks={[0, 1, 2, 3, 4, 5]}
            tick={{ fontSize: 8, fill: "#6b7280" }}
            tickFormatter={(v) => `${v} km`}
            axisLine={{ stroke: "#374151" }}
          />
          <YAxis
            domain={yDomain}
            tick={{ fontSize: 8, fill: "#6b7280" }}
            axisLine={{ stroke: "#374151" }}
            orientation={showYAxisRight ? "right" : "left"}
            width={showYAxisRight ? 25 : 30}
          />
          
          {/* Sector highlighting */}
          <ReferenceLine x={1} stroke="#4a3535" strokeWidth={20} />
          <ReferenceLine x={3} stroke="#4a3535" strokeWidth={20} />
          
          {/* Data areas */}
          <Area type={chartType} dataKey={dataKey1} stroke="#e63946" fill="url(#fillLap1)" strokeWidth={1.5} isAnimationActive={false} />
          <Area type={chartType} dataKey={dataKey2} stroke="#457b9d" fill="url(#fillLap2)" strokeWidth={1.5} isAnimationActive={false} />
          <Area type={chartType} dataKey={dataKey3} stroke="#9d4edd" fill="url(#fillLap3)" strokeWidth={1.5} isAnimationActive={false} />
          
        {/* Cursor line - smooth position, rendered on top */}
        {cursorDistance !== null && (
          <ReferenceLine 
            x={cursorDistance} 
            stroke="#ffffff" 
            strokeWidth={2}
            isFront={true}
          />
        )}
        
        {/* Tooltip with visible cursor line */}
        <Tooltip 
          content={(props) => (
            <CustomTooltipContent
              {...props}
              dataKey1={dataKey1}
              dataKey2={dataKey2}
              dataKey3={dataKey3}
              unit={unit}
              formatValue={formatValue}
            />
          )}
          cursor={{ stroke: '#ffffff', strokeWidth: 1, strokeOpacity: 0.5 }} 
        />
      </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

export function LapAnalysis() {
  // Shared cursor distance (smooth value, not snapped to data points)
  const [cursorDistance, setCursorDistance] = useState<number | null>(null)

  const handleCursorMove = useCallback((distance: number | null) => {
    setCursorDistance(distance)
  }, [])

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
          {/* Laps section */}
          <div className="p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Laps:</span>
              <Button variant="ghost" size="icon-xs">
                <Settings className="h-3 w-3" />
              </Button>
            </div>
            <div className="space-y-1">
              {laps.map((lap) => (
                <div
                  key={lap.id}
                  className="flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-muted/50"
                >
                  <div
                    className="h-3 w-3 rounded-sm"
                    style={{ backgroundColor: lap.color }}
                  />
                  <span className="font-medium">{lap.time}</span>
                  {lap.delta && (
                    <span className="text-muted-foreground">({lap.delta})</span>
                  )}
                  <div className="ml-auto">
                    <a href="#" className="text-primary hover:underline">
                      {lap.driver}
                    </a>
                  </div>
                </div>
              ))}
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
            <div className="mb-2 flex items-center gap-4">
              {laps.map((lap) => (
                <div key={lap.id} className="flex items-center gap-1">
                  <div
                    className="h-2.5 w-2.5 rounded-sm"
                    style={{ backgroundColor: lap.color }}
                  />
                  <span className="text-[10px]">{lap.id}</span>
                </div>
              ))}
            </div>

            {/* Sector times table with heatmap */}
            <div className="space-y-1 text-xs">
              <div className="grid grid-cols-4 gap-1 text-muted-foreground">
                <span></span>
                <span className="text-center">1</span>
                <span className="text-center">2</span>
                <span className="text-center">3</span>
              </div>
              {sectorGaps.map((sector) => (
                <div key={sector.sector} className="grid grid-cols-4 gap-1">
                  <span className="text-muted-foreground">{sector.sector}</span>
                  <span className="rounded px-1 py-0.5 text-center bg-muted/50">{sector.lap1}</span>
                  <span className={`rounded px-1 py-0.5 text-center ${getHeatmapStyle(sector.lap2)}`}>{sector.lap2}</span>
                  <span className={`rounded px-1 py-0.5 text-center ${getHeatmapStyle(sector.lap3)}`}>{sector.lap3}</span>
                </div>
              ))}
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
                  {cursorDistance !== null && (
                    <span className="text-[10px] text-muted-foreground">{cursorDistance.toFixed(3)} km</span>
                  )}
                </div>
                <div className="h-[calc(100%-16px)]">
                  <SyncedChart
                    dataKey1="lineDist1"
                    dataKey2="lineDist2"
                    dataKey3="lineDist3"
                    yDomain={[-30, 30]}
                    title="Line distance"
                    cursorDistance={cursorDistance}
                    onCursorMove={handleCursorMove}
                    showYAxisRight={false}
                    margin={{ top: 5, right: 30, left: 30, bottom: 5 }}
                    unit=" m"
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
                <div className="h-[calc(100%-16px)]">
                  <SyncedChart
                    dataKey1="timeDelta1"
                    dataKey2="timeDelta2"
                    dataKey3="timeDelta3"
                    title="Time delta"
                    cursorDistance={cursorDistance}
                    onCursorMove={handleCursorMove}
                    showYAxisRight={false}
                    margin={{ top: 5, right: 30, left: 30, bottom: 5 }}
                    unit=" sec"
                  />
                </div>
              </div>

              {/* Legend */}
              <div className="flex items-center gap-6 border-b border-border p-3">
                {laps.map((lap) => (
                  <div key={lap.id} className="flex items-center gap-2 text-xs">
                    <div
                      className="h-3 w-3 rounded-sm"
                      style={{ backgroundColor: lap.color }}
                    />
                    <span>{lap.time}</span>
                    {lap.delta && (
                      <span className="text-muted-foreground">({lap.delta})</span>
                    )}
                    <a href="#" className="text-primary hover:underline">
                      {lap.driver}
                    </a>
                  </div>
                ))}
              </div>
            </div>

            {/* Right telemetry charts */}
            <div className="w-96 border-l border-border overflow-y-auto overflow-x-hidden">
              {/* Speed */}
              <div className="relative h-28 border-b border-border overflow-hidden">
                <SyncedChart
                  dataKey1="speed1"
                  dataKey2="speed2"
                  dataKey3="speed3"
                  yDomain={[0, 250]}
                  title="Speed"
                  cursorDistance={cursorDistance}
                  onCursorMove={handleCursorMove}
                  unit=" km/h"
                  formatValue={(v) => v.toFixed(1)}
                />
                <div className="absolute right-12 top-2 text-[10px] text-muted-foreground pointer-events-none">Speed</div>
              </div>

              {/* Throttle */}
              <div className="relative h-28 border-b border-border overflow-hidden">
                <SyncedChart
                  dataKey1="throttle1"
                  dataKey2="throttle2"
                  dataKey3="throttle3"
                  yDomain={[0, 100]}
                  title="Throttle"
                  cursorDistance={cursorDistance}
                  onCursorMove={handleCursorMove}
                  unit="%"
                  formatValue={(v) => v.toFixed(0)}
                />
                <div className="absolute right-12 top-2 text-[10px] text-muted-foreground pointer-events-none">Throttle</div>
              </div>

              {/* Brake */}
              <div className="relative h-28 border-b border-border overflow-hidden">
                <SyncedChart
                  dataKey1="brake1"
                  dataKey2="brake2"
                  dataKey3="brake3"
                  yDomain={[0, 100]}
                  title="Brake"
                  cursorDistance={cursorDistance}
                  onCursorMove={handleCursorMove}
                  unit="%"
                  formatValue={(v) => v.toFixed(0)}
                />
                <div className="absolute right-12 top-2 text-[10px] text-muted-foreground pointer-events-none">Brake</div>
              </div>

              {/* Gear */}
              <div className="relative h-28 border-b border-border overflow-hidden">
                <SyncedChart
                  dataKey1="gear1"
                  dataKey2="gear2"
                  dataKey3="gear3"
                  yDomain={[0, 7]}
                  title="Gear"
                  cursorDistance={cursorDistance}
                  onCursorMove={handleCursorMove}
                  chartType="stepAfter"
                  formatValue={(v) => v.toFixed(0)}
                />
                <div className="absolute right-12 top-2 text-[10px] text-muted-foreground pointer-events-none">Gear</div>
              </div>

              {/* RPM */}
              <div className="relative h-28 border-b border-border overflow-hidden">
                <SyncedChart
                  dataKey1="rpm1"
                  dataKey2="rpm2"
                  dataKey3="rpm3"
                  yDomain={[2000, 8000]}
                  title="RPM"
                  cursorDistance={cursorDistance}
                  onCursorMove={handleCursorMove}
                  unit=" rpm"
                  formatValue={(v) => v.toFixed(0)}
                />
                <div className="absolute right-12 top-2 text-[10px] text-muted-foreground pointer-events-none">RPM</div>
              </div>

              {/* Steering wheel angle */}
              <div className="relative h-28 border-b border-border overflow-hidden">
                <SyncedChart
                  dataKey1="steering1"
                  dataKey2="steering2"
                  dataKey3="steering3"
                  yDomain={[-200, 200]}
                  title="Steering wheel angle"
                  cursorDistance={cursorDistance}
                  onCursorMove={handleCursorMove}
                  unit="°"
                  formatValue={(v) => v.toFixed(1)}
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
