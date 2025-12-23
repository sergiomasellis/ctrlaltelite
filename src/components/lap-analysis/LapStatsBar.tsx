import { Button } from "@/components/ui/button"
import { Gauge, Activity, Zap, TrendingUp, Square, RotateCw } from "lucide-react"
import { CursorDistanceDisplay } from "@/lib/cursorStore"

interface LapStatsBarProps {
  lapTime: string
  avgSpeed: number
  maxSpeed: number
  avgThrottle: number
  avgBrake: number
  maxRpm: number
  hasZoom: boolean
  onResetZoom: () => void
}

export function LapStatsBar({
  lapTime,
  avgSpeed,
  maxSpeed,
  avgThrottle,
  avgBrake,
  maxRpm,
  hasZoom,
  onResetZoom,
}: LapStatsBarProps) {
  return (
    <div className="flex items-center gap-4 border-b border-border px-4 py-2 bg-muted/20">
      <div className="flex items-center gap-1.5">
        <Gauge className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Lap:</span>
        <span className="text-sm font-semibold">{lapTime}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <Activity className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Avg:</span>
        <span className="text-sm font-medium">{avgSpeed.toFixed(0)} km/h</span>
      </div>
      <div className="flex items-center gap-1.5">
        <Zap className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Max:</span>
        <span className="text-sm font-medium">{maxSpeed.toFixed(0)} km/h</span>
      </div>
      <div className="flex items-center gap-1.5">
        <TrendingUp className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Throttle:</span>
        <span className="text-sm font-medium">{avgThrottle.toFixed(0)}%</span>
      </div>
      <div className="flex items-center gap-1.5">
        <Square className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Brake:</span>
        <span className="text-sm font-medium">{avgBrake.toFixed(0)}%</span>
      </div>
      <div className="flex items-center gap-1.5">
        <RotateCw className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">RPM:</span>
        <span className="text-sm font-medium">{maxRpm.toFixed(0)}</span>
      </div>
      <div className="ml-auto flex items-center gap-2">
        {hasZoom && (
          <Button variant="outline" size="xs" onClick={onResetZoom}>
            Reset zoom
          </Button>
        )}
        <CursorDistanceDisplay />
      </div>
    </div>
  )
}

