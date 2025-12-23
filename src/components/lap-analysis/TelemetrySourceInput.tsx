import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Upload, FileText, AlertCircle, Loader2, ArrowLeft } from "lucide-react"

interface TelemetrySourceInputProps {
  onFileSelect: (file: File) => void
  onLoadSample: () => void
  onBackToStart?: () => void
  loading: boolean
  sourceLabel: string | null
  progress: { processedRecords: number; totalRecords: number } | null
  error: string | null
}

export function TelemetrySourceInput({
  onFileSelect,
  onLoadSample,
  onBackToStart,
  loading,
  sourceLabel,
  progress,
  error,
}: TelemetrySourceInputProps) {
  return (
    <div className="border-b border-border p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Data Source</span>
        <div className="flex items-center gap-1">
          {onBackToStart && (
            <Button
              variant="ghost"
              size="icon-xs"
              className="h-5 w-5"
              onClick={onBackToStart}
              title="Back to file list"
            >
              <ArrowLeft className="h-3 w-3" />
            </Button>
          )}
          {sourceLabel && (
            <span className="text-[10px] text-muted-foreground truncate max-w-32" title={sourceLabel}>
              {sourceLabel}
            </span>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <label className="block cursor-pointer">
          <div className="flex items-center justify-center gap-2 rounded-md border border-dashed border-border px-3 py-2.5 text-xs text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground">
            <Upload className="h-3.5 w-3.5" />
            <span>Upload .ibt file</span>
          </div>
          <Input
            type="file"
            accept=".ibt"
            disabled={loading}
            className="hidden"
            onChange={(e) => {
              const f = e.currentTarget.files?.[0]
              if (!f) return
              onFileSelect(f)
              e.currentTarget.value = ""
            }}
          />
        </label>

        <Button
          variant="outline"
          size="sm"
          className="w-full gap-1.5"
          disabled={loading}
          onClick={onLoadSample}
        >
          <FileText className="h-3.5 w-3.5" />
          Load Sample
        </Button>
      </div>

      {progress && (
        <div className="mt-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>Processing... {Math.floor((progress.processedRecords / progress.totalRecords) * 100)}%</span>
          </div>
          <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all duration-200"
              style={{ width: `${(progress.processedRecords / progress.totalRecords) * 100}%` }}
            />
          </div>
        </div>
      )}
      {error && (
        <div className="mt-2 flex items-start gap-1.5 text-xs text-destructive">
          <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  )
}

