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
    <div className="flex items-center gap-6 border-b border-border px-4 py-2 bg-muted/20">
      <div className="flex items-center gap-1.5">
        <Gauge className="h-4 w-4 text-muted-foreground" />
        <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Lap</span>
        <span className="text-base font-bold tabular-nums">{lapTime}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <Activity className="h-4 w-4 text-muted-foreground" />
        <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Avg</span>
        <span className="text-sm font-semibold tabular-nums">{avgSpeed.toFixed(0)}</span>
        <span className="text-[10px] text-muted-foreground">km/h</span>
      </div>
      <div className="flex items-center gap-1.5">
        <Zap className="h-4 w-4 text-muted-foreground" />
        <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Max</span>
        <span className="text-sm font-semibold tabular-nums">{maxSpeed.toFixed(0)}</span>
        <span className="text-[10px] text-muted-foreground">km/h</span>
      </div>
      <div className="flex items-center gap-1.5">
        <TrendingUp className="h-4 w-4 text-muted-foreground" />
        <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Throttle</span>
        <span className="text-sm font-medium tabular-nums">{avgThrottle.toFixed(0)}</span>
        <span className="text-[10px] text-muted-foreground">%</span>
      </div>
      <div className="flex items-center gap-1.5">
        <Square className="h-4 w-4 text-muted-foreground" />
        <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Brake</span>
        <span className="text-sm font-medium tabular-nums">{avgBrake.toFixed(0)}</span>
        <span className="text-[10px] text-muted-foreground">%</span>
      </div>
      <div className="flex items-center gap-1.5">
        <RotateCw className="h-4 w-4 text-muted-foreground" />
        <span className="text-[10px] text-muted-foreground uppercase tracking-wide">RPM</span>
        <span className="text-sm font-medium tabular-nums">{(maxRpm / 1000).toFixed(1)}k</span>
      </div>
      <div className="ml-auto flex items-center gap-2">
        {hasZoom && (
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={onResetZoom}>
            <RotateCw className="h-3 w-3" />
            Reset zoom
          </Button>
        )}
        <CursorDistanceDisplay />
      </div>
    </div>
  )
}

