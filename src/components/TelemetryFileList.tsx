import { useState, useEffect, useCallback } from "react"
import { RefreshCw, FileText, AlertCircle, Loader2, Upload, BarChart3 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { scanTelemetryFiles, type TelemetryFileInfo } from "@/lib/telemetry-scanner"
import { readFile } from "@tauri-apps/plugin-fs"

interface OverviewProps {
  onFileSelect: (file: File) => void
  onFileUpload: () => void
}

export function Overview({ onFileSelect, onFileUpload }: OverviewProps) {
  const [files, setFiles] = useState<TelemetryFileInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadFiles = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const scannedFiles = await scanTelemetryFiles()
      setFiles(scannedFiles)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadFiles()
  }, [loadFiles])

  const handleFileClick = useCallback(
    async (fileInfo: TelemetryFileInfo) => {
      try {
        const fileData = await readFile(fileInfo.path)
        const blob = new Blob([new Uint8Array(fileData as ArrayLike<number>)])
        const file = new File([blob], fileInfo.name, { type: "application/octet-stream" })
        onFileSelect(file)
      } catch (err) {
        setError(`Failed to load file: ${err instanceof Error ? err.message : String(err)}`)
      }
    },
    [onFileSelect]
  )

  const formatSessionType = (type?: string) => {
    if (!type) return "Unknown"
    return type.charAt(0).toUpperCase() + type.slice(1).toLowerCase()
  }

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex h-12 items-center justify-between border-b border-border px-4 bg-muted/30">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-bold">
              CAE
            </div>
            <span className="text-sm font-semibold">Ctrl Alt Elite</span>
          </div>
          <nav className="flex items-center gap-0.5">
            <Button variant="secondary" size="sm" className="h-8 gap-1.5">
              <BarChart3 className="h-3.5 w-3.5" />
              Overview
            </Button>
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadFiles} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={onFileUpload}>
            <Upload className="h-4 w-4" />
            Upload File
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-4">
        <div className="mb-4">
          <h2 className="text-lg font-semibold mb-1">Telemetry Sessions</h2>
          <p className="text-sm text-muted-foreground">
            Select a session to analyze lap times, compare performance, and visualize telemetry data
          </p>
        </div>

        {loading && files.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Scanning telemetry files...</p>
            </div>
          </div>
        ) : error && files.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-2 text-center">
              <AlertCircle className="h-8 w-8 text-destructive" />
              <p className="text-sm text-destructive">{error}</p>
              <Button variant="outline" size="sm" onClick={loadFiles} className="mt-2">
                Try Again
              </Button>
            </div>
          </div>
        ) : files.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-2 text-center">
              <FileText className="h-12 w-12 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No telemetry files found</p>
              <p className="text-xs text-muted-foreground">
                Place .ibt files in Documents/iRacing/telemetry or upload a file
              </p>
              <Button variant="outline" size="sm" onClick={onFileUpload} className="mt-2">
                <Upload className="h-4 w-4" />
                Upload File
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {files.map((fileInfo) => (
              <Card
                key={fileInfo.path}
                className="cursor-pointer transition-colors hover:bg-muted/50"
                onClick={() => !fileInfo.error && handleFileClick(fileInfo)}
              >
                <CardHeader>
                  <CardTitle className="truncate text-base">{fileInfo.name}</CardTitle>
                  {fileInfo.error ? (
                    <CardDescription className="text-destructive">
                      <AlertCircle className="mr-1 inline h-3 w-3" />
                      {fileInfo.error}
                    </CardDescription>
                  ) : (
                    <CardDescription>
                      {fileInfo.metadata.trackName || "Unknown Track"}
                      {fileInfo.metadata.trackConfig && ` - ${fileInfo.metadata.trackConfig}`}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    {fileInfo.metadata.carName && (
                      <div>
                        <span className="font-medium">Car:</span> {fileInfo.metadata.carName}
                      </div>
                    )}
                    {fileInfo.metadata.sessionType && (
                      <div>
                        <span className="font-medium">Session:</span>{" "}
                        {formatSessionType(fileInfo.metadata.sessionType)}
                      </div>
                    )}
                    {(fileInfo.metadata.sessionDate || fileInfo.metadata.sessionTime) && (
                      <div>
                        <span className="font-medium">Date:</span>{" "}
                        {fileInfo.metadata.sessionDate} {fileInfo.metadata.sessionTime}
                      </div>
                    )}
                    {fileInfo.metadata.lapCount !== undefined && (
                      <div>
                        <span className="font-medium">Laps:</span> {fileInfo.metadata.lapCount}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

