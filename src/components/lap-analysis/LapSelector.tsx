import { Button } from "@/components/ui/button"
import { formatLapTime } from "@/lib/telemetry-utils"
import { LAP_COLOR_PALETTE } from "./constants"
import type { IbtLapData } from "./types"

interface LapSelectorProps {
  laps: number[]
  selectedLaps: number[]
  lapColors: Record<number, string>
  lapDataByLap: Record<number, IbtLapData> | null
  onToggleLap: (lap: number) => void
  onClearSelection: () => void
}

export function LapSelector({
  laps,
  selectedLaps,
  lapColors,
  lapDataByLap,
  onToggleLap,
  onClearSelection,
}: LapSelectorProps) {
  if (laps.length === 0) return null

  return (
    <div className="border-b border-border p-3">
      <div className="mb-2 text-xs font-medium text-muted-foreground">Select laps to compare:</div>
      <div className="space-y-1 max-h-48 overflow-y-auto">
        {laps.map((lap) => {
          const isSelected = selectedLaps.includes(lap)
          const color = lapColors[lap] ?? LAP_COLOR_PALETTE[0]
          const lapData = lapDataByLap?.[lap]
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
                <span className="text-[10px] text-muted-foreground ml-auto whitespace-nowrap">(ref)</span>
              )}
            </div>
          )
        })}
      </div>
      {selectedLaps.length > 0 && (
        <Button variant="ghost" size="xs" className="w-full mt-2" onClick={onClearSelection}>
          Clear selection
        </Button>
      )}
    </div>
  )
}
