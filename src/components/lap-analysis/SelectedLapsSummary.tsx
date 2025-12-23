import { Button } from "@/components/ui/button"
import { Settings } from "lucide-react"
import { formatLapTime, formatDeltaSeconds } from "@/lib/telemetry-utils"
import { LAP_COLOR_PALETTE } from "./constants"
import type { IbtLapData } from "./types"

interface SelectedLapsSummaryProps {
  selectedLaps: number[]
  lapDataByLap: Record<number, IbtLapData> | null
  lapColors: Record<number, string>
}

export function SelectedLapsSummary({
  selectedLaps,
  lapDataByLap,
  lapColors,
}: SelectedLapsSummaryProps) {
  if (selectedLaps.length === 0) return null

  return (
    <div className="border-b border-border p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Selected Laps:</span>
        <Button variant="ghost" size="icon-xs">
          <Settings className="h-3 w-3" />
        </Button>
      </div>
      <div className="space-y-1">
        {selectedLaps.map((lap) => {
          const lapData = lapDataByLap?.[lap]
          const color = lapColors[lap] ?? LAP_COLOR_PALETTE[0]
          const lapTime = lapData ? formatLapTime(lapData.lapTimeSec) : `Lap ${lap}`
          const isRef = selectedLaps[0] === lap
          const refLap = selectedLaps[0]
          const refData = lapDataByLap?.[refLap]
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
              {isRef && <span className="text-muted-foreground text-[10px]">(ref)</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

