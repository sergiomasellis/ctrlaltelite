import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface TelemetrySourceInputProps {
  onFileSelect: (file: File) => void
  onLoadSample: () => void
  loading: boolean
  sourceLabel: string | null
  progress: { processedRecords: number; totalRecords: number } | null
  error: string | null
}

export function TelemetrySourceInput({
  onFileSelect,
  onLoadSample,
  loading,
  sourceLabel,
  progress,
  error,
}: TelemetrySourceInputProps) {
  return (
    <div className="border-b border-border p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Telemetry (.ibt)</span>
        {sourceLabel && <span className="text-[10px] text-muted-foreground truncate">{sourceLabel}</span>}
      </div>

      <Input
        type="file"
        accept=".ibt"
        disabled={loading}
        onChange={(e) => {
          const f = e.currentTarget.files?.[0]
          if (!f) return
          onFileSelect(f)
        }}
      />

      <div className="mt-2">
        <Button variant="outline" size="xs" className="w-full" disabled={loading} onClick={onLoadSample}>
          Load sample
        </Button>
      </div>

      {progress && (
        <div className="mt-2 text-[10px] text-muted-foreground">
          Parsing… {Math.floor((progress.processedRecords / progress.totalRecords) * 100)}%
        </div>
      )}
      {error && <div className="mt-2 text-[10px] text-red-400">{error}</div>}
    </div>
  )
}

