import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AlertCircle, ArrowLeft, FileText, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { TrackMap3D } from "@/components/track/TrackMap3D"
import { LAP_COLOR_PALETTE } from "@/components/lap-analysis/constants"
import type { IbtLapData, IbtLapPoint } from "@/components/lap-analysis/types"
import type { TrackMapCorner, TrackMapData } from "@/components/track/types"
import {
  readIbtHeader,
  readIbtSamples,
  readIbtSessionInfoYaml,
  readIbtVarHeaders,
  parseWeekendInfoFromYaml,
  type IbtValue,
  type IbtWeekendInfo,
} from "@/lib/ibt"
import { buildTrackMapData, createTrackKey } from "@/lib/track-map-utils"

type TrackDesignerProps = {
  onExit?: () => void
}

export function TrackDesigner({ onExit }: TrackDesignerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [sourceLabel, setSourceLabel] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState<{ processedRecords: number; totalRecords: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lapDataByLap, setLapDataByLap] = useState<Record<number, IbtLapData> | null>(null)
  const [laps, setLaps] = useState<number[]>([])
  const [leftLap, setLeftLap] = useState<number | null>(null)
  const [rightLap, setRightLap] = useState<number | null>(null)
  const [previewTrackMapData, setPreviewTrackMapData] = useState<TrackMapData | null>(null)
  const [trackMapData, setTrackMapData] = useState<TrackMapData | null>(null)
  const [trackMapError, setTrackMapError] = useState<string | null>(null)
  const [weekendInfo, setWeekendInfo] = useState<IbtWeekendInfo | null>(null)
  const [trackKey, setTrackKey] = useState<string | null>(null)
  const [previewMode, setPreviewMode] = useState<"edges" | "merged">("edges")
  const [corners, setCorners] = useState<TrackMapCorner[]>([])
  const [cornerError, setCornerError] = useState<string | null>(null)

  const previewLaps = useMemo(() => {
    if (leftLap == null && rightLap == null) return []
    if (leftLap != null && rightLap != null && leftLap !== rightLap) return [leftLap, rightLap]
    return [leftLap ?? rightLap!]
  }, [leftLap, rightLap])

  const lapColors = useMemo(() => {
    const colors: Record<number, string> = {}
    if (leftLap != null) colors[leftLap] = LAP_COLOR_PALETTE[0]
    if (rightLap != null) colors[rightLap] = LAP_COLOR_PALETTE[1] ?? LAP_COLOR_PALETTE[0]
    return colors
  }, [leftLap, rightLap])

  const handleFilePick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const parseIbtFile = useCallback(async (file: File) => {
    setLoading(true)
    setError(null)
    setTrackMapError(null)
    setCornerError(null)
    setProgress({ processedRecords: 0, totalRecords: 1 })
    setLapDataByLap(null)
    setLaps([])
    setLeftLap(null)
    setRightLap(null)
    setPreviewTrackMapData(null)
    setTrackMapData(null)
    setCorners([])
    setWeekendInfo(null)
    setTrackKey(null)
    setSourceLabel(file.name)

    try {
      const header = await readIbtHeader(file)
      const vars = await readIbtVarHeaders(file, header)
      const sessionYaml = await readIbtSessionInfoYaml(file, header)
      const weekendInfoData = parseWeekendInfoFromYaml(sessionYaml)
      const derivedTrackKey = createTrackKey(weekendInfoData)

      const driverCarIdxMatch = sessionYaml.match(/DriverCarIdx:\s*(\d+)/)
      const driverCarIdx = driverCarIdxMatch ? parseInt(driverCarIdxMatch[1], 10) : null

      const hasSessionNum = vars.some((v) => v.name.toLowerCase() === "sessionnum")
      const hasPlayerCarIdx = vars.some((v) => v.name.toLowerCase() === "playercaridx")
      const hasAltitude = vars.some((v) => v.name.toLowerCase() === "alt")

      const recordCount =
        header.diskSubHeader?.recordCount ??
        Math.floor((file.size - (header.sessionInfoOffset + header.sessionInfoLen)) / header.bufLen)

      const targetPoints = 12_000
      const stride = Math.max(1, Math.floor(recordCount / targetPoints))

      const varNames = ["SessionTime", "Lap", "LapDist", "Lat", "Lon"]
      if (hasSessionNum) varNames.push("SessionNum")
      if (hasPlayerCarIdx) varNames.push("PlayerCarIdx")
      if (hasAltitude) varNames.push("Alt")

      const rows = await readIbtSamples(file, header, vars, {
        varNames,
        stride,
        onProgress: (p) => setProgress(p),
      })

      const num = (v: IbtValue): number | null =>
        typeof v === "number" && Number.isFinite(v) ? v : null

      const makeLapKey = (lap: number, sessionNum: number | null) =>
        hasSessionNum && sessionNum != null ? sessionNum * 10_000 + lap : lap

      const byLap: Record<number, Array<{ timeSec: number; lapDistKm: number; lat: number; lon: number; altitudeM: number | null }>> = {}
      const lapNumbers: Record<number, number> = {}

      for (const row of rows) {
        if (hasPlayerCarIdx && driverCarIdx != null) {
          const rowCarIdx = num(row["PlayerCarIdx"])
          if (rowCarIdx == null || rowCarIdx !== driverCarIdx) continue
        }

        const lap = num(row["Lap"])
        if (lap == null) continue

        const sessionNum = hasSessionNum ? num(row["SessionNum"]) : null
        const lapKey = makeLapKey(lap, sessionNum)
        const lapDistM = num(row["LapDist"])
        const lat = typeof row["Lat"] === "number" && Number.isFinite(row["Lat"]) ? row["Lat"] : null
        const lon = typeof row["Lon"] === "number" && Number.isFinite(row["Lon"]) ? row["Lon"] : null
        const altitudeM = num(row["Alt"])

        if (lapDistM == null || lat == null || lon == null) continue
        const timeSec = num(row["SessionTime"]) ?? 0

        byLap[lapKey] ??= []
        byLap[lapKey].push({ timeSec, lapDistKm: lapDistM / 1000, lat, lon, altitudeM })
        if (lapNumbers[lapKey] == null) lapNumbers[lapKey] = lap
      }

      const lapKeys = Object.keys(byLap)
        .map((key) => Number(key))
        .filter((key) => Number.isFinite(key))
        .sort((a, b) => a - b)

      const parsedLapDataByLap: Record<number, IbtLapData> = {}
      const parsedLaps: number[] = []

      for (const lapKey of lapKeys) {
        const lapRows = byLap[lapKey]
        if (!lapRows || lapRows.length < 20) continue

        const lapNumber = lapNumbers[lapKey] ?? lapKey
        if (lapNumber <= 0) continue

        const minDist = Math.min(...lapRows.map((row) => row.lapDistKm))
        const minTime = Math.min(...lapRows.map((row) => row.timeSec))

        const points: IbtLapPoint[] = lapRows
          .map((row) => ({
            distanceKm: row.lapDistKm - minDist,
            timeSec: row.timeSec - minTime,
            speedKmh: null,
            throttlePct: null,
            brakePct: null,
            brakeABSactive: null,
            gear: null,
            rpm: null,
            steeringDeg: null,
            lat: row.lat,
            lon: row.lon,
            altitudeM: row.altitudeM,
            tireTempLF: null,
            tireTempRF: null,
            tireTempLR: null,
            tireTempRR: null,
            tirePressureLF: null,
            tirePressureRF: null,
            tirePressureLR: null,
            tirePressureRR: null,
            tireWearLF: null,
            tireWearRF: null,
            tireWearLR: null,
            tireWearRR: null,
          }))
          .filter((point) => Number.isFinite(point.distanceKm) && point.distanceKm >= 0)

        if (points.length < 20) continue

        const byDist = [...points].sort((a, b) => a.distanceKm - b.distanceKm)
        const byTime = [...points].sort((a, b) => a.timeSec - b.timeSec)
        const distanceKm = Math.max(...byDist.map((point) => point.distanceKm))

        parsedLapDataByLap[lapKey] = {
          byDist,
          byTime,
          lapNumber,
          lapTimeSec: 0,
          distanceKm,
          points: points.length,
          sectorTimes: [],
        }
        parsedLaps.push(lapKey)
      }

      if (parsedLaps.length === 0) {
        throw new Error("No usable laps found in this .ibt file.")
      }

      const sortedLaps = parsedLaps.sort((a, b) => a - b)
      const firstLap = sortedLaps[0] ?? null
      const secondLap = sortedLaps.length > 1 ? sortedLaps[1]! : firstLap

      setLapDataByLap(parsedLapDataByLap)
      setLaps(sortedLaps)
      setLeftLap(firstLap)
      setRightLap(secondLap)
      setWeekendInfo(weekendInfoData)
      setTrackKey(derivedTrackKey)
      setCorners([])
      setCornerError(null)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
    } finally {
      setLoading(false)
      setProgress(null)
    }
  }, [])

  useEffect(() => {
    if (!lapDataByLap || leftLap == null || rightLap == null) {
      setPreviewTrackMapData(null)
      setTrackMapData(null)
      setTrackMapError(null)
      return
    }

    if (leftLap === rightLap) {
      setPreviewTrackMapData(null)
      setTrackMapData(null)
      setTrackMapError("Left and right edge laps must be different.")
      return
    }

    const leftLapData = lapDataByLap[leftLap]
    const rightLapData = lapDataByLap[rightLap]
    if (!leftLapData || !rightLapData) {
      setPreviewTrackMapData(null)
      setTrackMapData(null)
      return
    }

    try {
      const trackName = weekendInfo?.trackDisplayName ?? weekendInfo?.trackName ?? null
      const trackConfigName = weekendInfo?.trackConfigName ?? null
      const trackId = weekendInfo?.trackID ?? null
      const previewData = buildTrackMapData({
        leftLapPoints: leftLapData.byDist,
        rightLapPoints: rightLapData.byDist,
        leftLapNumber: leftLapData.lapNumber,
        rightLapNumber: rightLapData.lapNumber,
        trackKey: trackKey ?? "preview-track",
        trackName,
        trackConfigName,
        trackId,
        corners,
      })
      setPreviewTrackMapData(previewData)

      if (trackKey) {
        const exportData = buildTrackMapData({
          leftLapPoints: leftLapData.byDist,
          rightLapPoints: rightLapData.byDist,
          leftLapNumber: leftLapData.lapNumber,
          rightLapNumber: rightLapData.lapNumber,
          trackKey,
          trackName,
          trackConfigName,
          trackId,
          corners,
        })
        setTrackMapData(exportData)
      } else {
        setTrackMapData(null)
      }
      setTrackMapError(null)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setTrackMapError(msg)
      setPreviewTrackMapData(null)
      setTrackMapData(null)
    }
  }, [lapDataByLap, leftLap, rightLap, trackKey, weekendInfo, corners])

  const targetCorners = weekendInfo?.trackNumTurns ?? null

  const handleSurfaceClick = useCallback(
    (point: { distanceKm: number; lat: number; lon: number; altitudeM: number | null }) => {
      if (previewMode !== "merged") return
      setCorners((prev) => {
        if (targetCorners != null && prev.length >= targetCorners) {
          setCornerError(`All ${targetCorners} corners are already set.`)
          return prev
        }
        setCornerError(null)
        return [...prev, point]
      })
    },
    [previewMode, targetCorners],
  )

  const handleUndoCorner = useCallback(() => {
    setCorners((prev) => prev.slice(0, -1))
    setCornerError(null)
  }, [])

  const handleClearCorners = useCallback(() => {
    setCorners([])
    setCornerError(null)
  }, [])

  const handleExport = useCallback(() => {
    if (!trackMapData) return
    const fileName = `${trackMapData.trackKey}.json`
    const payload = JSON.stringify(trackMapData, null, 2)
    const blob = new Blob([payload], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = fileName
    link.click()
    URL.revokeObjectURL(url)
  }, [trackMapData])

  return (
    <div className="h-full w-full">
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-border/40 px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-foreground">Track Designer</div>
            <div className="text-xs text-muted-foreground">Dev-only tool for generating track boundaries</div>
          </div>
          <div className="flex items-center gap-2">
            {onExit && (
              <Button variant="ghost" size="sm" onClick={onExit} className="gap-1">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={handleFilePick} disabled={loading} className="gap-2">
              <Upload className="h-4 w-4" />
              Upload .ibt
            </Button>
            <Input
              ref={fileInputRef}
              type="file"
              accept=".ibt"
              className="hidden"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0]
                if (!file) return
                parseIbtFile(file)
                event.currentTarget.value = ""
              }}
            />
          </div>
        </div>

        <div className="grid h-full grid-cols-1 gap-4 p-4 lg:grid-cols-[320px_1fr]">
          <div className="flex flex-col gap-4">
            <div className="rounded-lg border border-border/50 bg-card/40 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Source</div>
              <div className="mt-2 flex items-center gap-2 text-sm text-foreground">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="truncate">{sourceLabel ?? "No file loaded"}</span>
              </div>
              {progress && (
                <div className="mt-3 text-xs text-muted-foreground">
                  Processing... {Math.floor((progress.processedRecords / progress.totalRecords) * 100)}%
                </div>
              )}
              {error && (
                <div className="mt-3 flex items-start gap-2 text-xs text-destructive">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5" />
                  <span>{error}</span>
                </div>
              )}
            </div>

            <div className="rounded-lg border border-border/50 bg-card/40 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Edge Laps</div>
              <div className="mt-3 space-y-3">
                <div>
                  <div className="mb-1 text-[11px] font-medium text-muted-foreground">Left Edge Lap</div>
                  <Select
                    value={leftLap != null ? String(leftLap) : null}
                    onValueChange={(value) => {
                      if (value == null) return
                      setLeftLap(Number(value))
                    }}
                    disabled={laps.length === 0}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue>
                        {(value) => {
                          if (value == null) return "Select lap"
                          const lapKey = Number(value)
                          const lapNumber = lapDataByLap?.[lapKey]?.lapNumber ?? lapKey
                          return `Lap ${lapNumber}`
                        }}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {laps.map((lap) => (
                        <SelectItem key={lap} value={String(lap)}>
                          Lap {lapDataByLap?.[lap]?.lapNumber ?? lap}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <div className="mb-1 text-[11px] font-medium text-muted-foreground">Right Edge Lap</div>
                  <Select
                    value={rightLap != null ? String(rightLap) : null}
                    onValueChange={(value) => {
                      if (value == null) return
                      setRightLap(Number(value))
                    }}
                    disabled={laps.length === 0}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue>
                        {(value) => {
                          if (value == null) return "Select lap"
                          const lapKey = Number(value)
                          const lapNumber = lapDataByLap?.[lapKey]?.lapNumber ?? lapKey
                          return `Lap ${lapNumber}`
                        }}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {laps.map((lap) => (
                        <SelectItem key={lap} value={String(lap)}>
                          Lap {lapDataByLap?.[lap]?.lapNumber ?? lap}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border/50 bg-card/40 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Corners</div>
              <div className="mt-3 space-y-2 text-xs text-muted-foreground">
                <div>
                  Target: <span className="text-foreground">{targetCorners ?? "Unknown"}</span>
                </div>
                <div>
                  Marked: <span className="text-foreground">{corners.length}</span>
                </div>
                <div className="text-[11px]">
                  Switch to Merged Track preview and click the surface to place corner markers.
                </div>
              </div>
              {cornerError && (
                <div className="mt-3 flex items-start gap-2 text-xs text-destructive">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5" />
                  <span>{cornerError}</span>
                </div>
              )}
              <div className="mt-3 flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={handleUndoCorner} disabled={corners.length === 0}>
                  Undo
                </Button>
                <Button variant="outline" size="sm" className="flex-1" onClick={handleClearCorners} disabled={corners.length === 0}>
                  Clear
                </Button>
              </div>
            </div>

            <div className="rounded-lg border border-border/50 bg-card/40 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Export</div>
              <div className="mt-3 space-y-2 text-xs text-muted-foreground">
                <div>Track key: <span className="text-foreground">{trackKey ?? "unknown"}</span></div>
                <div>Output path: <span className="text-foreground">public/track-maps/{trackKey ?? "track-key"}.json</span></div>
              </div>
              {trackMapError && (
                <div className="mt-3 flex items-start gap-2 text-xs text-destructive">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5" />
                  <span>{trackMapError}</span>
                </div>
              )}
              <Button
                variant="default"
                size="sm"
                className="mt-3 w-full"
                disabled={!trackMapData}
                onClick={handleExport}
              >
                Export Track Map
              </Button>
            </div>
          </div>

          <div className="min-h-[300px] rounded-lg border border-border/50 bg-background/10 p-2">
            <div className="flex items-center justify-between border-b border-border/40 px-2 py-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Preview
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant={previewMode === "edges" ? "default" : "outline"}
                  size="xs"
                  onClick={() => setPreviewMode("edges")}
                >
                  Edge Laps
                </Button>
                <Button
                  variant={previewMode === "merged" ? "default" : "outline"}
                  size="xs"
                  onClick={() => setPreviewMode("merged")}
                  disabled={!previewTrackMapData}
                >
                  Merged Track
                </Button>
              </div>
            </div>
            <div className="h-[360px]">
              {lapDataByLap && previewLaps.length > 0 ? (
                <TrackMap3D
                  lapDataByLap={lapDataByLap}
                  selectedLaps={previewLaps}
                  lapColors={lapColors}
                  trackMap={previewTrackMapData}
                  showLapLines={previewMode === "edges"}
                  onSurfaceClick={previewMode === "merged" && previewTrackMapData ? handleSurfaceClick : undefined}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Load an .ibt file to preview the generated track map.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
