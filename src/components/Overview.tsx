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
  Activity,
  Flag,
  Layers,
  Gauge,
  Navigation,
  Car,
  FolderOpen,
  Sparkles,
  ArrowRight,
  User,
  Award,
  ExternalLink,
  Sun,
  Moon
} from "lucide-react"
import { useTheme } from "@/lib/theme-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { scanTelemetryFiles, type TelemetryFileInfo } from "@/lib/telemetry-scanner"
import type { OverviewProps, TelemetrySessionGroup } from "@/components/types"
import { readFile } from "@tauri-apps/plugin-fs"
import { BaseDirectory } from "@tauri-apps/api/path"

// Country name to country code mapping
const COUNTRY_NAME_TO_CODE: Record<string, string> = {
  "United States": "US",
  "Venezuela": "VE",
  "Canada": "CA",
  "Ukraine": "UA",
  "Brazil": "BR",
  "Portugal": "PT",
  "New Zealand": "NZ",
  // Add more mappings as needed
}

function CountryFlag({ countryName }: { countryName: string }) {
  const [flagSvg, setFlagSvg] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadFlag = async () => {
      try {
        const countryCode = COUNTRY_NAME_TO_CODE[countryName] || countryName.slice(0, 2).toUpperCase()
        const response = await fetch(`https://cdn.jsdelivr.net/npm/country-flag-emoji-json@2.0.0/dist/index.json`)
        const flags: Array<{ name: string; code: string; emoji: string; image?: string }> = await response.json()

        // Try to find by exact name match first
        let flag = flags.find((f) =>
          f.name.toLowerCase() === countryName.toLowerCase()
        )

        // If not found, try partial match
        if (!flag) {
          flag = flags.find((f) =>
            f.name.toLowerCase().includes(countryName.toLowerCase()) ||
            countryName.toLowerCase().includes(f.name.toLowerCase())
          )
        }

        // If still not found, try by country code
        if (!flag) {
          flag = flags.find((f) => f.code === countryCode)
        }

        if (flag) {
          // Use the image URL from the JSON if available, otherwise construct it
          if (flag.image) {
            setFlagSvg(flag.image)
          } else {
            // Fallback: construct SVG URL from country code
            const code = flag.code.toLowerCase()
            setFlagSvg(`https://cdn.jsdelivr.net/npm/country-flag-emoji-json@2.0.0/dist/images/${code}.svg`)
          }
        }
      } catch (error) {
        console.error("Failed to load country flag:", error)
      } finally {
        setLoading(false)
      }
    }

    if (countryName) {
      loadFlag()
    }
  }, [countryName])

  if (loading || !flagSvg) {
    return null
  }

  return (
    <img
      src={flagSvg}
      alt={countryName}
      className="h-4 w-6 object-cover rounded border border-border/20"
      title={countryName}
    />
  )
}

export function Overview({ onFilesSelect, onFileUpload }: OverviewProps) {
  const [files, setFiles] = useState<TelemetryFileInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastScanAt, setLastScanAt] = useState<Date | null>(null)
  const [searchQuery, setSearchQuery] = useState("")

  const { theme, setTheme } = useTheme()

  const loadFiles = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }
    setError(null)
    try {
      const scannedFiles = await scanTelemetryFiles()
      setFiles(scannedFiles)
      setLastScanAt(new Date())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadFiles()
  }, [loadFiles])

  const loadFileFromInfo = useCallback(async (fileInfo: TelemetryFileInfo) => {
    const relativePath = `iRacing/telemetry/${fileInfo.name}`
    const fileData = await readFile(relativePath, { baseDir: BaseDirectory.Document })
    const blob = new Blob([new Uint8Array(fileData as ArrayLike<number>)])
    return new File([blob], fileInfo.name, { type: "application/octet-stream" })
  }, [])

  const handleGroupClick = useCallback(
    async (filesToLoad: TelemetryFileInfo[]) => {
      const readyFiles = filesToLoad.filter((file) => !file.error)
      if (readyFiles.length === 0) return
      try {
        setError(null)
        const loadedFiles = await Promise.all(readyFiles.map(loadFileFromInfo))
        onFilesSelect(loadedFiles)
      } catch (err) {
        setError(`Failed to load file: ${err instanceof Error ? err.message : String(err)}`)
      }
    },
    [loadFileFromInfo, onFilesSelect]
  )

  const formatDateDisplay = (date?: string, time?: string) => {
    if (date && time) {
      return `${date} ${time}`
    }
    if (date) {
      return date
    }
    return null
  }

  const formatSessionType = (sessionType?: string, eventType?: string) => {
    const type = sessionType || eventType || ""
    if (!type) return null
    
    // Normalize common iRacing session type names
    const normalized = type.toLowerCase().trim()
    if (normalized.includes("race")) return "Race"
    if (normalized.includes("qualify")) return "Qualifying"
    if (normalized.includes("practice")) return "Practice"
    if (normalized.includes("warmup")) return "Warmup"
    if (normalized.includes("test")) return "Testing"
    
    // Default: capitalize first letter
    return type.charAt(0).toUpperCase() + type.slice(1).toLowerCase()
  }

  const getSessionTypeColor = (sessionType?: string, eventType?: string) => {
    const type = (sessionType || eventType || "").toLowerCase()
    if (type.includes("race")) return "bg-blue-500/10 text-blue-500 border-blue-500/20"
    if (type.includes("qualify") || type.includes("qualifying")) return "bg-purple-500/10 text-purple-500 border-purple-500/20"
    if (type.includes("practice")) return "bg-amber-500/10 text-amber-500 border-amber-500/20"
    return "bg-muted/50 text-muted-foreground border-border/50"
  }

  const formatLocation = (city?: string, state?: string, country?: string) => {
    const parts: string[] = []
    // Remove location field prefixes if present (case-insensitive, handles variations)
    if (city) {
      const cleanedCity = city.replace(/^TrackCity:\s*/i, "").trim()
      if (cleanedCity) parts.push(cleanedCity)
    }
    if (state) {
      const cleanedState = state.replace(/^TrackState:\s*/i, "").trim()
      if (cleanedState) parts.push(cleanedState)
    }
    if (country) {
      const cleanedCountry = country.replace(/^TrackCountry:\s*/i, "").trim()
      if (cleanedCountry && cleanedCountry !== "USA") parts.push(cleanedCountry)
    }
    return parts.length > 0 ? parts.join(", ") : null
  }

  const formatTrackDisplay = (trackDisplayName?: string, trackConfigName?: string) => {
    let cleanedTrackConfigName = trackConfigName
    // Remove "TrackCity: " prefix if present (case-insensitive)
    if (cleanedTrackConfigName) {
      cleanedTrackConfigName = cleanedTrackConfigName.replace(/^TrackCity:\s*/i, "").trim()
    }
    if (trackDisplayName && cleanedTrackConfigName) {
      return `${trackDisplayName} - ${cleanedTrackConfigName}`
    }
    return trackDisplayName || cleanedTrackConfigName || null
  }

  const getSessionTimestamp = useCallback((fileInfo: TelemetryFileInfo) => {
    if (fileInfo.metadata.sessionDate && fileInfo.metadata.sessionTime) {
      return new Date(`${fileInfo.metadata.sessionDate} ${fileInfo.metadata.sessionTime}`).getTime()
    }
    return 0
  }, [])

  const sessionTypeOrder = useCallback((sessionType: string) => {
    const normalized = sessionType.toLowerCase()
    if (normalized.includes("race")) return 0
    if (normalized.includes("qualify")) return 1
    if (normalized.includes("practice")) return 2
    if (normalized.includes("warmup")) return 3
    if (normalized.includes("test")) return 4
    return 5
  }, [])

  const totalSessions = files.length
  const errorSessions = files.filter((file) => file.error).length
  const readySessions = totalSessions - errorSessions
  const scanLabel = lastScanAt ? lastScanAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Not scanned"

  // Calculate insights from metadata
  const totalLaps = useMemo(() => {
    return files.reduce((sum, file) => sum + (file.metadata.lapCount || 0), 0)
  }, [files])

  const totalRecords = useMemo(() => {
    return files.reduce((sum, file) => sum + (file.metadata.recordCount || 0), 0)
  }, [files])

  const mostUsedTrack = useMemo(() => {
    const trackCounts = new Map<string, number>()
    files.forEach(file => {
      const track = file.metadata.trackDisplayName || file.metadata.trackName
      if (track) {
        trackCounts.set(track, (trackCounts.get(track) || 0) + 1)
      }
    })
    let maxTrack = ""
    let maxCount = 0
    trackCounts.forEach((count, track) => {
      if (count > maxCount) {
        maxCount = count
        maxTrack = track
      }
    })
    return { track: maxTrack || "N/A", count: maxCount }
  }, [files])

  const mostUsedCar = useMemo(() => {
    const carCounts = new Map<string, number>()
    files.forEach(file => {
      const car = file.metadata.carName
      if (car) {
        carCounts.set(car, (carCounts.get(car) || 0) + 1)
      }
    })
    let maxCar = ""
    let maxCount = 0
    carCounts.forEach((count, car) => {
      if (count > maxCount) {
        maxCount = count
        maxCar = car
      }
    })
    return { car: maxCar || "N/A", count: maxCount }
  }, [files])

  const averageLapsPerSession = useMemo(() => {
    const sessionsWithLaps = files.filter(f => f.metadata.lapCount && f.metadata.lapCount > 0)
    if (sessionsWithLaps.length === 0) return 0
    const total = sessionsWithLaps.reduce((sum, file) => sum + (file.metadata.lapCount || 0), 0)
    return Math.round(total / sessionsWithLaps.length)
  }, [files])

  // Get driver information from the most recent session
  const driverInfo = useMemo(() => {
    // Find the most recent session with driver info
    const sessionWithDriver = files.find(f => f.metadata.driverName)
    if (sessionWithDriver) {
      return {
        name: sessionWithDriver.metadata.driverName,
        iRating: sessionWithDriver.metadata.driverIRating,
        flairName: sessionWithDriver.metadata.driverFlairName
      }
    }
    return null
  }, [files])

  const groupedSessions = useMemo(() => {
    const grouped = new Map<string, TelemetryFileInfo[]>()

    files.forEach((file) => {
      const seasonID = file.metadata.weekendInfo?.seasonID
      const sessionID = file.metadata.weekendInfo?.sessionID
      const groupKey = sessionID != null
        ? seasonID != null
          ? `season-${seasonID}-session-${sessionID}`
          : `session-${sessionID}`
        : file.path
      const existing = grouped.get(groupKey)
      if (existing) {
        existing.push(file)
      } else {
        grouped.set(groupKey, [file])
      }
    })

    const groups: TelemetrySessionGroup[] = []

    grouped.forEach((groupFiles, groupKey) => {
      const sessionTypes = Array.from(new Set(
        groupFiles
          .map((file) => formatSessionType(file.metadata.sessionType, file.metadata.weekendInfo?.sessionType))
          .filter((value): value is string => Boolean(value))
      )).sort((a, b) => sessionTypeOrder(a) - sessionTypeOrder(b))

      const primaryFile = groupFiles.reduce((latest, file) => {
        const latestTime = getSessionTimestamp(latest)
        const currentTime = getSessionTimestamp(file)
        const latestType = formatSessionType(latest.metadata.sessionType, latest.metadata.weekendInfo?.sessionType)
        const currentType = formatSessionType(file.metadata.sessionType, file.metadata.weekendInfo?.sessionType)
        const latestIsRace = latestType?.toLowerCase().includes("race")
        const currentIsRace = currentType?.toLowerCase().includes("race")
        if (currentIsRace && !latestIsRace) return file
        if (currentTime > latestTime) return file
        return latest
      }, groupFiles[0]!)

      const seasonID = groupFiles.map((file) => file.metadata.weekendInfo?.seasonID).find((value) => value != null)
      const sessionID = groupFiles.map((file) => file.metadata.weekendInfo?.sessionID).find((value) => value != null)
      const subSessionIDs = Array.from(new Set(
        groupFiles
          .map((file) => file.metadata.weekendInfo?.subSessionID)
          .filter((value): value is number => value != null)
      )).sort((a, b) => a - b)

      const trackDisplay = formatTrackDisplay(
        primaryFile.metadata.trackDisplayName,
        primaryFile.metadata.trackConfigName
      ) || primaryFile.metadata.trackName || "Unknown Track"

      const location = formatLocation(
        primaryFile.metadata.weekendInfo?.trackCity,
        primaryFile.metadata.weekendInfo?.trackState,
        primaryFile.metadata.weekendInfo?.trackCountry
      )

      const carName = primaryFile.metadata.carName || "Unknown Car"
      const displayDate = formatDateDisplay(primaryFile.metadata.sessionDate, primaryFile.metadata.sessionTime) || "Unknown Date"
      const totalLaps = groupFiles.reduce((sum, file) => sum + (file.metadata.lapCount || 0), 0)
      const totalRecords = groupFiles.reduce((sum, file) => sum + (file.metadata.recordCount || 0), 0)
      const hasReadyFiles = groupFiles.some((file) => !file.error)
      const hasErrors = groupFiles.some((file) => file.error)

      const raceFile = groupFiles.find((file) => {
        const sessionType = formatSessionType(file.metadata.sessionType, file.metadata.weekendInfo?.sessionType)
        return sessionType?.toLowerCase().includes("race")
      })
      const resultsFile = raceFile ?? primaryFile
      const resultsLink = resultsFile.metadata.weekendInfo?.subSessionID
        ? `https://members-ng.iracing.com/web/racing/results-stats/results?subsessionid=${resultsFile.metadata.weekendInfo.subSessionID}`
        : null

      const searchText = [
        carName,
        trackDisplay,
        location ?? "",
        sessionTypes.join(" "),
        groupFiles.map((file) => file.name).join(" "),
        seasonID != null ? String(seasonID) : "",
        sessionID != null ? String(sessionID) : "",
        subSessionIDs.length > 0 ? subSessionIDs.join(" ") : "",
      ].join(" ").toLowerCase()

      groups.push({
        id: groupKey,
        files: groupFiles,
        primaryFile,
        seasonID,
        sessionID,
        subSessionIDs,
        sessionTypes,
        totalLaps,
        totalRecords,
        displayDate,
        dateSortValue: getSessionTimestamp(primaryFile),
        location,
        trackDisplay,
        carName,
        resultsLink,
        hasReadyFiles,
        hasErrors,
        searchText,
      })
    })

    return groups.sort((a, b) => b.dateSortValue - a.dateSortValue)
  }, [files, formatDateDisplay, formatLocation, formatSessionType, formatTrackDisplay, getSessionTimestamp, sessionTypeOrder])

  const filteredGroups = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return groupedSessions
    return groupedSessions.filter((group) => group.searchText.includes(query))
  }, [groupedSessions, searchQuery])

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
            <Button variant="outline" size="sm" onClick={() => loadFiles(true)} disabled={loading || refreshing} className="gap-2 border-border/60 bg-background/50 backdrop-blur-sm transition-all hover:bg-background/80">
              <RefreshCw className={cn("h-3.5 w-3.5", (loading || refreshing) && "animate-spin")} />
              <span className="hidden sm:inline">Sync</span>
            </Button>
            <Button size="sm" onClick={onFileUpload} className="gap-2 shadow-md shadow-primary/20 transition-all hover:shadow-primary/40">
              <Upload className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Import</span>
            </Button>

            <Button
              variant="outline"
              size="icon"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="h-9 w-9 border-border/60 bg-background/50 backdrop-blur-sm transition-all hover:bg-background/80"
            >
              {theme === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
              <span className="sr-only">Toggle theme</span>
            </Button>

            {/* Driver Profile - Far Right */}
            {driverInfo && (
              <>
                <div className="h-4 w-px bg-border/60 hidden md:block" />
                <div className="hidden md:flex items-center gap-3 px-3 py-2 rounded-lg bg-background/40 border border-border/40 backdrop-blur-sm">
                  <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center border border-primary/20">
                    <User className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold truncate">{driverInfo.name}</span>
                        {driverInfo.iRating && (
                          <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                            <Award className="h-3 w-3 text-amber-500" />
                            <span className="text-xs font-medium text-amber-500">{driverInfo.iRating}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    {driverInfo.flairName && <CountryFlag countryName={driverInfo.flairName} />}
                  </div>
                </div>
              </>
            )}
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
              <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="flex flex-col gap-1 rounded-xl border border-border/40 bg-background/40 p-4 transition-all hover:bg-background/60 hover:border-border/60">
                  <span className="text-sm text-muted-foreground font-medium flex items-center gap-2">
                    <Layers className="h-4 w-4 text-blue-500" /> Total Laps
                  </span>
                  <span className="text-3xl font-bold">{totalLaps.toLocaleString()}</span>
                  <span className="text-xs text-muted-foreground/70">
                    {averageLapsPerSession > 0 ? `~${averageLapsPerSession} avg per session` : "No lap data"}
                  </span>
                </div>
                <div className="flex flex-col gap-1 rounded-xl border border-border/40 bg-background/40 p-4 transition-all hover:bg-background/60 hover:border-border/60">
                  <span className="text-sm text-muted-foreground font-medium flex items-center gap-2">
                    <Gauge className="h-4 w-4 text-purple-500" /> Telemetry Records
                  </span>
                  <span className="text-3xl font-bold">{totalRecords.toLocaleString()}</span>
                  <span className="text-xs text-muted-foreground/70">
                    {totalSessions > 0 ? `${Math.round(totalRecords / totalSessions).toLocaleString()} avg per session` : "No data"}
                  </span>
                </div>
                <div className="flex flex-col gap-1 rounded-xl border border-border/40 bg-background/40 p-4 transition-all hover:bg-background/60 hover:border-border/60">
                  <span className="text-sm text-muted-foreground font-medium flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-emerald-500" /> Most Used Track
                  </span>
                  <span className="text-xl font-bold truncate" title={mostUsedTrack.track}>{mostUsedTrack.track}</span>
                  <span className="text-xs text-muted-foreground/70">
                    {mostUsedTrack.count > 0 ? `${mostUsedTrack.count} ${mostUsedTrack.count === 1 ? 'session' : 'sessions'}` : "No track data"}
                  </span>
                </div>
                <div className="flex flex-col gap-1 rounded-xl border border-border/40 bg-background/40 p-4 transition-all hover:bg-background/60 hover:border-border/60">
                  <span className="text-sm text-muted-foreground font-medium flex items-center gap-2">
                    <Car className="h-4 w-4 text-amber-500" /> Most Used Car
                  </span>
                  <span className="text-xl font-bold truncate" title={mostUsedCar.car}>{mostUsedCar.car}</span>
                  <span className="text-xs text-muted-foreground/70">
                    {mostUsedCar.count > 0 ? `${mostUsedCar.count} ${mostUsedCar.count === 1 ? 'session' : 'sessions'}` : "No car data"}
                  </span>
                </div>
                <div className="flex flex-col gap-1 rounded-xl border border-border/40 bg-background/40 p-4 transition-all hover:bg-background/60 hover:border-border/60">
                  <span className="text-sm text-muted-foreground font-medium flex items-center gap-2">
                    <FileText className="h-4 w-4" /> Total Sessions
                  </span>
                  <span className="text-3xl font-bold">{totalSessions}</span>
                  <span className="text-xs text-muted-foreground/70">
                    {readySessions} ready to analyze
                  </span>
                </div>
                <div className="flex flex-col gap-1 rounded-xl border border-border/40 bg-background/40 p-4 transition-all hover:bg-background/60 hover:border-border/60">
                  <span className="text-sm text-muted-foreground font-medium flex items-center gap-2">
                    <Clock className="h-4 w-4" /> Last Sync
                  </span>
                  <span className="text-2xl font-semibold tracking-tight">{scanLabel}</span>
                  <span className="text-xs text-muted-foreground/70">
                    {refreshing ? "Refreshing..." : "Up to date"}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card className="md:col-span-4 border-border/50 bg-gradient-to-br from-muted/20 via-background/40 to-muted/20 backdrop-blur-sm shadow-sm overflow-hidden relative group">
              <div className="absolute top-0 right-0 p-20 bg-primary/5 blur-[60px] rounded-full transition-all duration-1000 group-hover:bg-primary/10" />
              <CardHeader className="relative z-10">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Sparkles className="h-4 w-4 text-primary" />
                  </div>
                  <CardTitle className="text-lg">Quick Actions</CardTitle>
                </div>
                <CardDescription className="text-xs mt-1">
                  Get started with your telemetry analysis
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2.5 relative z-10">
                <Button
                  variant="outline"
                  className="w-full justify-start h-auto py-3 px-4 text-left bg-background/60 border-border/60 hover:bg-primary/5 hover:border-primary/30 group transition-all"
                  onClick={onFileUpload}
                >
                  <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center mr-3 group-hover:bg-primary/20 group-hover:scale-110 transition-all">
                    <Upload className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex flex-col items-start flex-1 min-w-0">
                    <span className="text-sm font-semibold">Upload Telemetry</span>
                    <span className="text-[10px] text-muted-foreground mt-0.5">Import .ibt files from your computer</span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all ml-auto" />
                </Button>

                <div className="rounded-lg border border-dashed border-border/60 bg-muted/10 p-3.5 flex items-start gap-3 transition-all hover:bg-muted/20 hover:border-primary/30 group">
                  <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-500/20 transition-colors">
                    <FolderOpen className="h-4 w-4 text-emerald-500" />
                  </div>
                  <div className="flex flex-col gap-1 min-w-0 flex-1">
                    <span className="text-xs font-medium text-foreground">Auto-sync Enabled</span>
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                      Files in <code className="text-[9px] bg-muted/50 px-1 py-0.5 rounded">iRacing/telemetry</code> are automatically detected
                    </p>
                  </div>
                </div>

                <div className="rounded-lg border border-dashed border-primary/20 bg-primary/5 p-3.5 flex items-start gap-3 transition-all hover:bg-primary/10 hover:border-primary/30 group">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/20 transition-colors">
                    <Sparkles className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex flex-col gap-1 min-w-0 flex-1">
                    <span className="text-xs font-medium text-foreground">Drag & Drop</span>
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                      Drop .ibt files anywhere in the app to import instantly
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Library Section */}
          <section className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold tracking-tight">Recent Sessions</h2>
                <p className="text-sm text-muted-foreground">Select a weekend to begin detailed telemetry analysis.</p>
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
                  <p className="text-sm text-muted-foreground animate-pulse">
                    {loading ? "Loading library..." : refreshing ? "Refreshing metadata..." : "Scanning library..."}
                  </p>
                </div>
              ) : filteredGroups.length === 0 ? (
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
                  <div className="grid grid-cols-[1fr] md:grid-cols-[2.5fr_2fr_1fr_1fr_1fr_40px] gap-4 px-6 py-3 bg-muted/30 border-b border-border/50 text-xs font-medium uppercase tracking-wider text-muted-foreground/80">
                    <div>Session Details</div>
                    <div className="hidden md:block">Track & Location</div>
                    <div className="hidden md:block">Session Type</div>
                    <div className="hidden md:block">Laps & Records</div>
                    <div>Date & Time</div>
                    <div className="sr-only">Action</div>
                  </div>

                  {/* Table Body */}
                  <div className="divide-y divide-border/30">
                    {filteredGroups.map((group) => {
                      const isErrored = !group.hasReadyFiles
      const sessionIdLabel = group.sessionID != null
        ? group.seasonID != null
          ? `Season ${group.seasonID} - Session ${group.sessionID}`
          : `Session ${group.sessionID}`
        : group.primaryFile.name
                      const sessionCountLabel = group.files.length > 1 ? `${group.files.length} sessions` : null

                      return (
                        <div
                          key={group.id}
                          onClick={() => !isErrored && handleGroupClick(group.files)}
                          className={cn(
                            "group grid grid-cols-[1fr] md:grid-cols-[2.5fr_2fr_1fr_1fr_1fr_40px] gap-4 px-6 py-4 items-center transition-all duration-200",
                            isErrored ? "opacity-60 bg-destructive/5" : "hover:bg-accent/50 cursor-pointer"
                          )}
                        >
                          <div className="flex items-center gap-4 min-w-0">
                            <div className={cn(
                              "h-10 w-10 flex-shrink-0 rounded-lg flex items-center justify-center transition-colors",
                              isErrored ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary group-hover:bg-primary/20"
                            )}>
                              {isErrored ? <AlertCircle className="h-5 w-5" /> : <TrendingUp className="h-5 w-5" />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-semibold text-foreground truncate">{group.carName}</p>
                              </div>
                              <div className="flex items-center gap-3 mt-1 flex-wrap">
                                <p className="text-xs text-muted-foreground truncate font-mono opacity-70">{sessionIdLabel}</p>
                                {sessionCountLabel && (
                                  <span className="text-xs text-muted-foreground/70 flex items-center gap-1">
                                    <Flag className="h-3 w-3" />
                                    {sessionCountLabel}
                                  </span>
                                )}
                                {group.totalLaps > 0 && (
                                  <span className="text-xs text-muted-foreground/70 flex items-center gap-1">
                                    <Layers className="h-3 w-3" />
                                    {group.totalLaps} {group.totalLaps === 1 ? "lap" : "laps"}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-col gap-1 min-w-0">
                            <div className="flex items-center gap-2 text-sm text-foreground/80">
                              <MapPin className="h-3.5 w-3.5 text-muted-foreground/70 flex-shrink-0" />
                              <span className="truncate">{group.trackDisplay}</span>
                            </div>
                            {group.location && (
                              <div className="flex items-center gap-2 text-xs text-muted-foreground/70">
                                <Navigation className="h-3 w-3 text-muted-foreground/50 flex-shrink-0" />
                                <span className="truncate">{group.location}</span>
                              </div>
                            )}
                          </div>

                          <div className="hidden md:flex items-center gap-2 flex-wrap">
                            {group.sessionTypes.length > 0 ? (
                              group.sessionTypes.map((sessionType) => (
                                <Badge key={sessionType} className={cn("h-6 border", getSessionTypeColor(sessionType))}>
                                  <Flag className="h-3 w-3 mr-1.5" />
                                  {sessionType}
                                </Badge>
                              ))
                            ) : (
                              <span className="text-xs text-muted-foreground/50">-</span>
                            )}
                          </div>

                          <div className="hidden md:flex flex-col gap-1 text-xs text-muted-foreground">
                            {group.totalLaps > 0 ? (
                              <div className="flex items-center gap-1.5">
                                <Layers className="h-3 w-3 text-muted-foreground/70" />
                                <span>{group.totalLaps} {group.totalLaps === 1 ? "lap" : "laps"}</span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground/50">-</span>
                            )}
                            {group.totalRecords > 0 ? (
                              <div className="flex items-center gap-1.5">
                                <Gauge className="h-3 w-3 text-muted-foreground/70" />
                                <span>{group.totalRecords.toLocaleString()} records</span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground/50">-</span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
                            <span className="truncate">{group.displayDate}</span>
                          </div>

                          <div className="flex justify-end items-center gap-2">
                            {group.resultsLink && (
                              <a
                                href={group.resultsLink}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(event) => event.stopPropagation()}
                                aria-label="Open iRacing results"
                                className="text-muted-foreground hover:text-foreground opacity-80 hover:opacity-100 transition-opacity"
                              >
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            )}
                            <ChevronRight className="h-5 w-5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
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
