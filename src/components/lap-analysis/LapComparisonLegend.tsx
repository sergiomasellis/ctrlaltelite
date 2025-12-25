import { formatLapTime, formatSectorTime } from "@/lib/telemetry-utils"
import { LAP_COLOR_PALETTE } from "./constants"
import type { IbtLapData, SectorBoundary } from "./types"

interface LapComparisonLegendProps {
  selectedLaps: number[]
  lapDataByLap: Record<number, IbtLapData> | null
  lapColors: Record<number, string>
  sectorBoundaries: SectorBoundary[]
}

export function LapComparisonLegend({
  selectedLaps,
  lapDataByLap,
  lapColors,
  sectorBoundaries,
}: LapComparisonLegendProps) {
  return (
    <div className="flex-1 p-3 overflow-y-auto">
      <div className="text-xs font-medium text-muted-foreground mb-2">Lap Comparison</div>
      <div className="space-y-2">
        {selectedLaps.map((lap) => {
          const color = lapColors[lap] ?? LAP_COLOR_PALETTE[0]
          const lapData = lapDataByLap?.[lap]
          const lapLabel = lapData?.lapNumber ?? lap
          const lapTime = lapData ? formatLapTime(lapData.lapTimeSec) : `Lap ${lapLabel}`
          const isRef = selectedLaps[0] === lap
          return (
            <div key={lap} className="flex items-center gap-2 text-xs">
              <div className="h-3 w-3 rounded-sm" style={{ backgroundColor: color }} />
              <span className="font-medium">Lap {lapLabel}</span>
              <span className="text-muted-foreground">{lapTime}</span>
              {isRef && <span className="text-[10px] text-muted-foreground">(reference)</span>}
            </div>
          )
        })}
      </div>

      {/* Best sectors */}
      {lapDataByLap && selectedLaps.length > 0 && sectorBoundaries.length > 0 && (
        <div className="mt-4">
          <div className="text-xs font-medium text-muted-foreground mb-2">Best Sectors</div>
          <div className="space-y-1">
            {sectorBoundaries.slice(1).map((sector) => {
              const sectorNum = sector.sectorNum
              let bestLap = selectedLaps[0]
              let bestTime = Infinity
              for (const lap of selectedLaps) {
                const lapData = lapDataByLap[lap]
                const sectorTime = lapData?.sectorTimes.find((st) => st.sectorNum === sectorNum)
                if (sectorTime && sectorTime.timeSec < bestTime) {
                  bestTime = sectorTime.timeSec
                  bestLap = lap
                }
              }
              const color = lapColors[bestLap] ?? LAP_COLOR_PALETTE[0]
              const bestLapLabel = lapDataByLap[bestLap]?.lapNumber ?? bestLap
              return (
                <div key={sectorNum} className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground w-6">S{sectorNum}</span>
                  <div className="h-2 w-2 rounded-sm" style={{ backgroundColor: color }} />
                  <span className="font-medium">Lap {bestLapLabel}</span>
                  <span className="text-muted-foreground">{formatSectorTime(bestTime)}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

