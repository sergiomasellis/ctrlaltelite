import { useState, useCallback, useMemo, useRef, Suspense, lazy, useEffect } from "react"
import {
  Upload,
  FileText,
  Settings,
  Map,
  AlertCircle,
  ArrowLeft,
  Loader2,
  Sun,
  Moon,
} from "lucide-react"
import { useTheme } from "@/lib/theme-provider"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { readIbtHeader, readIbtSamples, readIbtVarHeaders, readIbtSessionInfoYaml, type IbtValue } from "@/lib/ibt"
import { createCursorStore, CursorStoreContext } from "@/lib/cursorStore"
import { formatLapTime } from "@/lib/telemetry-utils"
import { parseSectorBoundaries, calculateSectorTimes } from "@/lib/sector-utils"
import type { ChartSeries } from "@/components/telemetry/types"
import { TelemetrySourceInput } from "@/components/lap-analysis/TelemetrySourceInput"
import { LapSelector } from "@/components/lap-analysis/LapSelector"
import { SectorTimesTable } from "@/components/lap-analysis/SectorTimesTable"
import { LapStatsBar } from "@/components/lap-analysis/LapStatsBar"
import { LapComparisonLegend } from "@/components/lap-analysis/LapComparisonLegend"
import { SectorIndicators } from "@/components/lap-analysis/SectorIndicators"
import { prepareTelemetryData } from "@/components/lap-analysis/telemetry-data-utils"
import { LAP_COLOR_PALETTE } from "@/components/lap-analysis/constants"
import type { IbtLapData, IbtLapPoint, SectorBoundary } from "@/components/lap-analysis/types"
import { DraggableChart } from "@/components/telemetry/DraggableChart"

// Lazy load chart component for better initial load
const SyncedChart = lazy(() => import("@/components/telemetry/SyncedChart").then(module => ({ default: module.SyncedChart })))
const TrackMap = lazy(() => import("@/components/track/TrackMap3D").then(module => ({ default: module.TrackMap3D })))

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

// Default chart order
const DEFAULT_CHART_ORDER: ChartId[] = [
  CHART_IDS.SPEED,
  CHART_IDS.THROTTLE,
  CHART_IDS.BRAKE,
  CHART_IDS.TIME_DELTA,
  CHART_IDS.LINE_DIST,
  CHART_IDS.GEAR,
  CHART_IDS.RPM,
  CHART_IDS.STEERING,
  CHART_IDS.TIRE_TEMP,
  CHART_IDS.TIRE_PRESSURE,
  CHART_IDS.TIRE_WEAR,
]

interface LapAnalysisProps {
  initialFile?: File | null
  onBackToStart?: () => void
}

export function LapAnalysis({ initialFile, onBackToStart }: LapAnalysisProps = {}) {
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

  // Chart order state
  const [chartOrder, setChartOrder] = useState<ChartId[]>(DEFAULT_CHART_ORDER)
  const [draggingChartId, setDraggingChartId] = useState<ChartId | null>(null)
  const [dragOverChartId, setDragOverChartId] = useState<ChartId | null>(null)

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

  const handleSectorClick = useCallback((sectorStartKm: number, sectorEndKm: number) => {
    setZoomXMin(sectorStartKm)
    setZoomXMax(sectorEndKm)
  }, [])

  // Drag and drop handlers
  const handleDragStart = useCallback((id: string) => {
    setDraggingChartId(id as ChartId)
  }, [])

  const handleDragEnd = useCallback(() => {
    setDraggingChartId(null)
    setDragOverChartId(null)
  }, [])

  const handleDragOver = useCallback((id: string) => {
    setDragOverChartId(id as ChartId)
  }, [])

  const handleDrop = useCallback((draggedId: string, targetId: string) => {
    const dragged = draggedId as ChartId
    const target = targetId as ChartId
    if (dragged === target) {
      setDragOverChartId(null)
      return
    }

    setChartOrder((prev) => {
      const newOrder = [...prev]
      const draggedIndex = newOrder.indexOf(dragged)
      const targetIndex = newOrder.indexOf(target)

      if (draggedIndex === -1 || targetIndex === -1) return prev

      newOrder.splice(draggedIndex, 1)
      newOrder.splice(targetIndex, 0, dragged)
      return newOrder
    })
    setDragOverChartId(null)
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
            brakeABSactive: boolean | null
            gear: number | null
            rpm: number | null
            steeringDeg: number | null
            lat: number | null
            lon: number | null
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

            // Tire data
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

          const minTime = Math.min(...raw.map((p) => p.sessionTime))
          const minDist = Math.min(...raw.map((p) => p.lapDistKm))

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
    [cursorStore],
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

  useEffect(() => {
    if (initialFile) {
      loadIbt(initialFile, initialFile.name)
    }
  }, [initialFile, loadIbt])

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
          label: `Lap ${lap} ${tireLabels[i]}`,
          color: tireColors[i]!,
        })
      }
    }
    return series
  }, [selectedLaps])

  const tirePressureSeries = useMemo<ChartSeries[]>(() => {
    const series: ChartSeries[] = []
    const tireColors = ["#ef4444", "#3b82f6", "#10b981", "#f59e0b"]
    const tireLabels = ["LF", "RF", "LR", "RR"]

    for (const lap of selectedLaps) {
      for (let i = 0; i < 4; i++) {
        const tireKey = ["LF", "RF", "LR", "RR"][i]!
        series.push({
          key: `tirePressure${tireKey}_${lap}`,
          label: `Lap ${lap} ${tireLabels[i]}`,
          color: tireColors[i]!,
        })
      }
    }
    return series
  }, [selectedLaps])

  const tireWearSeries = useMemo<ChartSeries[]>(() => {
    const series: ChartSeries[] = []
    const tireColors = ["#ef4444", "#3b82f6", "#10b981", "#f59e0b"]
    const tireLabels = ["LF", "RF", "LR", "RR"]

    for (const lap of selectedLaps) {
      for (let i = 0; i < 4; i++) {
        const tireKey = ["LF", "RF", "LR", "RR"][i]!
        series.push({
          key: `tireWear${tireKey}_${lap}`,
          label: `Lap ${lap} ${tireLabels[i]}`,
          color: tireColors[i]!,
        })
      }
    }
    return series
  }, [selectedLaps])

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
                  onFileSelect={(file) => loadIbt(file, file.name)}
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

                  <div className="flex-1 rounded-xl border border-border/40 bg-card/30 overflow-hidden shadow-sm hover:shadow-md transition-all">
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
                      <Map className="h-3.5 w-3.5 text-primary" />
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
                        />
                      </Suspense>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <div className="text-center md:opacity-50">
                          <Map className="h-10 w-10 mx-auto mb-2 text-muted-foreground/30" />
                          <p className="text-xs text-muted-foreground/50 uppercase tracking-widest">No Data</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Legend */}
                {ibtLapDataByLap && (
                  <div className="flex-1 overflow-y-auto p-2">
                    <div className="h-full rounded-xl border border-border/30 bg-card/20 p-1">
                      <LapComparisonLegend
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
                      <div
                        className="grid grid-cols-2 lg:grid-cols-2 xl:grid-cols-2 auto-rows-min gap-4 p-4 flex-1 pb-20"
                        onDragLeave={(e) => {
                          const relatedTarget = e.relatedTarget as HTMLElement
                          if (!e.currentTarget.contains(relatedTarget)) {
                            setDragOverChartId(null)
                          }
                        }}
                      >
                        {chartOrder.map((chartId) => {
                          const config = chartConfigs[chartId]
                          const isSpeedChart = chartId === CHART_IDS.SPEED
                          const colSpan = isSpeedChart ? "col-span-2" : "col-span-1"
                          const minHeight = isSpeedChart ? "min-h-[220px]" : "min-h-[160px]"

                          return (
                            <DraggableChart
                              key={chartId}
                              id={chartId}
                              title={config.title}
                              unit={config.unit}
                              onDragStart={handleDragStart}
                              onDragEnd={handleDragEnd}
                              onDragOver={handleDragOver}
                              onDrop={handleDrop}
                              isDragging={draggingChartId === chartId}
                              dragOverId={dragOverChartId}
                              className={`${colSpan} ${minHeight} rounded-xl border border-border/40 bg-card/50 backdrop-blur-sm shadow-sm hover:shadow-md transition-all group`}
                            >
                              <Suspense fallback={
                                <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
                                  <span className="animate-pulse">Loading...</span>
                                </div>
                              }>
                                {renderChartContent(chartId)}
                              </Suspense>
                            </DraggableChart>
                          )
                        })}
                      </div>

                      {/* Sector indicators at bottom */}
                      <div className="sticky bottom-0 bg-background/80 backdrop-blur-xl border-t border-border/40 p-3 z-10 mx-4 mb-4 rounded-xl border shadow-lg">
                        <SectorIndicators
                          sectorBoundaries={sectorBoundaries}
                          selectedLaps={selectedLaps}
                          lapDataByLap={ibtLapDataByLap}
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
                            loadIbt(f, f.name)
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
