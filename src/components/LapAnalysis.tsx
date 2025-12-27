import { useState, useCallback, useMemo, useRef, Suspense, lazy, useEffect, type Ref } from "react"
import {
  Upload,
  FileText,
  Settings,
  Map as MapIcon,
  AlertCircle,
  GripVertical,
  RotateCcw,
  ArrowLeft,
  Loader2,
  Sun,
  Moon,
} from "lucide-react"
import { Responsive, WidthProvider } from "react-grid-layout"
import type { Layout, Layouts } from "react-grid-layout"
import { useTheme } from "@/lib/theme-provider"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { readIbtHeader, readIbtSamples, readIbtVarHeaders, readIbtSessionInfoYaml, parseSessionsFromYaml, parseWeekendInfoFromYaml, type IbtValue, type IbtWeekendInfo } from "@/lib/ibt"
import { createCursorStore, CursorStoreContext } from "@/lib/cursorStore"
import { formatLapTime } from "@/lib/telemetry-utils"
import { parseSectorBoundaries, calculateSectorTimes } from "@/lib/sector-utils"
import { createTrackKey, isTrackMapData } from "@/lib/track-map-utils"
import type { ChartSeries } from "@/components/telemetry/types"
import type { LapAnalysisProps } from "@/components/types"
import { TelemetrySourceInput } from "@/components/lap-analysis/TelemetrySourceInput"
import { LapSelector } from "@/components/lap-analysis/LapSelector"
import { SectorTimesTable } from "@/components/lap-analysis/SectorTimesTable"
import { SessionInfo } from "@/components/lap-analysis/SessionInfo"
import { LapStatsBar } from "@/components/lap-analysis/LapStatsBar"
import { LapComparisonLegend } from "@/components/lap-analysis/LapComparisonLegend"
import { SectorIndicators } from "@/components/lap-analysis/SectorIndicators"
import { prepareTelemetryData } from "@/components/lap-analysis/telemetry-data-utils"
import { LAP_COLOR_PALETTE } from "@/components/lap-analysis/constants"
import type { IbtLapData, IbtLapPoint, SectorBoundary } from "@/components/lap-analysis/types"
import type { TrackMapData } from "@/components/track/types"
import { DraggableChart } from "@/components/telemetry/DraggableChart"

// Lazy load chart component for better initial load
const SyncedChart = lazy(() => import("@/components/telemetry/SyncedChart").then(module => ({ default: module.SyncedChart })))
const TrackMap = lazy(() => import("@/components/track/TrackMap3D").then(module => ({ default: module.TrackMap3D })))

const ResponsiveGridLayout = WidthProvider(Responsive)

// Chart type IDs
const CHART_IDS = {
  SPEED: "speed",
  THROTTLE: "throttle",
  BRAKE: "brake",
  GEAR: "gear",
  RPM: "rpm",
  STEERING: "steering",
  TIME_DELTA: "timeDelta",
  LINE_DIST: "lineDist",
  TIRE_TEMP: "tireTemp",
  TIRE_PRESSURE: "tirePressure",
  TIRE_WEAR: "tireWear",
} as const

type ChartId = typeof CHART_IDS[keyof typeof CHART_IDS]

const LAP_SESSION_KEY_MULTIPLIER = 10000

// Default chart order
const DEFAULT_CHART_ORDER: ChartId[] = [
  CHART_IDS.LINE_DIST,
  CHART_IDS.TIME_DELTA,
  CHART_IDS.SPEED,
  CHART_IDS.BRAKE,
  CHART_IDS.GEAR,
  CHART_IDS.STEERING,
  CHART_IDS.THROTTLE,
  CHART_IDS.TIRE_TEMP,
  CHART_IDS.TIRE_PRESSURE,
  CHART_IDS.RPM,
  CHART_IDS.TIRE_WEAR,
]

const GRID_BREAKPOINTS = {
  xl: 1400,
  lg: 1200,
  md: 992,
  sm: 768,
  xs: 480,
  xxs: 0,
} as const

const GRID_COLUMNS = {
  xl: 3,
  lg: 3,
  md: 2,
  sm: 1,
  xs: 1,
  xxs: 1,
} as const

const GRID_ROW_HEIGHT = 180
const GRID_MARGIN = 16

const CHART_ID_SET = new Set<ChartId>(Object.values(CHART_IDS))

const buildLayouts = (order: ChartId[]): Layouts => {
  const createLayout = (columns: number): Layout[] =>
    order.map((id, index) => ({
      i: id,
      x: index % columns,
      y: Math.floor(index / columns),
      w: 1,
      h: 1,
      minW: 1,
      minH: 1,
    }))

  return {
    xl: createLayout(GRID_COLUMNS.xl),
    lg: createLayout(GRID_COLUMNS.lg),
    md: createLayout(GRID_COLUMNS.md),
    sm: createLayout(GRID_COLUMNS.sm),
    xs: createLayout(GRID_COLUMNS.xs),
    xxs: createLayout(GRID_COLUMNS.xxs),
  }
}

const DEFAULT_LAYOUTS: Layouts = {
  xl: [
    { i: CHART_IDS.LINE_DIST, x: 0, y: 0, w: 1, h: 1, minW: 1, minH: 1 },
    { i: CHART_IDS.TIME_DELTA, x: 1, y: 0, w: 1, h: 1, minW: 1, minH: 1 },
    { i: CHART_IDS.SPEED, x: 2, y: 0, w: 1, h: 1, minW: 1, minH: 1 },
    { i: CHART_IDS.BRAKE, x: 0, y: 1, w: 2, h: 2, minW: 1, minH: 1 },
    { i: CHART_IDS.GEAR, x: 2, y: 1, w: 1, h: 1, minW: 1, minH: 1 },
    { i: CHART_IDS.STEERING, x: 2, y: 2, w: 1, h: 1, minW: 1, minH: 1 },
    { i: CHART_IDS.THROTTLE, x: 0, y: 3, w: 2, h: 2, minW: 1, minH: 1 },
    { i: CHART_IDS.TIRE_TEMP, x: 2, y: 3, w: 1, h: 1, minW: 1, minH: 1 },
    { i: CHART_IDS.TIRE_PRESSURE, x: 2, y: 4, w: 1, h: 1, minW: 1, minH: 1 },
    { i: CHART_IDS.RPM, x: 0, y: 5, w: 2, h: 1, minW: 1, minH: 1 },
    { i: CHART_IDS.TIRE_WEAR, x: 2, y: 5, w: 1, h: 1, minW: 1, minH: 1 },
  ],
  lg: [],
  md: [],
  sm: [],
  xs: [],
  xxs: [],
}

DEFAULT_LAYOUTS.lg = DEFAULT_LAYOUTS.xl
DEFAULT_LAYOUTS.md = buildLayouts(DEFAULT_CHART_ORDER).md
DEFAULT_LAYOUTS.sm = buildLayouts(DEFAULT_CHART_ORDER).sm
DEFAULT_LAYOUTS.xs = buildLayouts(DEFAULT_CHART_ORDER).xs
DEFAULT_LAYOUTS.xxs = buildLayouts(DEFAULT_CHART_ORDER).xxs

const LAYOUT_STORAGE_KEY = "lap-analysis-layout-v1"

const mergeLayouts = (current: Layout[] | undefined, fallback: Layout[]): Layout[] => {
  const byId = new globalThis.Map((current ?? []).map((item) => [item.i, item]))
  return fallback.map((item) => ({ ...item, ...(byId.get(item.i) ?? {}) }))
}

const normalizeLayouts = (stored: Layouts | null): Layouts => ({
  xl: mergeLayouts(stored?.xl, DEFAULT_LAYOUTS.xl),
  lg: mergeLayouts(stored?.lg, DEFAULT_LAYOUTS.lg),
  md: mergeLayouts(stored?.md, DEFAULT_LAYOUTS.md),
  sm: mergeLayouts(stored?.sm, DEFAULT_LAYOUTS.sm),
  xs: mergeLayouts(stored?.xs, DEFAULT_LAYOUTS.xs),
  xxs: mergeLayouts(stored?.xxs, DEFAULT_LAYOUTS.xxs),
})

const normalizeOrder = (value: unknown): ChartId[] | null => {
  if (!Array.isArray(value)) return null
  const filtered = value.filter((item): item is ChartId => CHART_ID_SET.has(item as ChartId))
  if (filtered.length !== CHART_ID_SET.size) return null
  const unique = new Set(filtered)
  if (unique.size !== filtered.length) return null
  return filtered
}

const readStoredLayout = (): { layouts: Layouts; order: ChartId[] } | null => {
  if (typeof window === "undefined") return null
  const raw = window.localStorage.getItem(LAYOUT_STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { layouts?: Layouts; order?: ChartId[] }
    const order = normalizeOrder(parsed.order) ?? null
    const layouts = normalizeLayouts(parsed.layouts ?? null)
    return { layouts, order: order ?? DEFAULT_CHART_ORDER }
  } catch {
    return null
  }
}

export function LapAnalysis({ initialFiles, onBackToStart }: LapAnalysisProps = {}) {
  // Create cursor store once - bypasses React state for performance
  const cursorStoreRef = useRef<ReturnType<typeof createCursorStore> | null>(null)
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
  const [weekendInfo, setWeekendInfo] = useState<IbtWeekendInfo | null>(null)
  const [trackMap, setTrackMap] = useState<TrackMapData | null>(null)
  const [subSessionIds, setSubSessionIds] = useState<number[]>([])
  const [sessionsByNum, setSessionsByNum] = useState<Record<number, import("@/lib/ibt").IbtSessionInfo>>({})
  const [driverCarIdx, setDriverCarIdx] = useState<number | null>(null)

  const storedLayout = useMemo(() => readStoredLayout(), [])

  // Chart order state
  const [chartOrder, setChartOrder] = useState<ChartId[]>(() => storedLayout?.order ?? DEFAULT_CHART_ORDER)
  const [chartLayouts, setChartLayouts] = useState<Layouts>(() => normalizeLayouts(storedLayout?.layouts ?? null))
  const chartLayoutsRef = useRef<Layouts>(chartLayouts)

  // Zoom state (shared across all charts)
  const [zoomXMin, setZoomXMin] = useState<number | null>(null)
  const [zoomXMax, setZoomXMax] = useState<number | null>(null)
  const { theme, setTheme } = useTheme()

  const handleZoomChange = useCallback((xMin: number | null, xMax: number | null) => {
    setZoomXMin(xMin)
    setZoomXMax(xMax)
  }, [])

  const handleResetZoom = useCallback(() => {
    setZoomXMin(null)
    setZoomXMax(null)
  }, [])

  useEffect(() => {
    if (!weekendInfo) {
      setTrackMap(null)
      return
    }

    const trackKey = createTrackKey(weekendInfo)
    const weekendTrackId = weekendInfo.trackID ?? null
    const weekendConfigName = weekendInfo.trackConfigName ?? null

    if (!trackKey || weekendTrackId == null || weekendConfigName == null) {
      setTrackMap(null)
      return
    }

    const normalizeConfig = (value: string) => value.trim().toLowerCase()

    let active = true
    const controller = new AbortController()

    const loadTrackMap = async () => {
      try {
        const response = await fetch(`/track-maps/${trackKey}.json`, { signal: controller.signal })
        if (!response.ok) {
          if (active) setTrackMap(null)
          return
        }

        const payload: unknown = await response.json()
        if (!active) return
        if (!isTrackMapData(payload)) {
          setTrackMap(null)
          return
        }

        const configMatches =
          payload.trackConfigName != null &&
          normalizeConfig(payload.trackConfigName) === normalizeConfig(weekendConfigName)
        const idMatches = payload.trackId === weekendTrackId

        if (configMatches && idMatches) {
          setTrackMap(payload)
        } else {
          setTrackMap(null)
        }
      } catch (error) {
        if (!active) return
        if (error instanceof DOMException && error.name === "AbortError") return
        setTrackMap(null)
      }
    }

    loadTrackMap()

    return () => {
      active = false
      controller.abort()
    }
  }, [weekendInfo])

  const persistLayout = useCallback((layouts: Layouts, order: ChartId[]) => {
    if (typeof window === "undefined") return
    window.localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify({ layouts, order }))
  }, [])

  const handleLayoutChange = useCallback((_: Layout[], layouts: Layouts) => {
    chartLayoutsRef.current = layouts
    setChartLayouts(layouts)
  }, [])

  const handleLayoutCommit = useCallback((layout: Layout[]) => {
    const nextOrder = [...layout]
      .sort((a, b) => (a.y - b.y) || (a.x - b.x))
      .map((item) => item.i as ChartId)
    setChartOrder((prev) => {
      if (prev.length !== nextOrder.length) return prev
      for (let i = 0; i < prev.length; i += 1) {
        if (prev[i] !== nextOrder[i]) return nextOrder
      }
      return prev
    })
    persistLayout(chartLayoutsRef.current, nextOrder)
  }, [persistLayout])

  const handleResetLayout = useCallback(() => {
    const defaultLayouts = normalizeLayouts(null)
    chartLayoutsRef.current = defaultLayouts
    setChartLayouts(defaultLayouts)
    setChartOrder(DEFAULT_CHART_ORDER)
    persistLayout(defaultLayouts, DEFAULT_CHART_ORDER)
  }, [persistLayout])

  const handleSectorClick = useCallback((sectorStartKm: number, sectorEndKm: number) => {
    // Sector distances are calculated using official track length, but telemetry points
    // use actual measured lap distance. Scale the sector boundaries to match actual lap distance.
    if (ibtLapDataByLap && selectedLaps.length > 0 && weekendInfo) {
      const refLap = selectedLaps[0]
      const refData = ibtLapDataByLap[refLap]
      if (refData) {
        const officialTrackLengthKm = weekendInfo.trackLengthOfficial
          ? parseFloat(weekendInfo.trackLengthOfficial.replace(/[^\d.]/g, ''))
          : weekendInfo.trackLength
          ? parseFloat(weekendInfo.trackLength.replace(/[^\d.]/g, ''))
          : null
        
        if (officialTrackLengthKm && refData.distanceKm > 0) {
          // Scale from official track length to actual lap distance
          const scaleFactor = refData.distanceKm / officialTrackLengthKm
          const scaledStart = sectorStartKm * scaleFactor
          const scaledEnd = sectorEndKm * scaleFactor
          
          console.log('handleSectorClick scaling:', {
            sectorStartKm,
            sectorEndKm,
            officialTrackLengthKm,
            actualLapDistanceKm: refData.distanceKm,
            scaleFactor,
            scaledStart,
            scaledEnd,
          })
          
          setZoomXMin(scaledStart)
          setZoomXMax(scaledEnd)
          return
        }
      }
    }
    
    // Fallback: use distances as-is if scaling not possible
    console.log('handleSectorClick fallback (no scaling):', { sectorStartKm, sectorEndKm })
    setZoomXMin(sectorStartKm)
    setZoomXMax(sectorEndKm)
  }, [ibtLapDataByLap, selectedLaps, weekendInfo])

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

  const parseIbtFile = useCallback(
    async (file: File) => {
      setIbtProgress({ processedRecords: 0, totalRecords: 1 })
      const header = await readIbtHeader(file)
      const vars = await readIbtVarHeaders(file, header)

      const sessionYaml = await readIbtSessionInfoYaml(file, header)
      const sectors = parseSectorBoundaries(sessionYaml)
      const parsedSessions = parseSessionsFromYaml(sessionYaml)

      const driverCarIdxMatch = sessionYaml.match(/DriverCarIdx:\s*(\d+)/)
      const carIdx = driverCarIdxMatch ? parseInt(driverCarIdxMatch[1], 10) : null

      const weekendInfoData = parseWeekendInfoFromYaml(sessionYaml)

      const hasSessionNum = vars.some(v => v.name.toLowerCase() === "sessionnum")
      const hasPlayerCarIdx = vars.some(v => v.name.toLowerCase() === "playercaridx")
      const hasAltitude = vars.some(v => v.name.toLowerCase() === "alt")

      const recordCount =
        header.diskSubHeader?.recordCount ??
        Math.floor((file.size - (header.sessionInfoOffset + header.sessionInfoLen)) / header.bufLen)

      const targetPoints = 10_000
      const stride = Math.max(1, Math.floor(recordCount / targetPoints))

      const varNames = [
        "SessionTime",
        "Lap",
        "LapDist",
        "Speed",
        "RPM",
        "Gear",
        "Throttle",
        "Brake",
        "BrakeABSactive",
        "SteeringWheelAngle",
        "Lat",
        "Lon",
        "LFtempM",
        "RFtempM",
        "LRtempM",
        "RRtempM",
        "LFpressure",
        "RFpressure",
        "LRpressure",
        "RRpressure",
        "LFwearM",
        "RFwearM",
        "LRwearM",
        "RRwearM",
      ]
      if (hasAltitude) {
        varNames.push("Alt")
      }

      if (hasSessionNum) {
        varNames.push("SessionNum")
      }

      if (hasPlayerCarIdx) {
        varNames.push("PlayerCarIdx")
      }

      const rows = await readIbtSamples(file, header, vars, {
        varNames,
        stride,
        onProgress: (p) => setIbtProgress(p),
      })

      const num = (v: IbtValue): number | null =>
        typeof v === "number" && Number.isFinite(v) ? v : null

      const lapTimesFromCrossings: Record<number, number> = {}
      const makeLapKey = (lap: number, sessionNum: number | null) =>
        hasSessionNum && sessionNum != null ? sessionNum * LAP_SESSION_KEY_MULTIPLIER + lap : lap

      const transitionVarNames = ["SessionTime", "Lap", "LapDist"]
      if (hasPlayerCarIdx) {
        transitionVarNames.push("PlayerCarIdx")
      }
      if (hasSessionNum) {
        transitionVarNames.push("SessionNum")
      }

      const allSamples = stride > 1
        ? await readIbtSamples(file, header, vars, {
            varNames: transitionVarNames,
            stride: 1,
            onProgress: (p) => setIbtProgress(p),
          })
        : rows.filter((r) => {
            if (hasPlayerCarIdx && carIdx != null) {
              const rowCarIdx = num(r["PlayerCarIdx"])
              if (rowCarIdx == null || rowCarIdx !== carIdx) return false
            }
            return true
          }).map((r) => {
            const result: Record<string, IbtValue> = {}
            for (const vn of transitionVarNames) {
              result[vn] = r[vn]
            }
            return result
          })

      const filteredSamples = allSamples.filter((r) => {
        if (hasPlayerCarIdx && carIdx != null) {
          const rowCarIdx = num(r["PlayerCarIdx"])
          if (rowCarIdx == null || rowCarIdx !== carIdx) return false
        }
        return true
      })

      const sflCrossings: Array<{ lapKey: number; lap: number; sessionNum: number | null; sessionTime: number }> = []

      for (let i = 1; i < filteredSamples.length; i++) {
        const prevSample = filteredSamples[i - 1]
        const currSample = filteredSamples[i]

        const prevLap = num(prevSample["Lap"])
        const currLap = num(currSample["Lap"])
        const prevSessionTime = num(prevSample["SessionTime"])
        const currSessionTime = num(currSample["SessionTime"])
        const prevLapDist = num(prevSample["LapDist"])
        const currLapDist = num(currSample["LapDist"])
        const prevSessionNum = hasSessionNum ? num(prevSample["SessionNum"]) : null
        const currSessionNum = hasSessionNum ? num(currSample["SessionNum"]) : null

        if (prevLap == null || currLap == null || prevSessionTime == null || currSessionTime == null ||
            prevLapDist == null || currLapDist == null) continue
        if (hasSessionNum && (prevSessionNum == null || currSessionNum == null || prevSessionNum !== currSessionNum)) continue
        if (currLap <= 0) continue

        if (prevLapDist != null && currLapDist != null &&
            prevLapDist > currLapDist && currLapDist < 50 && prevLapDist > 100) {
          const t = (0 - prevLapDist) / (currLapDist - prevLapDist)
          if (Number.isFinite(t)) {
            const interpolatedTime = prevSessionTime + t * (currSessionTime - prevSessionTime)
            if (Number.isFinite(interpolatedTime) && interpolatedTime > 0) {
              const lapKey = makeLapKey(currLap, currSessionNum)
              sflCrossings.push({
                lapKey,
                lap: currLap,
                sessionNum: currSessionNum,
                sessionTime: interpolatedTime
              })
            }
          }
        }
      }

      for (let i = 1; i < sflCrossings.length; i++) {
        const prev = sflCrossings[i - 1]!
        const curr = sflCrossings[i]!

        if (curr.lap >= prev.lap && curr.lap > 0) {
          const lapTime = curr.sessionTime - prev.sessionTime
          if (lapTime > 60 && lapTime < 300) {
            const targetLap = curr.lap === prev.lap ? curr.lap : prev.lap
            if (targetLap > 0) {
              const targetLapKey = makeLapKey(targetLap, curr.sessionNum)
              const existingTime = lapTimesFromCrossings[targetLapKey]
              if (existingTime == null || lapTime < existingTime) {
                lapTimesFromCrossings[targetLapKey] = lapTime
              }
            }
          }
        }
      }

      const byLap: Record<number, Array<Record<string, IbtValue>>> = {}
      const lapSessionNums: Record<number, number | null> = {}
      const lapNumbers: Record<number, number> = {}

      for (const r of rows) {
        if (hasPlayerCarIdx && carIdx != null) {
          const rowCarIdx = num(r["PlayerCarIdx"])
          if (rowCarIdx == null || rowCarIdx !== carIdx) continue
        }
        const lap = num(r["Lap"])
        if (lap == null) continue
        const sessionNum = hasSessionNum ? num(r["SessionNum"]) : null
        const lapKey = makeLapKey(lap, sessionNum)
        byLap[lapKey] ??= []
        byLap[lapKey].push(r)

        if (hasSessionNum && lapSessionNums[lapKey] == null) {
          if (sessionNum != null) {
            lapSessionNums[lapKey] = sessionNum
          }
        }
        if (lapNumbers[lapKey] == null) {
          lapNumbers[lapKey] = lap
        }
      }

      const lapNums = Object.keys(byLap)
        .map((x) => Number(x))
        .filter((x) => Number.isFinite(x))
        .sort((a, b) => a - b)

      const lapDataByLap: Record<number, IbtLapData> = {}

      for (const lapKey of lapNums) {
        const lapRows = byLap[lapKey]
        const lapNumber = lapNumbers[lapKey] ?? lapKey
        const raw: Array<{
          sessionTime: number
          lapDistKm: number
          speedKmh: number | null
          throttlePct: number | null
          brakePct: number | null
          brakeABSactive: boolean | null
          gear: number | null
          rpm: number | null
          steeringDeg: number | null
          lat: number | null
          lon: number | null
          altitudeM: number | null
          tireTempLF: number | null
          tireTempRF: number | null
          tireTempLR: number | null
          tireTempRR: number | null
          tirePressureLF: number | null
          tirePressureRF: number | null
          tirePressureLR: number | null
          tirePressureRR: number | null
          tireWearLF: number | null
          tireWearRF: number | null
          tireWearLR: number | null
          tireWearRR: number | null
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
          const brakeABS = r["BrakeABSactive"]
          const brakeABSactive = typeof brakeABS === "boolean" ? brakeABS : brakeABS === 1 ? true : brakeABS === 0 ? false : null
          const steerRad = num(r["SteeringWheelAngle"])
          const lat = typeof r["Lat"] === "number" && Number.isFinite(r["Lat"]) ? r["Lat"] : null
          const lon = typeof r["Lon"] === "number" && Number.isFinite(r["Lon"]) ? r["Lon"] : null
          const altitudeM = num(r["Alt"])

          const tireTempLF = num(r["LFtempM"])
          const tireTempRF = num(r["RFtempM"])
          const tireTempLR = num(r["LRtempM"])
          const tireTempRR = num(r["RRtempM"])
          const tirePressureLF = num(r["LFpressure"])
          const tirePressureRF = num(r["RFpressure"])
          const tirePressureLR = num(r["LRpressure"])
          const tirePressureRR = num(r["RRpressure"])
          const tireWearLF = num(r["LFwearM"])
          const tireWearRF = num(r["RFwearM"])
          const tireWearLR = num(r["LRwearM"])
          const tireWearRR = num(r["RRwearM"])

          raw.push({
            sessionTime,
            lapDistKm: lapDistM / 1000,
            speedKmh: speedMs != null ? speedMs * 3.6 : null,
            throttlePct: throttle != null ? throttle * 100 : null,
            brakePct: brake != null ? brake * 100 : null,
            brakeABSactive,
            gear: gear != null ? gear : null,
            rpm: rpm != null ? rpm : null,
            steeringDeg: steerRad != null ? (steerRad * 180) / Math.PI : null,
            lat,
            lon,
            altitudeM,
            tireTempLF,
            tireTempRF,
            tireTempLR,
            tireTempRR,
            tirePressureLF,
            tirePressureRF,
            tirePressureLR,
            tirePressureRR,
            tireWearLF,
            tireWearRF,
            tireWearLR,
            tireWearRR,
          })
        }

        if (raw.length < 20) continue

        const sortedByTime = [...raw].sort((a, b) => a.sessionTime - b.sessionTime)
        const minTime = sortedByTime[0]!.sessionTime
        const minDist = Math.min(...raw.map((p) => p.lapDistKm))

        let lapTimeSec: number
        const preciseLapTime = lapTimesFromCrossings[lapKey]

        if (preciseLapTime != null && Number.isFinite(preciseLapTime) && preciseLapTime > 60 && preciseLapTime < 300) {
          lapTimeSec = preciseLapTime
        } else {
          const maxTime = Math.max(...raw.map((p) => p.sessionTime))
          lapTimeSec = maxTime - minTime
        }

        let sessionNum = hasSessionNum ? (lapSessionNums[lapKey] ?? null) : null
        let sessionInfo = sessionNum != null ? parsedSessions[sessionNum] : null
        let sessionType = sessionInfo?.sessionType

        if (sessionInfo?.resultsPositions && carIdx != null) {
          const carResult = sessionInfo.resultsPositions.find((pos) => pos.carIdx === carIdx)
          if (carResult && carResult.fastestLap === lapNumber && carResult.fastestTime > 0) {
            lapTimeSec = carResult.fastestTime
          }
        }

        const points: IbtLapPoint[] = raw
          .map((p) => ({
            distanceKm: p.lapDistKm - minDist,
            timeSec: p.sessionTime - minTime,
            speedKmh: p.speedKmh,
            throttlePct: p.throttlePct,
            brakePct: p.brakePct,
            brakeABSactive: p.brakeABSactive,
            gear: p.gear,
            rpm: p.rpm,
            steeringDeg: p.steeringDeg,
            lat: p.lat,
            lon: p.lon,
            altitudeM: p.altitudeM,
            tireTempLF: p.tireTempLF,
            tireTempRF: p.tireTempRF,
            tireTempLR: p.tireTempLR,
            tireTempRR: p.tireTempRR,
            tirePressureLF: p.tirePressureLF,
            tirePressureRF: p.tirePressureRF,
            tirePressureLR: p.tirePressureLR,
            tirePressureRR: p.tirePressureRR,
            tireWearLF: p.tireWearLF,
            tireWearRF: p.tireWearRF,
            tireWearLR: p.tireWearLR,
            tireWearRR: p.tireWearRR,
          }))
          .filter((p) => Number.isFinite(p.distanceKm) && p.distanceKm >= 0 && Number.isFinite(p.timeSec) && p.timeSec >= 0)

        if (points.length < 20) continue

        const byDist = [...points].sort((a, b) => a.distanceKm - b.distanceKm)
        const byTime = [...points].sort((a, b) => a.timeSec - b.timeSec)
        const distanceKm = Math.max(...byDist.map((p) => p.distanceKm))

        const officialTrackLengthKm = weekendInfoData?.trackLengthOfficial
          ? parseFloat(weekendInfoData.trackLengthOfficial.replace(/[^\d.]/g, ''))
          : weekendInfoData?.trackLength
          ? parseFloat(weekendInfoData.trackLength.replace(/[^\d.]/g, ''))
          : null
        
        const sectorTimes = calculateSectorTimes(
          { byDist, byTime, lapNumber, lapTimeSec, distanceKm, points: points.length, sectorTimes: [] },
          sectors,
          officialTrackLengthKm,
        )

        if (!sessionType && Object.keys(parsedSessions).length > 0) {
          const sessionEntries = Object.values(parsedSessions).sort((a, b) => a.sessionNum - b.sessionNum)

          if (sessionNum != null && !sessionInfo) {
            sessionInfo = parsedSessions[sessionNum]
            sessionType = sessionInfo?.sessionType
          }

          if (!sessionType && sessionEntries.length > 0) {
            if (sessionEntries.length > 1) {
              let cumulativeLaps = 0
              let foundSession = false

              for (const session of sessionEntries) {
                const sessionLaps = session.sessionLaps
                if (sessionLaps != null && typeof sessionLaps === 'number') {
                  if (lapNumber > cumulativeLaps && lapNumber <= cumulativeLaps + sessionLaps) {
                    sessionInfo = session
                    sessionType = session.sessionType
                    sessionNum = session.sessionNum ?? null
                    foundSession = true
                    break
                  }
                  cumulativeLaps += sessionLaps
                }
              }

              if (!foundSession) {
                const totalLaps = lapNums.length
                const lapIndex = lapNums.indexOf(lapKey)
                const lapRatio = totalLaps > 0 ? lapIndex / totalLaps : 0

                const sessionIndex = Math.min(
                  Math.floor(lapRatio * sessionEntries.length),
                  sessionEntries.length - 1
                )
                sessionInfo = sessionEntries[sessionIndex]
                sessionType = sessionInfo?.sessionType
                sessionNum = sessionInfo?.sessionNum ?? null
              }
            } else {
              sessionInfo = sessionEntries[0]
              sessionType = sessionInfo?.sessionType
              sessionNum = sessionInfo?.sessionNum ?? null
            }
          }
        }

        if (!sessionType && weekendInfoData?.sessionType && Object.keys(parsedSessions).length === 0) {
          sessionType = weekendInfoData.sessionType
        }

        lapDataByLap[lapKey] = {
          byDist,
          byTime,
          lapNumber,
          lapTimeSec,
          distanceKm,
          points: points.length,
          sectorTimes,
          sessionNum: sessionNum ?? undefined,
          sessionType: sessionType || undefined,
        }
      }

      const allLaps = Object.keys(lapDataByLap)
        .map((x) => Number(x))
        .filter((x) => Number.isFinite(x))
        .sort((a, b) => a - b)

      if (allLaps.length === 0) {
        throw new Error("Could not find usable laps in this .ibt (missing SessionTime/Lap/LapDist?)")
      }

      const maxDist = Math.max(...allLaps.map((lap) => lapDataByLap[lap]!.distanceKm))
      const completionThreshold = maxDist * 0.9
      const completedLaps = allLaps.filter((lap) => {
        const data = lapDataByLap[lap]!
        return (
          data.lapNumber !== 0 &&
          data.distanceKm >= completionThreshold &&
          data.lapTimeSec > 0 &&
          Number.isFinite(data.lapTimeSec)
        )
      })

      if (completedLaps.length === 0) {
        throw new Error("No completed laps found in this .ibt file. All laps appear to be incomplete.")
      }

      const completedLapData: Record<number, IbtLapData> = {}
      for (const lap of completedLaps) {
        completedLapData[lap] = lapDataByLap[lap]!
      }

      return {
        lapDataByLap: completedLapData,
        laps: completedLaps,
        sectorBoundaries: sectors,
        weekendInfo: weekendInfoData,
        sessionsByNum: parsedSessions,
        driverCarIdx: carIdx,
        sourceLabel: `${file.name} (stride ${stride}, tickRate ${header.tickRate})`,
      }
    },
    [],
  )

  const loadIbtFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return
      setIbtLoading(true)
      setIbtError(null)
      try {
        const parsedFiles: Array<Awaited<ReturnType<typeof parseIbtFile>>> = []
        const loadErrors: string[] = []

        for (const file of files) {
          try {
            const parsed = await parseIbtFile(file)
            parsedFiles.push(parsed)
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            loadErrors.push(`${file.name}: ${msg}`)
          }
        }

        if (parsedFiles.length === 0) {
          throw new Error(loadErrors[0] ?? "Failed to load telemetry files.")
        }

        const formatSessionLabel = (sessionType?: string) => {
          if (!sessionType) return null
          const normalized = sessionType.toLowerCase().trim()
          if (normalized.includes("race")) return "Race"
          if (normalized.includes("qualify")) return "Qualifying"
          if (normalized.includes("practice")) return "Practice"
          if (normalized.includes("warmup")) return "Warmup"
          if (normalized.includes("test")) return "Testing"
          return sessionType.charAt(0).toUpperCase() + sessionType.slice(1).toLowerCase()
        }

        const sessionTypeOrder = (sessionType: string) => {
          const normalized = sessionType.toLowerCase()
          if (normalized.includes("race")) return 0
          if (normalized.includes("qualify")) return 1
          if (normalized.includes("practice")) return 2
          if (normalized.includes("warmup")) return 3
          if (normalized.includes("test")) return 4
          return 5
        }

        let offset = 0
        const combinedLapData: Record<number, IbtLapData> = {}
        const combinedLaps: number[] = []
        const sessionTypes = new Set<string>()
        const weekendInfos: IbtWeekendInfo[] = []
        const subSessionIdSet = new Set<number>()
        let selectedSectorBoundaries: SectorBoundary[] = []
        let selectedSessionsByNum: Record<number, import("@/lib/ibt").IbtSessionInfo> = {}
        let selectedDriverCarIdx: number | null = null

        parsedFiles.forEach((parsed) => {
          if (parsed.sectorBoundaries.length > selectedSectorBoundaries.length) {
            selectedSectorBoundaries = parsed.sectorBoundaries
          }

          if (Object.keys(parsed.sessionsByNum).length > Object.keys(selectedSessionsByNum).length) {
            selectedSessionsByNum = parsed.sessionsByNum
          }

          if (selectedDriverCarIdx == null && parsed.driverCarIdx != null) {
            selectedDriverCarIdx = parsed.driverCarIdx
          }

          if (parsed.weekendInfo) {
            weekendInfos.push(parsed.weekendInfo)
            if (parsed.weekendInfo.subSessionID != null) {
              subSessionIdSet.add(parsed.weekendInfo.subSessionID)
            }
          }

          const lapKeys = parsed.laps
          if (lapKeys.length === 0) return
          const maxKey = Math.max(...lapKeys)

          for (const lapKey of lapKeys) {
            const nextKey = lapKey + offset
            combinedLapData[nextKey] = parsed.lapDataByLap[lapKey]!
            combinedLaps.push(nextKey)
            const sessionType = parsed.lapDataByLap[lapKey]?.sessionType
            if (sessionType) sessionTypes.add(sessionType)
          }

          offset += maxKey + 1
        })

        if (combinedLaps.length === 0) {
          throw new Error("No completed laps found in selected files.")
        }

        const sortedLaps = combinedLaps.sort((a, b) => a - b)
        const bestLap = sortedLaps.reduce((best, lap) => {
          const a = combinedLapData[best]!
          const b = combinedLapData[lap]!
          return b.lapTimeSec < a.lapTimeSec ? lap : best
        }, sortedLaps[0]!)

        const sessionLabels = Array.from(new Set(
          Array.from(sessionTypes)
            .map((type) => formatSessionLabel(type))
            .filter((value): value is string => Boolean(value))
        )).sort((a, b) => sessionTypeOrder(a) - sessionTypeOrder(b))

        const sourceLabel = parsedFiles.length === 1
          ? parsedFiles[0].sourceLabel
          : `${parsedFiles.length} sessions loaded${sessionLabels.length > 0 ? ` (${sessionLabels.join(", ")})` : ""}`

        const primaryWeekendInfo = weekendInfos.find((info) => info.sessionType?.toLowerCase().includes("race")) ?? weekendInfos[0] ?? null

        setSectorBoundaries(selectedSectorBoundaries)
        setSessionsByNum(selectedSessionsByNum)
        setDriverCarIdx(selectedDriverCarIdx)
        setWeekendInfo(primaryWeekendInfo)
        setSubSessionIds(Array.from(subSessionIdSet).sort((a, b) => a - b))
        setIbtLapDataByLap(combinedLapData)
        setIbtLaps(sortedLaps)
        setSelectedLaps([bestLap])
        setLapColors({ [bestLap]: LAP_COLOR_PALETTE[0] })
        setIbtSourceLabel(sourceLabel)
        cursorStore.setDistance(null)
        setZoomXMin(null)
        setZoomXMax(null)

        if (loadErrors.length > 0) {
          setIbtError(`Failed to load ${loadErrors.length} of ${files.length} files.`)
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        setIbtError(msg)
      } finally {
        setIbtLoading(false)
        setIbtProgress(null)
      }
    },
    [cursorStore, parseIbtFile],
  )

  const loadSample = useCallback(async () => {
    try {
      const samplePath = encodeURI(
        "/telemetry/acuransxevo22gt3_virginia 2022 full 2025-12-20 22-57-02.ibt",
      )
      const res = await fetch(samplePath)
      if (!res.ok) throw new Error(`Failed to fetch sample .ibt: ${res.status} ${res.statusText}`)
      const blob = await res.blob()
      const sampleFile = new File([blob], "Sample.ibt", { type: "application/octet-stream" })
      await loadIbtFiles([sampleFile])
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setIbtError(msg)
    }
  }, [loadIbtFiles])

  useEffect(() => {
    if (initialFiles && initialFiles.length > 0) {
      loadIbtFiles(initialFiles)
    }
  }, [initialFiles, loadIbtFiles])

  const getLapLabel = useCallback(
    (lap: number) => ibtLapDataByLap?.[lap]?.lapNumber ?? lap,
    [ibtLapDataByLap],
  )

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
    return prepareTelemetryData(ibtLapDataByLap, selectedLaps)
  }, [ibtLapDataByLap, selectedLaps])

  // Create series arrays for charts
  const speedSeries = useMemo<ChartSeries[]>(() => {
    return selectedLaps.map((lap) => ({
      key: `speed_${lap}`,
      label: `Lap ${getLapLabel(lap)}`,
      color: lapColors[lap] ?? LAP_COLOR_PALETTE[0],
    }))
  }, [selectedLaps, lapColors, getLapLabel])

  const throttleSeries = useMemo<ChartSeries[]>(() => {
    return selectedLaps.map((lap) => ({
      key: `throttle_${lap}`,
      label: `Lap ${getLapLabel(lap)}`,
      color: lapColors[lap] ?? LAP_COLOR_PALETTE[0],
    }))
  }, [selectedLaps, lapColors, getLapLabel])

  const brakeSeries = useMemo<ChartSeries[]>(() => {
    return selectedLaps.map((lap) => ({
      key: `brake_${lap}`,
      label: `Lap ${getLapLabel(lap)}`,
      color: lapColors[lap] ?? LAP_COLOR_PALETTE[0],
    }))
  }, [selectedLaps, lapColors, getLapLabel])

  const gearSeries = useMemo<ChartSeries[]>(() => {
    return selectedLaps.map((lap) => ({
      key: `gear_${lap}`,
      label: `Lap ${getLapLabel(lap)}`,
      color: lapColors[lap] ?? LAP_COLOR_PALETTE[0],
    }))
  }, [selectedLaps, lapColors, getLapLabel])

  const rpmSeries = useMemo<ChartSeries[]>(() => {
    return selectedLaps.map((lap) => ({
      key: `rpm_${lap}`,
      label: `Lap ${getLapLabel(lap)}`,
      color: lapColors[lap] ?? LAP_COLOR_PALETTE[0],
    }))
  }, [selectedLaps, lapColors, getLapLabel])

  const steeringSeries = useMemo<ChartSeries[]>(() => {
    return selectedLaps.map((lap) => ({
      key: `steering_${lap}`,
      label: `Lap ${getLapLabel(lap)}`,
      color: lapColors[lap] ?? LAP_COLOR_PALETTE[0],
    }))
  }, [selectedLaps, lapColors, getLapLabel])

  const lineDistSeries = useMemo<ChartSeries[]>(() => {
    return selectedLaps.slice(1).map((lap) => ({
      key: `lineDist_${lap}`,
      label: `Lap ${getLapLabel(lap)}`,
      color: lapColors[lap] ?? LAP_COLOR_PALETTE[0],
    }))
  }, [selectedLaps, lapColors, getLapLabel])

  const timeDeltaSeries = useMemo<ChartSeries[]>(() => {
    return selectedLaps.slice(1).map((lap) => ({
      key: `timeDelta_${lap}`,
      label: `Lap ${getLapLabel(lap)}`,
      color: lapColors[lap] ?? LAP_COLOR_PALETTE[0],
    }))
  }, [selectedLaps, lapColors, getLapLabel])

  // Tire series - each tire position for each lap
  const tireTempSeries = useMemo<ChartSeries[]>(() => {
    const series: ChartSeries[] = []
    const tireColors = ["#ef4444", "#3b82f6", "#10b981", "#f59e0b"] // Red, Blue, Green, Orange for LF, RF, LR, RR
    const tireLabels = ["LF", "RF", "LR", "RR"]

    for (const lap of selectedLaps) {
      for (let i = 0; i < 4; i++) {
        const tireKey = ["LF", "RF", "LR", "RR"][i]!
        series.push({
          key: `tireTemp${tireKey}_${lap}`,
          label: `Lap ${getLapLabel(lap)} ${tireLabels[i]}`,
          color: tireColors[i]!,
        })
      }
    }
    return series
  }, [selectedLaps, getLapLabel])

  const tirePressureSeries = useMemo<ChartSeries[]>(() => {
    const series: ChartSeries[] = []
    const tireColors = ["#ef4444", "#3b82f6", "#10b981", "#f59e0b"]
    const tireLabels = ["LF", "RF", "LR", "RR"]

    for (const lap of selectedLaps) {
      for (let i = 0; i < 4; i++) {
        const tireKey = ["LF", "RF", "LR", "RR"][i]!
        series.push({
          key: `tirePressure${tireKey}_${lap}`,
          label: `Lap ${getLapLabel(lap)} ${tireLabels[i]}`,
          color: tireColors[i]!,
        })
      }
    }
    return series
  }, [selectedLaps, getLapLabel])

  const tireWearSeries = useMemo<ChartSeries[]>(() => {
    const series: ChartSeries[] = []
    const tireColors = ["#ef4444", "#3b82f6", "#10b981", "#f59e0b"]
    const tireLabels = ["LF", "RF", "LR", "RR"]

    for (const lap of selectedLaps) {
      for (let i = 0; i < 4; i++) {
        const tireKey = ["LF", "RF", "LR", "RR"][i]!
        series.push({
          key: `tireWear${tireKey}_${lap}`,
          label: `Lap ${getLapLabel(lap)} ${tireLabels[i]}`,
          color: tireColors[i]!,
        })
      }
    }
    return series
  }, [selectedLaps, getLapLabel])

  // Memoized formatValue functions to prevent SyncedChart re-renders
  const formatDecimal1 = useCallback((v: number) => v.toFixed(1), [])
  const formatDecimal0 = useCallback((v: number) => v.toFixed(0), [])

  // Calculate ABS activation zones for brake chart
  const absZones = useMemo(() => {
    if (!telemetryData || telemetryData.length === 0) return []
    const zones: Array<{ x1: number; x2: number; color?: string }> = []

    for (const lap of selectedLaps) {
      const absKey = `brakeABSactive_${lap}`
      let zoneStart: number | null = null

      for (let i = 0; i < telemetryData.length; i++) {
        const point = telemetryData[i]
        if (!point || typeof point.distance !== "number") continue

        const absActive = point[absKey] === true

        if (absActive && zoneStart === null) {
          zoneStart = point.distance
        } else if (!absActive && zoneStart !== null) {
          zones.push({
            x1: zoneStart,
            x2: point.distance,
            color: lapColors[lap] ?? LAP_COLOR_PALETTE[0],
          })
          zoneStart = null
        }
      }

      if (zoneStart !== null && telemetryData.length > 0) {
        const lastPoint = telemetryData[telemetryData.length - 1]
        if (lastPoint && typeof lastPoint.distance === "number") {
          zones.push({
            x1: zoneStart,
            x2: lastPoint.distance,
            color: lapColors[lap] ?? LAP_COLOR_PALETTE[0],
          })
        }
      }
    }

    return zones
  }, [telemetryData, selectedLaps, lapColors])

  // Chart configuration map
  const chartConfigs = useMemo(() => {
    const configs: Record<ChartId, { title: string; unit?: string }> = {
      [CHART_IDS.SPEED]: { title: "Speed", unit: "km/h" },
      [CHART_IDS.THROTTLE]: { title: "Throttle", unit: "%" },
      [CHART_IDS.BRAKE]: { title: "Brake", unit: "%" },
      [CHART_IDS.GEAR]: { title: "Gear" },
      [CHART_IDS.RPM]: { title: "RPM", unit: "x1000" },
      [CHART_IDS.STEERING]: { title: "Steering", unit: "deg" },
      [CHART_IDS.TIME_DELTA]: { title: "Time Delta", unit: "sec" },
      [CHART_IDS.LINE_DIST]: { title: "Line Distance", unit: "m" },
      [CHART_IDS.TIRE_TEMP]: { title: "Tire Temperature", unit: "°C" },
      [CHART_IDS.TIRE_PRESSURE]: { title: "Tire Pressure", unit: "kPa" },
      [CHART_IDS.TIRE_WEAR]: { title: "Tire Wear", unit: "%" },
    }
    return configs
  }, [])

  // Render chart content based on chart ID
  const renderChartContent = useCallback((chartId: ChartId) => {
    const commonProps = {
      data: telemetryData,
      xMin: zoomXMin,
      xMax: zoomXMax,
      onZoomChange: handleZoomChange,
      originalXMax: originalXMax ?? undefined,
      margin: { top: 0, right: 0, left: 0, bottom: 0 } as const,
    }

    switch (chartId) {
      case CHART_IDS.SPEED:
        return (
          <SyncedChart
            {...commonProps}
            series={speedSeries}
            yDomain={[0, 250]}
            unit=" km/h"
            formatValue={formatDecimal1}
          />
        )
      case CHART_IDS.THROTTLE:
        return (
          <SyncedChart
            {...commonProps}
            series={throttleSeries}
            yDomain={[0, 100]}
            unit="%"
            formatValue={formatDecimal0}
          />
        )
      case CHART_IDS.BRAKE:
        return (
          <SyncedChart
            {...commonProps}
            series={brakeSeries}
            yDomain={[0, 100]}
            unit="%"
            formatValue={formatDecimal0}
            absZones={absZones}
          />
        )
      case CHART_IDS.GEAR:
        return (
          <SyncedChart
            {...commonProps}
            series={gearSeries}
            yDomain={[0, 7]}
            chartType="stepAfter"
            formatValue={formatDecimal0}
          />
        )
      case CHART_IDS.RPM:
        return (
          <SyncedChart
            {...commonProps}
            series={rpmSeries}
            yDomain={[2, 8]}
            unit=" rpm"
            formatValue={formatDecimal0}
          />
        )
      case CHART_IDS.STEERING:
        return (
          <SyncedChart
            {...commonProps}
            series={steeringSeries}
            yDomain={[-200, 200]}
            unit="°"
            formatValue={formatDecimal1}
          />
        )
      case CHART_IDS.TIME_DELTA:
        return (
          <SyncedChart
            {...commonProps}
            series={timeDeltaSeries}
            showYAxisRight={true}
            unit=" sec"
          />
        )
      case CHART_IDS.LINE_DIST:
        return (
          <SyncedChart
            {...commonProps}
            series={lineDistSeries}
            yDomain={[-15, 15]}
            showYAxisRight={true}
            unit=" m"
          />
        )
      case CHART_IDS.TIRE_TEMP:
        return (
          <SyncedChart
            {...commonProps}
            series={tireTempSeries}
            yDomain={[0, 150]}
            unit="°C"
            formatValue={formatDecimal1}
          />
        )
      case CHART_IDS.TIRE_PRESSURE:
        return (
          <SyncedChart
            {...commonProps}
            series={tirePressureSeries}
            yDomain={[0, 300]}
            unit=" kPa"
            formatValue={formatDecimal1}
          />
        )
      case CHART_IDS.TIRE_WEAR:
        return (
          <SyncedChart
            {...commonProps}
            series={tireWearSeries}
            yDomain={[0, 100]}
            unit="%"
            formatValue={formatDecimal1}
          />
        )
      default:
        return null
    }
  }, [
    telemetryData,
    zoomXMin,
    zoomXMax,
    handleZoomChange,
    originalXMax,
    speedSeries,
    throttleSeries,
    brakeSeries,
    gearSeries,
    rpmSeries,
    steeringSeries,
    timeDeltaSeries,
    lineDistSeries,
    tireTempSeries,
    tirePressureSeries,
    tireWearSeries,
    formatDecimal1,
    formatDecimal0,
  ])

  // Calculate summary statistics for reference lap
  const refLapStats = useMemo(() => {
    if (!ibtLapDataByLap || selectedLaps.length === 0) return null
    const refLap = selectedLaps[0]
    const refData = ibtLapDataByLap[refLap]
    if (!refData) return null

    const speeds = refData.byDist.map(p => p.speedKmh).filter((v): v is number => v != null)
    const throttles = refData.byDist.map(p => p.throttlePct).filter((v): v is number => v != null)
    const brakes = refData.byDist.map(p => p.brakePct).filter((v): v is number => v != null)
    const rpms = refData.byDist.map(p => p.rpm).filter((v): v is number => v != null)

    // Tire data
    const tireTempsLF = refData.byDist.map(p => p.tireTempLF).filter((v): v is number => v != null)
    const tireTempsRF = refData.byDist.map(p => p.tireTempRF).filter((v): v is number => v != null)
    const tireTempsLR = refData.byDist.map(p => p.tireTempLR).filter((v): v is number => v != null)
    const tireTempsRR = refData.byDist.map(p => p.tireTempRR).filter((v): v is number => v != null)
    const tirePressuresLF = refData.byDist.map(p => p.tirePressureLF).filter((v): v is number => v != null)
    const tirePressuresRF = refData.byDist.map(p => p.tirePressureRF).filter((v): v is number => v != null)
    const tirePressuresLR = refData.byDist.map(p => p.tirePressureLR).filter((v): v is number => v != null)
    const tirePressuresRR = refData.byDist.map(p => p.tirePressureRR).filter((v): v is number => v != null)

    return {
      lapTime: formatLapTime(refData.lapTimeSec),
      avgSpeed: speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0,
      maxSpeed: speeds.length > 0 ? Math.max(...speeds) : 0,
      avgThrottle: throttles.length > 0 ? throttles.reduce((a, b) => a + b, 0) / throttles.length : 0,
      avgBrake: brakes.length > 0 ? brakes.reduce((a, b) => a + b, 0) / brakes.length : 0,
      maxRpm: rpms.length > 0 ? Math.max(...rpms) : 0,
      distanceKm: refData.distanceKm,
      // Tire stats
      avgTireTempLF: tireTempsLF.length > 0 ? tireTempsLF.reduce((a, b) => a + b, 0) / tireTempsLF.length : null,
      avgTireTempRF: tireTempsRF.length > 0 ? tireTempsRF.reduce((a, b) => a + b, 0) / tireTempsRF.length : null,
      avgTireTempLR: tireTempsLR.length > 0 ? tireTempsLR.reduce((a, b) => a + b, 0) / tireTempsLR.length : null,
      avgTireTempRR: tireTempsRR.length > 0 ? tireTempsRR.reduce((a, b) => a + b, 0) / tireTempsRR.length : null,
      maxTireTemp: Math.max(
        tireTempsLF.length > 0 ? Math.max(...tireTempsLF) : 0,
        tireTempsRF.length > 0 ? Math.max(...tireTempsRF) : 0,
        tireTempsLR.length > 0 ? Math.max(...tireTempsLR) : 0,
        tireTempsRR.length > 0 ? Math.max(...tireTempsRR) : 0,
      ),
      avgTirePressureLF: tirePressuresLF.length > 0 ? tirePressuresLF.reduce((a, b) => a + b, 0) / tirePressuresLF.length : null,
      avgTirePressureRF: tirePressuresRF.length > 0 ? tirePressuresRF.reduce((a, b) => a + b, 0) / tirePressuresRF.length : null,
      avgTirePressureLR: tirePressuresLR.length > 0 ? tirePressuresLR.reduce((a, b) => a + b, 0) / tirePressuresLR.length : null,
      avgTirePressureRR: tirePressuresRR.length > 0 ? tirePressuresRR.reduce((a, b) => a + b, 0) / tirePressuresRR.length : null,
    }
  }, [ibtLapDataByLap, selectedLaps])

  return (
    <CursorStoreContext.Provider value={cursorStore}>
      <div className="relative flex h-full flex-col bg-background text-foreground overflow-hidden">
        {/* Global Ambience */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--primary-color),_transparent_50%)] opacity-20" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,_rgba(230,57,70,0.1),_transparent_50%)]" />

        {/* Top toolbar */}
        <header className="z-20 flex h-14 flex-shrink-0 items-center justify-between border-b border-border/40 bg-background/60 backdrop-blur-xl px-4 shadow-sm">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              className="group gap-2 text-muted-foreground hover:text-foreground hover:bg-primary/10 transition-all ml-1"
              onClick={onBackToStart}
            >
              <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
              <span className="font-medium">Overview</span>
            </Button>

            {ibtLapDataByLap && (
              <>
                <div className="h-4 w-px bg-border/60" />
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-2 py-1">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Mode</span>
                    <Select defaultValue="driving-style">
                      <SelectTrigger className="h-7 w-32 border-0 bg-transparent p-0 text-xs font-medium focus:ring-0 shadow-none data-[placeholder]:text-foreground">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="driving-style">Driving Style</SelectItem>
                        <SelectItem value="performance">Performance</SelectItem>
                        <SelectItem value="consistency">Consistency</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-4">
            {ibtLapDataByLap && (
              <div className="flex items-center gap-4 text-xs font-medium text-muted-foreground bg-muted/20 px-3 py-1.5 rounded-full border border-border/40">
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  <span className="tabular-nums text-foreground">{ibtLaps.length}</span>
                  <span className="opacity-70">Laps</span>
                </div>
                <div className="h-3 w-px bg-border/60" />
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  <span className="tabular-nums text-foreground">{selectedLaps.length}</span>
                  <span className="opacity-70">Selected</span>
                </div>
              </div>
            )}
            {ibtLapDataByLap && (weekendInfo?.sessionID != null || subSessionIds.length > 0) && (
              <div className="flex items-center gap-2 text-[10px] font-medium text-muted-foreground bg-muted/20 px-3 py-1.5 rounded-full border border-border/40">
                {weekendInfo?.sessionID != null && (
                  <span className="font-mono text-foreground/80">SessionID {weekendInfo.sessionID}</span>
                )}
                {subSessionIds.length > 0 && (
                  <span
                    className="font-mono text-foreground/80"
                    title={subSessionIds.length > 1 ? subSessionIds.join(", ") : undefined}
                  >
                    {subSessionIds.length === 1 ? `SubSessionID ${subSessionIds[0]}` : `SubSessions ${subSessionIds.length}`}
                  </span>
                )}
              </div>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-full"
            >
              {theme === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
              <span className="sr-only">Toggle theme</span>
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleResetLayout}
              className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-full"
              title="Reset layout"
            >
              <RotateCcw className="h-4 w-4" />
              <span className="sr-only">Reset layout</span>
            </Button>
            <Button variant="ghost" size="icon-sm" className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-full">
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </header>

        {/* Main content */}
        <div className="flex flex-1 overflow-hidden relative z-10">
          {/* Left sidebar - data source and lap selection */}
          <aside className="group grid w-[280px] flex-col border-r border-border/40 bg-background/40 backdrop-blur-md transition-all duration-300">
            <div className="flex flex-col h-full overflow-y-auto p-2 gap-2">
              <div className="rounded-xl border border-border/40 bg-card/30 p-1 shadow-sm">
                <TelemetrySourceInput
                  onFileSelect={(file) => loadIbtFiles([file])}
                  onLoadSample={loadSample}
                  onBackToStart={onBackToStart}
                  loading={ibtLoading}
                  sourceLabel={ibtSourceLabel}
                  progress={ibtProgress}
                  error={ibtError}
                />
              </div>

              {ibtLapDataByLap && (
                <div className="flex flex-1 flex-col gap-2 min-h-0">
                  <div className="flex-shrink-0 rounded-xl border border-border/40 bg-card/30 overflow-hidden shadow-sm hover:shadow-md transition-all">
                    <LapSelector
                      laps={ibtLaps}
                      selectedLaps={selectedLaps}
                      lapColors={lapColors}
                      lapDataByLap={ibtLapDataByLap}
                      onToggleLap={toggleLap}
                      onClearSelection={clearSelectedLaps}
                    />
                  </div>

                  <div className="flex-shrink-0 rounded-xl border border-border/40 bg-card/30 overflow-hidden shadow-sm hover:shadow-md transition-all">
                    <SessionInfo
                      selectedLaps={selectedLaps}
                      lapDataByLap={ibtLapDataByLap}
                      lapColors={lapColors}
                      weekendInfo={weekendInfo}
                      sessionsByNum={sessionsByNum}
                      driverCarIdx={driverCarIdx}
                    />
                  </div>
                </div>
              )}
            </div>
          </aside>

          {/* Center content */}
          <div className="flex flex-1 flex-col overflow-hidden bg-background/20 backdrop-blur-sm">
            {/* Summary stats bar */}
            {refLapStats && (
              <div className="border-b border-border/40 bg-background/50 backdrop-blur-md shadow-sm z-10">
                <LapStatsBar
                  lapTime={refLapStats.lapTime}
                  avgSpeed={refLapStats.avgSpeed}
                  maxSpeed={refLapStats.maxSpeed}
                  avgThrottle={refLapStats.avgThrottle}
                  avgBrake={refLapStats.avgBrake}
                  maxRpm={refLapStats.maxRpm}
                  hasZoom={zoomXMin != null || zoomXMax != null}
                  onResetZoom={handleResetZoom}
                />
              </div>
            )}

            {/* Main content area - optimized 2 column layout */}
            <div className="flex flex-1 overflow-hidden">
              {/* Left: Track map and legend */}
              <div className="flex flex-col w-[300px] border-r border-border/40 bg-background/30 backdrop-blur-sm transition-all duration-300">
                {/* Track map */}
                <div className="relative flex-shrink-0 h-64 border-b border-border/40 bg-gradient-to-b from-background/50 to-background/20">
                  <div className="absolute left-4 top-4 z-10">
                    <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-background/80 backdrop-blur-md border border-border/40 shadow-sm">
                      <MapIcon className="h-3.5 w-3.5 text-primary" />
                      <span className="text-[10px] font-bold text-foreground/80 uppercase tracking-widest">Track Map</span>
                    </div>
                  </div>
                  <div className="w-full h-full p-2">
                    {ibtLapDataByLap ? (
                      <Suspense fallback={
                        <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
                          <div className="h-5 w-5 border-2 border-primary/50 border-t-transparent rounded-full animate-spin mr-2" />
                          Loading map...
                        </div>
                      }>
                        <TrackMap
                          lapDataByLap={ibtLapDataByLap}
                          selectedLaps={selectedLaps}
                          lapColors={lapColors}
                          zoomXMin={zoomXMin}
                          zoomXMax={zoomXMax}
                          trackMap={trackMap}
                          surfaceStyle={trackMap ? "merged" : "default"}
                        />
                      </Suspense>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <div className="text-center md:opacity-50">
                          <MapIcon className="h-10 w-10 mx-auto mb-2 text-muted-foreground/30" />
                          <p className="text-xs text-muted-foreground/50 uppercase tracking-widest">No Data</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Legend and Sector Times */}
                {ibtLapDataByLap && (
                  <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2">
                    <div className="flex-shrink-0 rounded-xl border border-border/30 bg-card/20 p-1">
                      <LapComparisonLegend
                        selectedLaps={selectedLaps}
                        lapDataByLap={ibtLapDataByLap}
                        lapColors={lapColors}
                        sectorBoundaries={sectorBoundaries}
                      />
                    </div>
                    <div className="flex-shrink-0 rounded-xl border border-border/30 bg-card/20 overflow-hidden shadow-sm hover:shadow-md transition-all">
                      <SectorTimesTable
                        selectedLaps={selectedLaps}
                        lapDataByLap={ibtLapDataByLap}
                        lapColors={lapColors}
                        sectorBoundaries={sectorBoundaries}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Right: Charts area */}
              <div className="flex flex-1 flex-col overflow-hidden bg-background/10">
                {ibtLapDataByLap ? (
                  <>
                    {/* Charts container with scroll if needed */}
                    <div className="flex-1 flex flex-col overflow-y-auto scrollbar-thin scrollbar-thumb-border/40">
                      {/* Draggable charts grid */}
                      <ResponsiveGridLayout
                        layouts={chartLayouts}
                        onLayoutChange={handleLayoutChange}
                        onDragStop={(layout) => handleLayoutCommit(layout)}
                        onResizeStop={(layout) => handleLayoutCommit(layout)}
                        breakpoints={GRID_BREAKPOINTS}
                        cols={GRID_COLUMNS}
                        rowHeight={GRID_ROW_HEIGHT}
                        margin={[GRID_MARGIN, GRID_MARGIN]}
                        containerPadding={[0, 0]}
                        draggableHandle=".chart-drag-handle"
                        isResizable
                        isDraggable
                        compactType="vertical"
                        resizeHandles={["se"]}
                        resizeHandle={(
                          handleAxis: "s" | "w" | "e" | "n" | "sw" | "nw" | "se" | "ne",
                          ref: Ref<HTMLElement>,
                        ) => (
                          <span
                            ref={ref}
                            className={`react-resizable-handle react-resizable-handle-${handleAxis} absolute bottom-2 right-2 h-2.5 w-2.5 rounded-sm border border-border/60 bg-muted/60 opacity-70 transition-opacity group-hover:opacity-100 cursor-se-resize`}
                          />
                        )}
                        className="flex-1 min-h-0 p-4 pb-20"
                      >
                        {chartOrder.map((chartId) => {
                          const config = chartConfigs[chartId]

                          return (
                            <div key={chartId} className="min-h-[160px] h-full group">
                              <DraggableChart
                                title={config.title}
                                unit={config.unit}
                                handle={(
                                  <div className="chart-drag-handle opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing touch-none select-none p-0.5 hover:bg-muted rounded">
                                    <GripVertical className="h-3 w-3 text-muted-foreground" />
                                  </div>
                                )}
                                className="h-full rounded-xl border border-border/40 bg-card/50 backdrop-blur-sm shadow-sm hover:shadow-md transition-all group"
                              >
                                <Suspense fallback={
                                  <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
                                    <span className="animate-pulse">Loading...</span>
                                  </div>
                                }>
                                  {renderChartContent(chartId)}
                                </Suspense>
                              </DraggableChart>
                            </div>
                          )
                        })}
                      </ResponsiveGridLayout>

                      {/* Sector indicators at bottom */}
                      <div className="sticky bottom-0 bg-background/80 backdrop-blur-xl border-t border-border/40 p-3 z-10 mx-4 mb-4 rounded-xl border shadow-lg">
                        <SectorIndicators
                          sectorBoundaries={sectorBoundaries}
                          selectedLaps={selectedLaps}
                          lapDataByLap={ibtLapDataByLap}
                          officialTrackLengthKm={
                            weekendInfo?.trackLengthOfficial
                              ? parseFloat(weekendInfo.trackLengthOfficial.replace(/[^\d.]/g, ''))
                              : weekendInfo?.trackLength
                              ? parseFloat(weekendInfo.trackLength.replace(/[^\d.]/g, ''))
                              : null
                          }
                          onSectorClick={handleSectorClick}
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  /* Empty state - when no data loaded */
                  <div className="flex-1 flex items-center justify-center">
                    <div className="relative overflow-hidden rounded-2xl border border-border/40 bg-card/30 backdrop-blur-xl p-10 text-center shadow-2xl max-w-lg w-full">
                      <div className="space-y-6">
                        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 shadow-inner">
                          <Upload className="h-10 w-10 text-primary/60" />
                        </div>
                        <div className="space-y-2">
                          <h3 className="text-2xl font-bold tracking-tight">Telemetry Analysis</h3>
                          <p className="text-sm text-muted-foreground leading-relaxed">
                            Upload an iRacing .ibt file to visualize lap times, compare vehicle inputs, and analyze cornering performance in detail.
                          </p>
                        </div>

                        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4">
                          <Button
                            onClick={loadSample}
                            disabled={ibtLoading}
                            variant="secondary"
                            className="w-full sm:w-auto gap-2 h-11"
                          >
                            <FileText className="h-4 w-4" />
                            Load Sample Data
                          </Button>
                          <span className="text-xs text-muted-foreground font-medium uppercase tracking-widest">OR</span>
                          <Button
                            className="w-full sm:w-auto gap-2 h-11 shadow-lg shadow-primary/20"
                            onClick={() => document.getElementById('ibt-file-input')?.click()}
                            disabled={ibtLoading}
                          >
                            <Upload className="h-4 w-4" />
                            Upload .ibt File
                          </Button>
                        </div>

                        <input
                          id="ibt-file-input"
                          type="file"
                          accept=".ibt"
                          className="hidden"
                          disabled={ibtLoading}
                          onChange={(e) => {
                            const f = e.currentTarget.files?.[0]
                            if (!f) return
                            loadIbtFiles([f])
                          }}
                        />
                      </div>

                      {ibtLoading && (
                        <div className="mt-8 rounded-lg bg-background/40 p-4 backdrop-blur-sm border border-border/30">
                          <div className="flex items-center justify-center gap-3 text-sm font-medium">
                            <Loader2 className="h-5 w-5 animate-spin text-primary" />
                            <span>Processing telemetry...</span>
                          </div>
                          {ibtProgress && (
                            <div className="mt-2 text-xs text-muted-foreground font-mono">
                              {Math.round((ibtProgress.processedRecords / ibtProgress.totalRecords) * 100)}% complete
                            </div>
                          )}
                        </div>
                      )}

                      {ibtError && (
                        <div className="mt-6 p-4 rounded-xl bg-destructive/5 border border-destructive/20 text-left animate-in fade-in slide-in-from-bottom-2">
                          <div className="flex items-start gap-3">
                            <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                            <div>
                              <p className="text-sm font-semibold text-destructive">Unable to load file</p>
                              <p className="text-xs text-destructive/80 mt-1">{ibtError}</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="z-20 flex h-8 items-center justify-between border-t border-border/40 bg-background/60 backdrop-blur-xl px-4 text-[10px] text-muted-foreground/80 font-medium">
          <div className="flex items-center gap-2">
            <span className="font-bold text-foreground/80 tracking-wide">CAE</span>
            <span className="hidden sm:inline">Telemetry Engine v1.0</span>
          </div>
          <div className="flex items-center gap-4">
            {ibtSourceLabel && (
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-muted/30 border border-border/20">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/50" />
                <span className="font-mono opacity-80">{ibtSourceLabel}</span>
              </div>
            )}
          </div>
        </footer>
      </div>
    </CursorStoreContext.Provider>
  )
}
