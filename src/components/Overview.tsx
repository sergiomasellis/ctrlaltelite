import { useState, useEffect, useCallback } from "react"
import { RefreshCw, FileText, AlertCircle, Loader2, Upload, BarChart3 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { scanTelemetryFiles, type TelemetryFileInfo } from "@/lib/telemetry-scanner"
import { readFile } from "@tauri-apps/plugin-fs"
import { BaseDirectory } from "@tauri-apps/api/path"

interface OverviewProps {
  onFileSelect: (file: File) => void
  onFileUpload: () => void
}

export function Overview({ onFileSelect, onFileUpload }: OverviewProps) {
  const [files, setFiles] = useState<TelemetryFileInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastScanAt, setLastScanAt] = useState<Date | null>(null)

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
      setLastScanAt(new Date())
    }
  }, [])

  useEffect(() => {
    loadFiles()
  }, [loadFiles])

  const handleFileClick = useCallback(
    async (fileInfo: TelemetryFileInfo) => {
      try {
        const relativePath = `iRacing/telemetry/${fileInfo.name}`
        const fileData = await readFile(relativePath, { baseDir: BaseDirectory.Document })
        const blob = new Blob([new Uint8Array(fileData as ArrayLike<number>)])
        const file = new File([blob], fileInfo.name, { type: "application/octet-stream" })
        onFileSelect(file)
      } catch (err) {
        console.error("Failed to load file:", fileInfo.path, err)
        setError(`Failed to load file: ${err instanceof Error ? err.message : String(err)}`)
      }
    },
    [onFileSelect]
  )

  const formatSessionType = (type?: string) => {
    if (!type) return "Unknown"
    return type.charAt(0).toUpperCase() + type.slice(1).toLowerCase()
  }

  const formatFilenameLabel = (value?: string) => {
    if (!value) return ""
    return value.replace(/_/g, " ").replace(/\s+/g, " ").trim()
  }

  const parseFilenameInfo = (name: string) => {
    const baseName = name.replace(/\.ibt$/i, "")
    const match = baseName.match(/(\d{4}-\d{2}-\d{2})\s(\d{2}-\d{2}-\d{2})$/)
    let dateTime: string | null = null
    let prefix = baseName
    if (match) {
      dateTime = `${match[1]} ${match[2]}`
      prefix = baseName.slice(0, match.index).trim()
    }
    const [carPart, ...trackParts] = prefix.split("_")
    return {
      car: formatFilenameLabel(carPart),
      track: formatFilenameLabel(trackParts.join("_")),
      dateTime,
    }
  }

  const totalSessions = files.length
  const errorSessions = files.filter((file) => file.error).length
  const readySessions = totalSessions - errorSessions
  const scanLabel = lastScanAt ? lastScanAt.toLocaleString() : "Not scanned yet"

  return (
    <div className="relative h-full bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(230,57,70,0.18),_transparent_55%)]" />
      <div className="relative flex h-full flex-col">
        <header className="border-b border-border/60 bg-background/80 backdrop-blur">
          <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-bold shadow-sm">
                  CAE
                </div>
                <div className="leading-tight">
                  <div className="text-sm font-semibold">Ctrl Alt Elite</div>
                  <div className="text-xs text-muted-foreground">Telemetry Hub</div>
                </div>
              </div>
              <Separator orientation="vertical" className="hidden h-8 sm:flex" />
              <Button variant="secondary" size="sm" className="hidden h-8 gap-1.5 sm:inline-flex">
                <BarChart3 className="h-3.5 w-3.5" />
                Overview
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="hidden md:inline-flex">
                {loading ? "Scanning library..." : `Last scan: ${scanLabel}`}
              </Badge>
              <Button variant="outline" size="sm" onClick={loadFiles} disabled={loading}>
                <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
                Refresh
              </Button>
              <Button size="sm" onClick={onFileUpload}>
                <Upload className="h-4 w-4" />
                Upload
              </Button>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-auto">
          <div className="mx-auto w-full max-w-6xl px-4 py-6">
            <section className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
              <Card className="relative overflow-hidden border-border/70 bg-muted/20">
                <div className="pointer-events-none absolute -right-10 -top-14 h-40 w-40 rounded-full bg-[radial-gradient(circle,_rgba(230,57,70,0.35),_transparent_60%)]" />
                <CardHeader className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">Overview</Badge>
                    <Badge variant="outline">{totalSessions} sessions</Badge>
                    {errorSessions > 0 ? (
                      <Badge variant="destructive">{errorSessions} issues</Badge>
                    ) : (
                      <Badge variant="outline">All clear</Badge>
                    )}
                    {loading ? <Badge variant="outline">Scanning...</Badge> : null}
                  </div>
                  <CardTitle className="text-2xl sm:text-3xl">Telemetry Sessions</CardTitle>
                  <CardDescription>
                    Select a session to analyze lap times, compare performance, and visualize telemetry data.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border border-border/60 bg-background/40 p-3">
                    <div className="text-xs text-muted-foreground">Total sessions</div>
                    <div className="text-2xl font-semibold">{totalSessions}</div>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-background/40 p-3">
                    <div className="text-xs text-muted-foreground">Ready to analyze</div>
                    <div className="text-2xl font-semibold">{readySessions}</div>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-background/40 p-3">
                    <div className="text-xs text-muted-foreground">Last scan</div>
                    <div className="text-sm font-semibold">{scanLabel}</div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/70">
                <CardHeader className="space-y-2">
                  <CardTitle className="text-lg">Quick Actions</CardTitle>
                  <CardDescription>Keep your telemetry library organized and ready.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Button className="w-full justify-between gap-3" onClick={onFileUpload}>
                    <span className="flex items-center gap-2">
                      <Upload className="h-4 w-4" />
                      Upload .ibt file
                    </span>
                    <span className="text-xs text-muted-foreground">Manual</span>
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full justify-between gap-3"
                    onClick={loadFiles}
                    disabled={loading}
                  >
                    <span className="flex items-center gap-2">
                      <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
                      Rescan library
                    </span>
                    <span className="text-xs text-muted-foreground">Local</span>
                  </Button>
                  <div className="rounded-lg border border-dashed border-border/70 bg-muted/30 p-3 text-xs text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Drop .ibt files into Documents/iRacing/telemetry to auto-import.
                    </div>
                  </div>
                </CardContent>
              </Card>
            </section>

            <section className="mt-6">
              <Card className="border-border/70">
                <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="text-lg">Telemetry Library</CardTitle>
                    <CardDescription>Pick a session to jump into analysis.</CardDescription>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{readySessions} ready</Badge>
                    {errorSessions > 0 && <Badge variant="destructive">{errorSessions} issues</Badge>}
                  </div>
                </CardHeader>
                <Separator className="mx-6" />
                <CardContent className="pt-6">
                  {error && files.length > 0 && (
                    <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                      <AlertCircle className="h-4 w-4" />
                      <span className="truncate">{error}</span>
                    </div>
                  )}

                  {loading && files.length === 0 ? (
                    <div className="flex min-h-[280px] items-center justify-center">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <Loader2 className="h-8 w-8 animate-spin" />
                        <p className="text-sm">Scanning telemetry files...</p>
                      </div>
                    </div>
                  ) : error && files.length === 0 ? (
                    <div className="flex min-h-[280px] items-center justify-center">
                      <div className="flex max-w-md flex-col items-center gap-3 text-center">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                          <AlertCircle className="h-6 w-6 text-destructive" />
                        </div>
                        <p className="text-sm text-destructive">{error}</p>
                        <Button variant="outline" size="sm" onClick={loadFiles}>
                          Try Again
                        </Button>
                      </div>
                    </div>
                  ) : files.length === 0 ? (
                    <div className="flex min-h-[280px] items-center justify-center">
                      <div className="flex max-w-md flex-col items-center gap-3 text-center">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                          <FileText className="h-6 w-6 text-muted-foreground" />
                        </div>
                        <p className="text-sm font-medium">No telemetry sessions yet</p>
                        <p className="text-xs text-muted-foreground">
                          Place .ibt files in Documents/iRacing/telemetry or upload a file.
                        </p>
                        <Button variant="outline" size="sm" onClick={onFileUpload} className="gap-2">
                          <Upload className="h-4 w-4" />
                          Upload File
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="overflow-hidden rounded-xl border border-border/70">
                      <div className="grid grid-cols-1 gap-2 border-b border-border/60 bg-muted/40 px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground md:grid-cols-[1.4fr_1fr_1fr_0.9fr_0.6fr]">
                        <span>Session</span>
                        <span>Car</span>
                        <span>Track</span>
                        <span>Date & Time</span>
                        <span>Status</span>
                      </div>
                      <div className="divide-y divide-border/60">
                        {files.map((fileInfo) => {
                          const isErrored = Boolean(fileInfo.error)
                          const derived = parseFilenameInfo(fileInfo.name)
                          const carLabel = fileInfo.metadata.carName || derived.car || "Unknown"
                          const trackLabel = fileInfo.metadata.trackName || derived.track || "Unknown"
                          const trackConfig = fileInfo.metadata.trackConfig ? ` / ${fileInfo.metadata.trackConfig}` : ""
                          const dateTimeLabel =
                            fileInfo.metadata.sessionDate || fileInfo.metadata.sessionTime
                              ? `${fileInfo.metadata.sessionDate ?? ""} ${fileInfo.metadata.sessionTime ?? ""}`.trim()
                              : derived.dateTime || "Unknown"
                          const sessionType = fileInfo.metadata.sessionType
                            ? formatSessionType(fileInfo.metadata.sessionType)
                            : null

                          return (
                            <button
                              key={fileInfo.path}
                              type="button"
                              className={cn(
                                "w-full text-left transition",
                                isErrored
                                  ? "cursor-not-allowed bg-destructive/5"
                                  : "hover:bg-muted/40"
                              )}
                              onClick={() => !isErrored && handleFileClick(fileInfo)}
                            >
                              <div className="grid grid-cols-1 gap-3 px-4 py-4 md:grid-cols-[1.4fr_1fr_1fr_0.9fr_0.6fr] md:items-center">
                                <div className="space-y-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="truncate text-sm font-semibold text-foreground">
                                      {fileInfo.name}
                                    </span>
                                    {sessionType && <Badge variant="outline">{sessionType}</Badge>}
                                  </div>
                                  {!isErrored && fileInfo.metadata.lapCount !== undefined && (
                                    <div className="text-xs text-muted-foreground">
                                      {fileInfo.metadata.lapCount} laps
                                    </div>
                                  )}
                                  {isErrored && (
                                    <div className="flex items-center gap-2 text-xs text-destructive">
                                      <AlertCircle className="h-3.5 w-3.5" />
                                      <span className="truncate">{fileInfo.error}</span>
                                    </div>
                                  )}
                                </div>
                                <div className="text-sm text-foreground">
                                  {carLabel}
                                </div>
                                <div className="text-sm text-foreground">
                                  {trackLabel}
                                  {trackConfig && (
                                    <span className="text-xs text-muted-foreground">{trackConfig}</span>
                                  )}
                                </div>
                                <div className="text-sm text-foreground">{dateTimeLabel}</div>
                                <div>
                                  {isErrored ? (
                                    <Badge variant="destructive">Issue</Badge>
                                  ) : (
                                    <Badge variant="secondary">Ready</Badge>
                                  )}
                                </div>
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </section>
          </div>
        </main>
      </div>
    </div>
  )
}

