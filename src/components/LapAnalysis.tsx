import { useState, useCallback, useMemo, useRef } from "react"
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Bell,
  HelpCircle,
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
import { readIbtHeader, readIbtSamples, readIbtVarHeaders, readIbtSessionInfoYaml, type IbtValue } from "@/lib/ibt"
import { createCursorStore, CursorStoreContext } from "@/lib/cursorStore"
import { formatLapTime } from "@/lib/telemetry-utils"
import { parseSectorBoundaries, calculateSectorTimes } from "@/lib/sector-utils"
import { SyncedChart } from "@/components/telemetry/SyncedChart"
import type { ChartSeries } from "@/components/telemetry/types"
import { TrackMap } from "@/components/track/TrackMap"
import { TelemetrySourceInput } from "@/components/lap-analysis/TelemetrySourceInput"
import { LapSelector } from "@/components/lap-analysis/LapSelector"
import { SelectedLapsSummary } from "@/components/lap-analysis/SelectedLapsSummary"
import { SectorTimesTable } from "@/components/lap-analysis/SectorTimesTable"
import { LapStatsBar } from "@/components/lap-analysis/LapStatsBar"
import { LapComparisonLegend } from "@/components/lap-analysis/LapComparisonLegend"
import { SectorIndicators } from "@/components/lap-analysis/SectorIndicators"
import { prepareTelemetryData } from "@/components/lap-analysis/telemetry-data-utils"
import { LAP_COLOR_PALETTE } from "@/components/lap-analysis/constants"
import type { IbtLapData, IbtLapPoint, SectorBoundary } from "@/components/lap-analysis/types"

export function LapAnalysis() {
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

  // Memoized formatValue functions to prevent SyncedChart re-renders
  const formatDecimal1 = useCallback((v: number) => v.toFixed(1), [])
  const formatDecimal0 = useCallback((v: number) => v.toFixed(0), [])

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

    return {
      lapTime: formatLapTime(refData.lapTimeSec),
      avgSpeed: speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0,
      maxSpeed: speeds.length > 0 ? Math.max(...speeds) : 0,
      avgThrottle: throttles.length > 0 ? throttles.reduce((a, b) => a + b, 0) / throttles.length : 0,
      avgBrake: brakes.length > 0 ? brakes.reduce((a, b) => a + b, 0) / brakes.length : 0,
      maxRpm: rpms.length > 0 ? Math.max(...rpms) : 0,
      distanceKm: refData.distanceKm,
    }
  }, [ibtLapDataByLap, selectedLaps])

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
        <aside className="flex w-64 flex-col border-r border-border overflow-y-auto">
          <TelemetrySourceInput
            onFileSelect={(file) => loadIbt(file, file.name)}
            onLoadSample={loadSample}
            loading={ibtLoading}
            sourceLabel={ibtSourceLabel}
            progress={ibtProgress}
            error={ibtError}
          />

          <LapSelector
            laps={ibtLaps}
            selectedLaps={selectedLaps}
            lapColors={lapColors}
            lapDataByLap={ibtLapDataByLap}
            onToggleLap={toggleLap}
            onClearSelection={clearSelectedLaps}
          />

          <SelectedLapsSummary
            selectedLaps={selectedLaps}
            lapDataByLap={ibtLapDataByLap}
            lapColors={lapColors}
          />

          <Separator />

          <SectorTimesTable
            selectedLaps={selectedLaps}
            lapDataByLap={ibtLapDataByLap}
            lapColors={lapColors}
            sectorBoundaries={sectorBoundaries}
          />
        </aside>

        {/* Center content */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Summary stats bar */}
          {refLapStats && (
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
          )}

          {/* Main content area - 2 column layout */}
          <div className="flex flex-1 overflow-hidden">
            {/* Left: Track map */}
            <div className="flex flex-col w-80 border-r border-border">
              <div className="relative flex-shrink-0 h-64 border-b border-border p-2">
                <div className="absolute left-2 top-2 z-10">
                  <Button variant="outline" size="icon-xs" className="h-5 w-5">
                    <span className="text-[8px]">≡</span>
                  </Button>
                </div>
                <div className="w-full h-full">
                  <TrackMap 
                    lapDataByLap={ibtLapDataByLap} 
                    selectedLaps={selectedLaps} 
                    lapColors={lapColors}
                  />
                </div>
              </div>

              <LapComparisonLegend
                selectedLaps={selectedLaps}
                lapDataByLap={ibtLapDataByLap}
                lapColors={lapColors}
                sectorBoundaries={sectorBoundaries}
              />
            </div>

            {/* Right: Charts area */}
            <div className="flex flex-1 flex-col overflow-hidden">
              <div className="flex flex-1">
                {/* Main comparison charts - top row */}
                <div className="flex-1 flex flex-col min-w-0">
                  {/* Speed chart - largest */}
                  <div className="flex-1 border-b border-border p-2 overflow-hidden min-h-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted-foreground font-medium">Speed</span>
                    </div>
                    <div className="h-[calc(100%-20px)] min-h-0">
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
                    </div>
                  </div>

                  {/* Throttle & Brake row */}
                  <div className="h-40 border-b border-border flex">
                    <div className="flex-1 border-r border-border p-2 overflow-hidden">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-muted-foreground font-medium">Throttle</span>
                      </div>
                      <div className="h-[calc(100%-20px)]">
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
                      </div>
                    </div>
                    <div className="flex-1 p-2 overflow-hidden">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-muted-foreground font-medium">Brake</span>
                      </div>
                      <div className="h-[calc(100%-20px)]">
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
                      </div>
                    </div>
                  </div>

                  {/* Time delta & Line distance row */}
                  <div className="h-40 flex">
                    <div className="flex-1 border-r border-border p-2 overflow-hidden">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-muted-foreground font-medium">Time Delta</span>
                      </div>
                      <div className="h-[calc(100%-20px)]">
                        <SyncedChart
                          data={telemetryData}
                          series={timeDeltaSeries}
                          showYAxisRight={true}
                          unit=" sec"
                          xMin={zoomXMin}
                          xMax={zoomXMax}
                          onZoomChange={handleZoomChange}
                          originalXMax={originalXMax ?? undefined}
                        />
                      </div>
                    </div>
                    <div className="flex-1 p-2 overflow-hidden">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-muted-foreground font-medium">Line Distance</span>
                      </div>
                      <div className="h-[calc(100%-20px)]">
                        <SyncedChart
                          data={telemetryData}
                          series={lineDistSeries}
                          yDomain={[-15, 15]}
                          showYAxisRight={true}
                          unit=" m"
                          xMin={zoomXMin}
                          xMax={zoomXMax}
                          onZoomChange={handleZoomChange}
                          originalXMax={originalXMax ?? undefined}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right column: Gear, RPM, Steering */}
                <div className="w-64 border-l border-border flex flex-col">
                  <div className="flex-1 border-b border-border p-2 overflow-hidden min-h-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted-foreground font-medium">Gear</span>
                    </div>
                    <div className="h-[calc(100%-20px)]">
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
                    </div>
                  </div>
                  <div className="flex-1 border-b border-border p-2 overflow-hidden min-h-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted-foreground font-medium">RPM</span>
                    </div>
                    <div className="h-[calc(100%-20px)]">
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
                    </div>
                  </div>
                  <div className="flex-1 p-2 overflow-hidden min-h-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted-foreground font-medium">Steering</span>
                    </div>
                    <div className="h-[calc(100%-20px)]">
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
                    </div>
                  </div>
                </div>
              </div>

              <SectorIndicators sectorBoundaries={sectorBoundaries} />
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
    </CursorStoreContext.Provider>
  )
}
