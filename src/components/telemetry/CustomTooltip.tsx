import type { ChartSeries } from "./types"

// Custom tooltip content component for recharts
interface CustomTooltipProps {
  active?: boolean
  payload?: ReadonlyArray<any>
  label?: string | number
  series: ChartSeries[]
  unit?: string
  formatValue?: (v: number) => string
}

export function CustomTooltipContent({
  active,
  payload,
  series,
  unit = "",
  formatValue = (v) => v.toFixed(1),
}: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null

  const data = payload[0]?.payload
  if (!data) return null

  const distance = data.distance

  const formatMaybe = (v: unknown) => {
    if (typeof v !== "number" || !Number.isFinite(v)) return "—"
    return `${formatValue(v)}${unit}`
  }

  const rows = series
    .map((s) => ({ ...s, value: data[s.key] }))
    .filter((r) => r.value !== undefined && r.value !== null)

  // Group by lap
  const lapGroups: Record<string, typeof rows> = {}
  rows.forEach((r) => {
    const lapMatch = r.label.match(/Lap \d+/)
    const lapKey = lapMatch ? lapMatch[0] : "Other"
    if (!lapGroups[lapKey]) lapGroups[lapKey] = []
    lapGroups[lapKey].push(r)
  })

  const sortedLaps = Object.keys(lapGroups).sort((a, b) => {
    if (a === "Other") return 1
    if (b === "Other") return -1
    return parseInt(a.replace("Lap ", "")) - parseInt(b.replace("Lap ", ""))
  })

  return (
    <div className="bg-card/95 backdrop-blur-md border border-border/60 rounded-xl px-3 py-2.5 shadow-2xl max-h-[350px] overflow-y-auto scrollbar-none">
      <div className="text-[10px] text-muted-foreground mb-2 font-bold uppercase tracking-wider border-b border-border/40 pb-1">
        {typeof distance === "number" && Number.isFinite(distance) ? `${distance.toFixed(3)} km` : "—"}
      </div>
      <div className="space-y-3">
        {sortedLaps.map((lapKey) => {
          const items = lapGroups[lapKey]!
          const isTireGroup = items.length === 4 && items.some(i => /LF|RF|LR|RR/.test(i.label))

          return (
            <div key={lapKey} className="space-y-1">
              {lapKey !== "Other" && (
                <div className="text-[9px] font-bold text-primary/80 uppercase mb-1">{lapKey}</div>
              )}
              {isTireGroup ? (
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  {items.map((r) => (
                    <div key={r.key} className="flex items-center gap-1.5 min-w-[70px]">
                      <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: r.color }} />
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                        {r.label.split(" ").pop()}
                      </span>
                      <span className="ml-auto text-[10px] text-foreground font-mono font-medium">
                        {formatMaybe(r.value)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-1">
                  {items.map((r) => (
                    <div key={r.key} className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: r.color }} />
                      <span className="text-xs text-muted-foreground truncate max-w-[120px]">
                        {lapKey === "Other" ? r.label : r.label.replace(lapKey, "").trim()}
                      </span>
                      <span className="ml-auto text-xs text-foreground font-mono font-medium pl-4">
                        {formatMaybe(r.value)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}






