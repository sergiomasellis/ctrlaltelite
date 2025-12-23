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

  return (
    <div className="bg-card/95 backdrop-blur-sm border border-border rounded-lg px-3 py-2 shadow-xl">
      <div className="text-[10px] text-muted-foreground mb-1.5 font-medium">
        {typeof distance === "number" && Number.isFinite(distance) ? `${distance.toFixed(3)} km` : "—"}
      </div>
      <div className="space-y-1">
        {rows.map((r) => (
          <div key={r.key} className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: r.color }} />
            <span className="text-xs text-muted-foreground">{r.label}</span>
            <span className="ml-auto text-xs text-foreground font-medium">{formatMaybe(r.value)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

