import { Settings, ArrowUpDown, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import type { IbtLapData, SectorBoundary } from "./types"
import { LAP_COLOR_PALETTE } from "./constants"
import { formatLapTime, formatDeltaSeconds, formatSectorTime } from "@/lib/telemetry-utils"

interface LapSelectorProps {
  ibtLaps: number[]
  selectedLaps: number[]
  lapColors: Record<number, string>
  ibtLapDataByLap: Record<number, IbtLapData> | null
  sectorBoundaries: SectorBoundary[]
  ibtSourceLabel: string | null
  ibtLoading: boolean
  ibtProgress: { processedRecords: number; totalRecords: number } | null
  ibtError: string | null
  onFileSelect: (file: File) => void
  onLoadSample: () => void
  onToggleLap: (lap: number) => void
  onClearSelectedLaps: () => void
}

export function LapSelector({
  ibtLaps,
  selectedLaps,
  lapColors,
  ibtLapDataByLap,
  sectorBoundaries,
  ibtSourceLabel,
  ibtLoading,
  ibtProgress,
  ibtError,
  onFileSelect,
  onLoadSample,
  onToggleLap,
  onClearSelectedLaps,
}: LapSelectorProps) {
  return (
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
            onFileSelect(f)
          }}
        />

        <div className="mt-2">
          <Button variant="outline" size="xs" className="w-full" disabled={ibtLoading} onClick={onLoadSample}>
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
                  onClick={() => onToggleLap(lap)}
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
              <Button variant="ghost" size="xs" className="w-full mt-2" onClick={onClearSelectedLaps}>
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
  )
}

