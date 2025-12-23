import { Button } from "@/components/ui/button"
import { formatLapTime } from "@/lib/telemetry-utils"
import { LAP_COLOR_PALETTE } from "./constants"
import type { IbtLapData } from "./types"
import { Check, X } from "lucide-react"

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
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Laps</span>
        <span className="text-[10px] text-muted-foreground">{selectedLaps.length} / {laps.length}</span>
      </div>
      <div className="space-y-1 max-h-48 overflow-y-auto">
        {laps.map((lap) => {
          const isSelected = selectedLaps.includes(lap)
          const color = lapColors[lap] ?? LAP_COLOR_PALETTE[0]
          const lapData = lapDataByLap?.[lap]
          const lapTime = lapData ? formatLapTime(lapData.lapTimeSec) : null
          const isRef = selectedLaps[0] === lap

          return (
            <button
              key={lap}
              className={`w-full flex items-center gap-2 rounded px-2 py-1.5 text-xs text-left transition-colors ${
                isSelected ? "bg-muted" : "hover:bg-muted/50"
              }`}
              onClick={() => onToggleLap(lap)}
            >
              <div
                className="h-3 w-3 rounded-sm flex-shrink-0"
                style={{ backgroundColor: color }}
              />
              <div className="flex flex-col min-w-0 flex-1">
                <span className="font-medium">Lap {lap}</span>
                {lapTime && (
                  <span className="text-[10px] text-muted-foreground tabular-nums">{lapTime}</span>
                )}
              </div>
              {isRef && (
                <span className="text-[10px] text-muted-foreground flex-shrink-0">REF</span>
              )}
              <div className={`flex-shrink-0 ${isSelected ? "opacity-100" : "opacity-0"}`}>
                {isSelected ? (
                  <Check className="h-3 w-3 text-muted-foreground" />
                ) : null}
              </div>
            </button>
          )
        })}
      </div>
      {selectedLaps.length > 1 && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full mt-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={onClearSelection}
        >
          <X className="h-3 w-3 mr-1" />
          Clear selection
        </Button>
      )}
    </div>
  )
}
