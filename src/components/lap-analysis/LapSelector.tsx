import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { formatLapTime } from "@/lib/telemetry-utils"
import { LAP_COLOR_PALETTE } from "./constants"
import type { IbtLapData } from "./types"
import { Check, X, Flag } from "lucide-react"
import { cn } from "@/lib/utils"

interface LapSelectorProps {
  laps: number[]
  selectedLaps: number[]
  lapColors: Record<number, string>
  lapDataByLap: Record<number, IbtLapData> | null
  onToggleLap: (lap: number) => void
  onClearSelection: () => void
}

const getSessionTypeColor = (sessionType?: string) => {
  if (!sessionType) return "bg-muted/50 text-muted-foreground border-border/50"
  const type = sessionType.toLowerCase()
  if (type.includes("race")) return "bg-blue-500/10 text-blue-500 border-blue-500/20"
  if (type.includes("qualify") || type.includes("qualifying")) return "bg-purple-500/10 text-purple-500 border-purple-500/20"
  if (type.includes("practice")) return "bg-amber-500/10 text-amber-500 border-amber-500/20"
  return "bg-muted/50 text-muted-foreground border-border/50"
}

const formatSessionType = (sessionType?: string) => {
  if (!sessionType) return "Unknown"
  const normalized = sessionType.toLowerCase().trim()
  if (normalized.includes("race")) return "Race"
  if (normalized.includes("qualify")) return "Qualifying"
  if (normalized.includes("practice")) return "Practice"
  if (normalized.includes("warmup")) return "Warmup"
  if (normalized.includes("test")) return "Testing"
  return sessionType.charAt(0).toUpperCase() + sessionType.slice(1).toLowerCase()
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

  // Group laps by session type
  const lapsBySession: Record<string, number[]> = {}
  laps.forEach((lap) => {
    const lapData = lapDataByLap?.[lap]
    const sessionType = lapData?.sessionType || "Unknown"
    if (!lapsBySession[sessionType]) {
      lapsBySession[sessionType] = []
    }
    lapsBySession[sessionType].push(lap)
  })

  // Sort session types: Race first, then Qualifying, then Practice, then others
  const sessionTypeOrder = (type: string) => {
    const normalized = type.toLowerCase()
    if (normalized.includes("race")) return 0
    if (normalized.includes("qualify")) return 1
    if (normalized.includes("practice")) return 2
    return 3
  }

  const sortedSessionTypes = Object.keys(lapsBySession).sort((a, b) => {
    return sessionTypeOrder(a) - sessionTypeOrder(b)
  })

  return (
    <div className="p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Laps</span>
        <span className="text-[10px] text-muted-foreground">{selectedLaps.length} / {laps.length}</span>
      </div>
      <div className="space-y-3 max-h-96 overflow-y-auto">
        {sortedSessionTypes.map((sessionType) => {
          const sessionLaps = lapsBySession[sessionType].sort((a, b) => a - b)
          const formattedType = formatSessionType(sessionType)
          const colorClass = getSessionTypeColor(sessionType)

          return (
            <div key={sessionType} className="space-y-1.5">
              <div className="flex items-center gap-2 px-1">
                <Badge className={cn("h-4 text-[9px] border px-1.5", colorClass)}>
                  <Flag className="h-2 w-2 mr-1" />
                  {formattedType}
                </Badge>
                <span className="text-[9px] text-muted-foreground">
                  {sessionLaps.length} {sessionLaps.length === 1 ? "lap" : "laps"}
                </span>
              </div>
              <div className="space-y-1">
                {sessionLaps.map((lap) => {
                  const isSelected = selectedLaps.includes(lap)
                  const color = lapColors[lap] ?? LAP_COLOR_PALETTE[0]
                  const lapData = lapDataByLap?.[lap]
                  const lapLabel = lapData?.lapNumber ?? lap
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
                        <span className="font-medium">Lap {lapLabel}</span>
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
            </div>
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
