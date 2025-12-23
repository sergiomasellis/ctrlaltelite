import { Button } from "@/components/ui/button"
import { ArrowUpDown, RefreshCw } from "lucide-react"
import { formatSectorTime } from "@/lib/telemetry-utils"
import { LAP_COLOR_PALETTE } from "./constants"
import type { IbtLapData, SectorBoundary } from "./types"

interface SectorTimesTableProps {
  selectedLaps: number[]
  lapDataByLap: Record<number, IbtLapData> | null
  lapColors: Record<number, string>
  sectorBoundaries: SectorBoundary[]
}

export function SectorTimesTable({
  selectedLaps,
  lapDataByLap,
  lapColors,
  sectorBoundaries,
}: SectorTimesTableProps) {
  return (
    <div className="p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Sector Times:</span>
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
      {selectedLaps.length > 1 && lapDataByLap && (
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
        {selectedLaps.length > 0 && lapDataByLap && sectorBoundaries.length > 0 ? (
          <div className="space-y-2">
            {/* Header */}
            <div className="grid gap-1 text-[10px] text-muted-foreground border-b border-border pb-1" style={{ gridTemplateColumns: `40px repeat(${selectedLaps.length}, 1fr)` }}>
              <div>Sec</div>
              {selectedLaps.map((lap) => (
                <div key={lap} className="flex items-center gap-1 justify-center">
                  <div className="h-2 w-2 rounded-sm" style={{ backgroundColor: lapColors[lap] ?? LAP_COLOR_PALETTE[0] }} />
                  <span>L{lap}</span>
                </div>
              ))}
            </div>
            {/* Sector rows */}
            {sectorBoundaries.slice(1).map((sector) => {
              const sectorNum = sector.sectorNum
              return (
                <div key={sectorNum} className="grid gap-1 text-[10px]" style={{ gridTemplateColumns: `40px repeat(${selectedLaps.length}, 1fr)` }}>
                  <div className="font-medium">S{sectorNum}</div>
                  {selectedLaps.map((lap) => {
                    const lapData = lapDataByLap[lap]
                    const sectorTime = lapData?.sectorTimes.find((st) => st.sectorNum === sectorNum)
                    const refLap = selectedLaps[0]
                    const refData = lapDataByLap[refLap]
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
          <div className="text-muted-foreground text-[10px]">Select laps to compare</div>
        ) : sectorBoundaries.length === 0 ? (
          <div className="text-muted-foreground text-[10px]">No sector data available</div>
        ) : null}
      </div>
    </div>
  )
}

