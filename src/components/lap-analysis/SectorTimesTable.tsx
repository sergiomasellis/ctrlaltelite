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
    <div className="p-3 flex-1">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Sector Times</span>
      </div>

      {/* Lap color indicators */}
      {selectedLaps.length > 1 && lapDataByLap && (
        <div className="mb-3 flex items-center gap-3">
          {selectedLaps.map((lap, idx) => {
            const color = lapColors[lap] ?? LAP_COLOR_PALETTE[0]
            const lapLabel = lapDataByLap[lap]?.lapNumber ?? lap
            return (
              <div key={lap} className="flex items-center gap-1.5">
                <div
                  className="h-2.5 w-2.5 rounded-sm"
                  style={{ backgroundColor: color }}
                />
                <span className="text-[10px] text-muted-foreground">
                  {idx === 0 ? "REF" : `L${lapLabel}`}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* Sector times table */}
      <div className="space-y-1 text-xs">
        {selectedLaps.length > 0 && lapDataByLap && sectorBoundaries.length > 0 ? (
          <div className="space-y-2">
            {/* Header */}
            <div
              className="grid gap-1 text-[10px] text-muted-foreground border-b border-border pb-1"
              style={{
                gridTemplateColumns: `40px repeat(${selectedLaps.length}, minmax(60px, 1fr))`,
              }}
            >
              <div className="font-medium uppercase tracking-wide">Sec</div>
              {selectedLaps.map((lap) => (
                <div
                  key={lap}
                  className="flex items-center justify-center gap-1"
                >
                  <div
                    className="h-2 w-2 rounded-sm"
                    style={{
                      backgroundColor:
                        lapColors[lap] ?? LAP_COLOR_PALETTE[0],
                    }}
                  />
                  <span className={lap === selectedLaps[0] ? "font-semibold" : ""}>
                    {lap === selectedLaps[0]
                      ? "REF"
                      : `L${lapDataByLap[lap]?.lapNumber ?? lap}`}
                  </span>
                </div>
              ))}
            </div>

            {/* Sector rows */}
            {sectorBoundaries.slice(1).map((sector) => {
              const sectorNum = sector.sectorNum
              return (
                <div
                  key={sectorNum}
                  className="grid gap-1"
                  style={{
                    gridTemplateColumns: `40px repeat(${selectedLaps.length}, minmax(60px, 1fr))`,
                  }}
                >
                  <div className="font-medium text-muted-foreground">
                    S{sectorNum}
                  </div>
                  {selectedLaps.map((lap) => {
                    const lapData = lapDataByLap[lap]
                    const sectorTime = lapData?.sectorTimes.find(
                      (st) => st.sectorNum === sectorNum
                    )
                    const refLap = selectedLaps[0]
                    const refData = lapDataByLap[refLap]
                    const refSectorTime = refData?.sectorTimes.find(
                      (st) => st.sectorNum === sectorNum
                    )
                    const delta =
                      sectorTime && refSectorTime
                        ? sectorTime.timeSec - refSectorTime.timeSec
                        : null
                    const isRef = lap === refLap

                    return (
                      <div
                        key={lap}
                        className={`text-center ${
                          isRef ? "font-semibold" : ""
                        }`}
                      >
                        {sectorTime ? (
                          <div>
                            <div className="tabular-nums">
                              {formatSectorTime(sectorTime.timeSec)}
                            </div>
                            {!isRef && delta != null && (
                              <div
                                className={`text-[9px] tabular-nums ${
                                  delta >= 0
                                    ? "text-red-400"
                                    : "text-green-400"
                                }`}
                              >
                                {delta >= 0 ? "+" : ""}
                                {delta.toFixed(3)}s
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

            {/* Total row */}
            <div
              className="grid gap-1 pt-2 border-t border-border font-medium"
              style={{
                gridTemplateColumns: `40px repeat(${selectedLaps.length}, minmax(60px, 1fr))`,
              }}
            >
              <div className="text-muted-foreground">Tot</div>
              {selectedLaps.map((lap) => {
                const lapData = lapDataByLap[lap]
                return (
                  <div key={lap} className="text-center tabular-nums">
                    {lapData
                      ? formatSectorTime(lapData.lapTimeSec)
                      : "—"}
                  </div>
                )
              })}
            </div>
          </div>
        ) : selectedLaps.length === 0 ? (
          <div className="text-muted-foreground text-[10px]">
            Select laps to compare
          </div>
        ) : sectorBoundaries.length === 0 ? (
          <div className="text-muted-foreground text-[10px]">
            No sector data available
          </div>
        ) : null}
      </div>
    </div>
  )
}
