import { useState, useEffect, useCallback, useMemo } from "react"
import {
  RefreshCw,
  FileText,
  AlertCircle,
  Loader2,
  Upload,
  Search,
  Calendar,
  Clock,
  MapPin,
  ChevronRight,
  TrendingUp,
  Activity
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
  const [searchQuery, setSearchQuery] = useState("")

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
  const scanLabel = lastScanAt ? lastScanAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Not scanned"

  const filteredFiles = useMemo(() => {
    return files.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()))
  }, [files, searchQuery])

  return (
    <div className="relative h-full bg-background text-foreground overflow-hidden flex flex-col">
      {/* Background Ambience */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--primary-color),_transparent_50%)] opacity-20" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(230,57,70,0.08),_transparent_70%)]" />

      <header className="z-10 border-b border-border/40 bg-background/60 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3 select-none">
              <div className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-lg shadow-primary/20">
                <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.2)_50%,transparent_75%)]" />
                <span className="relative font-mono text-xs font-bold tracking-tighter">CAE</span>
              </div>
              <div className="leading-none">
                <div className="font-orbitron text-base font-bold tracking-wide">Ctrl Alt Elite</div>
                <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Telemetry Intelligence</div>
              </div>
            </div>

            <nav className="hidden items-center gap-1 md:flex">
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                Dashboard
              </Button>
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                Analysis
              </Button>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 text-xs text-muted-foreground md:flex">
              <span className="h-2 w-2 rounded-full bg-emerald-500/50 animate-pulse" />
              <span>System Ready</span>
            </div>
            <div className="h-4 w-px bg-border/60 mx-2 hidden md:block" />
            <Button variant="outline" size="sm" onClick={loadFiles} disabled={loading} className="gap-2 border-border/60 bg-background/50 backdrop-blur-sm transition-all hover:bg-background/80">
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
              <span className="hidden sm:inline">Sync</span>
            </Button>
            <Button size="sm" onClick={onFileUpload} className="gap-2 shadow-md shadow-primary/20 transition-all hover:shadow-primary/40">
              <Upload className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Import</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="mx-auto w-full max-w-7xl px-6 py-8 space-y-8">

          {error && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4 flex items-center gap-3 text-sm text-destructive animate-in fade-in slide-in-from-top-2">
              <AlertCircle className="h-5 w-5" />
              <span className="font-medium">{error}</span>
            </div>
          )}

          {/* Hero Section */}
          <section className="grid gap-6 md:grid-cols-12">
            <Card className="md:col-span-8 overflow-hidden border-border/50 bg-gradient-to-br from-muted/30 via-background/50 to-muted/30 shadow-sm backdrop-blur-sm relative group">
              <div className="absolute top-0 right-0 p-32 bg-primary/5 blur-[100px] rounded-full transition-all duration-1000 group-hover:bg-primary/10" />
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-3xl font-bold tracking-tight">Session Overview</CardTitle>
                    <CardDescription className="text-base mt-1">
                      Your racing telemetry library is <span className="text-foreground font-medium">{loading ? "syncing..." : "up to date"}</span>.
                    </CardDescription>
                  </div>
                  <div className="hidden sm:block">
                    <Activity className="h-12 w-12 text-primary/20" />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-3">
                <div className="flex flex-col gap-1 rounded-xl border border-border/40 bg-background/40 p-4 transition-all hover:bg-background/60 hover:border-border/60">
                  <span className="text-sm text-muted-foreground font-medium flex items-center gap-2">
                    <FileText className="h-4 w-4" /> Total Logs
                  </span>
                  <span className="text-3xl font-bold">{totalSessions}</span>
                </div>
                <div className="flex flex-col gap-1 rounded-xl border border-border/40 bg-background/40 p-4 transition-all hover:bg-background/60 hover:border-border/60">
                  <span className="text-sm text-muted-foreground font-medium flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-emerald-500" /> Ready to Analyze
                  </span>
                  <span className="text-3xl font-bold text-foreground">{readySessions}</span>
                </div>
                <div className="flex flex-col gap-1 rounded-xl border border-border/40 bg-background/40 p-4 transition-all hover:bg-background/60 hover:border-border/60">
                  <span className="text-sm text-muted-foreground font-medium flex items-center gap-2">
                    <Clock className="h-4 w-4" /> Last Sync
                  </span>
                  <span className="text-2xl font-semibold tracking-tight">{scanLabel}</span>
                </div>
              </CardContent>
            </Card>

            <Card className="md:col-span-4 border-border/50 bg-background/40 backdrop-blur-sm shadow-sm flex flex-col justify-center">
              <CardHeader>
                <CardTitle className="text-lg">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button variant="outline" className="w-full justify-start h-12 text-left bg-transparent border-border/60 hover:bg-accent/50 hover:border-primary/30 group" onClick={onFileUpload}>
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center mr-3 group-hover:bg-primary/20 transition-colors">
                    <Upload className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex flex-col items-start">
                    <span className="text-sm font-medium">Upload Telemetry</span>
                    <span className="text-[10px] text-muted-foreground">Import .ibt files manually</span>
                  </div>
                </Button>
                <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 p-4 flex flex-col items-center justify-center text-center gap-2 transition-colors hover:bg-muted/30">
                  <p className="text-xs text-muted-foreground max-w-[200px]">
                    Drag & drop .ibt files anywhere to import instantly
                  </p>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Library Section */}
          <section className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold tracking-tight">Recent Sessions</h2>
                <p className="text-sm text-muted-foreground">Select a session to begin detailed telemetry analysis.</p>
              </div>

              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Filter sessions..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-10 rounded-lg border border-border/60 bg-background/50 pl-9 pr-4 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50 transition-all placeholder:text-muted-foreground/60"
                />
              </div>
            </div>

            <div className="rounded-xl border border-border/50 bg-background/40 backdrop-blur-sm shadow-sm overflow-hidden min-h-[400px]">
              {loading && files.length === 0 ? (
                <div className="h-96 flex items-center justify-center flex-col gap-4">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground animate-pulse">Scanning library...</p>
                </div>
              ) : filteredFiles.length === 0 ? (
                <div className="h-96 flex items-center justify-center flex-col gap-4 text-center p-8">
                  <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center mb-2">
                    <Search className="h-8 w-8 text-muted-foreground/50" />
                  </div>
                  <div>
                    <p className="text-lg font-medium">No sessions found</p>
                    <p className="text-sm text-muted-foreground">{searchQuery ? "Try a different search term" : "Add some telemetry files to get started"}</p>
                  </div>
                  {!searchQuery && (
                    <Button variant="outline" onClick={onFileUpload}>Import Files</Button>
                  )}
                </div>
              ) : (
                <div className="w-full">
                  {/* Table Header */}
                  <div className="grid grid-cols-[3fr_2fr_1.5fr_1fr_40px] gap-4 px-6 py-3 bg-muted/30 border-b border-border/50 text-xs font-medium uppercase tracking-wider text-muted-foreground/80">
                    <div>Session Details</div>
                    <div className="hidden md:block">Track Configuration</div>
                    <div>Date & Time</div>
                    <div>Status</div>
                    <div className="sr-only">Action</div>
                  </div>

                  {/* Table Body */}
                  <div className="divide-y divide-border/30">
                    {filteredFiles.map((fileInfo) => {
                      const isErrored = Boolean(fileInfo.error)
                      const parsed = parseFilenameInfo(fileInfo.name)
                      const carName = fileInfo.metadata.carName || parsed.car || "Unknown Car"
                      const trackName = fileInfo.metadata.trackName || parsed.track || "Unknown Track"
                      const displayDate = fileInfo.metadata.sessionDate || parsed.dateTime || "Unknown Date"

                      return (
                        <div
                          key={fileInfo.path}
                          onClick={() => !isErrored && handleFileClick(fileInfo)}
                          className={cn(
                            "group grid grid-cols-[1fr] md:grid-cols-[3fr_2fr_1.5fr_1fr_40px] gap-4 px-6 py-4 items-center transition-all duration-200",
                            isErrored ? "opacity-60 bg-destructive/5" : "hover:bg-accent/50 cursor-pointer"
                          )}
                        >
                          {/* Primary Info */}
                          <div className="flex items-center gap-4 min-w-0">
                            <div className={cn(
                              "h-10 w-10 flex-shrink-0 rounded-lg flex items-center justify-center transition-colors",
                              isErrored ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary group-hover:bg-primary/20"
                            )}>
                              {isErrored ? <AlertCircle className="h-5 w-5" /> : <TrendingUp className="h-5 w-5" />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-foreground truncate">{carName}</p>
                              <p className="text-xs text-muted-foreground truncate font-mono opacity-70">{fileInfo.name}</p>
                            </div>
                          </div>

                          {/* Track Info (Hidden on mobile) */}
                          <div className="hidden md:flex items-center gap-2 text-sm text-foreground/80">
                            <MapPin className="h-3.5 w-3.5 text-muted-foreground/70" />
                            <span className="truncate">{trackName}</span>
                          </div>

                          {/* Date */}
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Calendar className="h-3.5 w-3.5" />
                            <span>{displayDate}</span>
                          </div>

                          {/* Status */}
                          <div>
                            {isErrored ? (
                              <Badge variant="destructive" className="h-6">Error</Badge>
                            ) : (
                              <Badge className="h-6 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border-emerald-500/20 shadow-none">
                                Ready
                              </Badge>
                            )}
                          </div>

                          {/* Arrow */}
                          <div className="flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                            <ChevronRight className="h-5 w-5 text-muted-foreground" />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </section>

        </div>
      </main>
    </div>
  )
}
