import { Flag, MapPin, Calendar, Trophy, Clock } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { LAP_COLOR_PALETTE } from "./constants"
import type { IbtLapData } from "./types"
import type { IbtWeekendInfo, IbtSessionsByNum, IbtSessionResultPosition } from "@/lib/ibt"

interface SessionInfoProps {
  selectedLaps: number[]
  lapDataByLap: Record<number, IbtLapData> | null
  lapColors: Record<number, string>
  weekendInfo: IbtWeekendInfo | null
  sessionsByNum: IbtSessionsByNum
  driverCarIdx: number | null
}

const getSessionTypeColor = (sessionType?: string) => {
  if (!sessionType) return "bg-muted/50 text-muted-foreground border-border/50"
  const type = sessionType.toLowerCase()
  if (type.includes("race")) return "bg-blue-500/10 text-blue-500 border-blue-500/20"
  if (type.includes("qualify") || type.includes("qualifying")) return "bg-purple-500/10 text-purple-500 border-purple-500/20"
  if (type.includes("practice")) return "bg-amber-500/10 text-amber-500 border-amber-500/20"
  return "bg-muted/50 text-muted-foreground border-border/50"
}

const formatSessionType = (sessionType?: string) => {
  if (!sessionType) return "Unknown"
  const normalized = sessionType.toLowerCase().trim()
  if (normalized.includes("race")) return "Race"
  if (normalized.includes("qualify")) return "Qualifying"
  if (normalized.includes("practice")) return "Practice"
  if (normalized.includes("warmup")) return "Warmup"
  if (normalized.includes("test")) return "Testing"
  return sessionType.charAt(0).toUpperCase() + sessionType.slice(1).toLowerCase()
}

export function SessionInfo({
  selectedLaps,
  lapDataByLap,
  lapColors,
  weekendInfo,
  sessionsByNum,
  driverCarIdx,
}: SessionInfoProps) {
  if (!lapDataByLap || selectedLaps.length === 0) {
    return null
  }

  // Group laps by session type
  const lapsBySession: Record<string, number[]> = {}
  selectedLaps.forEach((lap) => {
    const lapData = lapDataByLap[lap]
    const sessionType = lapData?.sessionType || weekendInfo?.sessionType || "Unknown"
    if (!lapsBySession[sessionType]) {
      lapsBySession[sessionType] = []
    }
    lapsBySession[sessionType].push(lap)
  })

  // Format location string
  const formatLocation = () => {
    if (!weekendInfo) return null
    const parts: string[] = []
    // Remove location field prefixes if present (case-insensitive, handles variations)
    if (weekendInfo.trackCity) {
      const cleanedCity = weekendInfo.trackCity.replace(/^TrackCity:\s*/i, "").trim()
      if (cleanedCity) parts.push(cleanedCity)
    }
    if (weekendInfo.trackState) {
      const cleanedState = weekendInfo.trackState.replace(/^TrackState:\s*/i, "").trim()
      if (cleanedState) parts.push(cleanedState)
    }
    if (weekendInfo.trackCountry) {
      const cleanedCountry = weekendInfo.trackCountry.replace(/^TrackCountry:\s*/i, "").trim()
      if (cleanedCountry && cleanedCountry !== "USA") parts.push(cleanedCountry)
    }
    return parts.length > 0 ? parts.join(", ") : null
  }

  // Format track display name
  const formatTrackName = () => {
    if (!weekendInfo) return null
    let trackConfigName = weekendInfo.trackConfigName
    // Remove "TrackCity: " prefix if present (case-insensitive)
    if (trackConfigName) {
      trackConfigName = trackConfigName.replace(/^TrackCity:\s*/i, "").trim()
    }
    if (weekendInfo.trackDisplayName && trackConfigName) {
      return `${weekendInfo.trackDisplayName} - ${trackConfigName}`
    }
    return weekendInfo.trackDisplayName || trackConfigName || null
  }

  const location = formatLocation()
  const trackName = formatTrackName()
  const eventType = weekendInfo?.sessionType
  const eventDate = weekendInfo?.eventDate

  return (
    <div className="p-3">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Session Info</span>
      </div>

      <div className="space-y-3 text-xs">
        {/* Weekend Info Metadata */}
        {weekendInfo && (
          <div className="space-y-2 pb-2 border-b border-border/40">
            {eventType && (
              <div className="flex items-center gap-2">
                <Badge className={cn("h-5 text-[10px] border", getSessionTypeColor(eventType))}>
                  <Flag className="h-2.5 w-2.5 mr-1" />
                  {formatSessionType(eventType)}
                </Badge>
              </div>
            )}
            
            {trackName && (
              <div className="flex items-start gap-1.5 text-[10px]">
                <MapPin className="h-3 w-3 text-muted-foreground/70 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-foreground/80 truncate">{trackName}</div>
                  {location && (
                    <div className="text-muted-foreground/70 truncate">{location}</div>
                  )}
                </div>
              </div>
            )}
            
            {(eventDate || weekendInfo.eventTime) && (
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/70">
                <Calendar className="h-3 w-3 flex-shrink-0" />
                <span>
                  {eventDate}
                  {weekendInfo.eventTime && ` • ${weekendInfo.eventTime}`}
                </span>
              </div>
            )}
            
            {weekendInfo.category && (
              <div className="text-[10px] text-muted-foreground/60">
                Category: {weekendInfo.category}
                {weekendInfo.official === 1 && " • Official"}
              </div>
            )}
            
            {weekendInfo.trackLengthOfficial && (
              <div className="text-[10px] text-muted-foreground/60">
                Track: {weekendInfo.trackLengthOfficial}
                {weekendInfo.trackNumTurns && ` • ${weekendInfo.trackNumTurns} turns`}
              </div>
            )}
          </div>
        )}

        {/* Sessions List */}
        {Object.keys(sessionsByNum).length > 0 && (
          <div className="space-y-2 pb-2 border-b border-border/40">
            <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
              Sessions
            </div>
            {Object.values(sessionsByNum)
              .sort((a, b) => a.sessionNum - b.sessionNum)
              .map((session) => {
                const formattedType = formatSessionType(session.sessionType)
                const colorClass = getSessionTypeColor(session.sessionType)
                
                // Find driver's position in this session
                const driverPosition = driverCarIdx != null && session.resultsPositions
                  ? session.resultsPositions.find((p: IbtSessionResultPosition) => p.carIdx === driverCarIdx)
                  : null
                
                return (
                  <div key={session.sessionNum} className="space-y-1.5 p-2 rounded border border-border/30 bg-background/20">
                    <div className="flex items-center gap-2">
                      <Badge className={cn("h-5 text-[10px] border", colorClass)}>
                        <Flag className="h-2.5 w-2.5 mr-1" />
                        {formattedType}
                      </Badge>
                      {driverPosition && (
                        <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/10 border border-primary/20">
                          <Trophy className="h-2.5 w-2.5 text-primary" />
                          <span className="text-[10px] font-semibold text-primary">
                            P{driverPosition.position}
                          </span>
                        </div>
                      )}
                    </div>
                    
                    <div className="space-y-1 text-[10px] text-muted-foreground/70">
                      {session.sessionLaps && (
                        <div className="flex items-center gap-1">
                          <span>Laps: {session.sessionLaps}</span>
                        </div>
                      )}
                      {session.sessionTime && (
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          <span>{(session.sessionTime / 60).toFixed(1)} min</span>
                        </div>
                      )}
                      {driverPosition && (
                        <div className="space-y-0.5 pt-1 border-t border-border/20">
                          <div>Fastest: Lap {driverPosition.fastestLap} ({driverPosition.fastestTime.toFixed(3)}s)</div>
                          <div>Laps Complete: {driverPosition.lapsComplete}</div>
                          {driverPosition.incidents > 0 && (
                            <div className="text-red-400">Incidents: {driverPosition.incidents}</div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
          </div>
        )}

        {/* Laps by Session Type */}
        {Object.keys(lapsBySession).length > 0 && (
          <div className="space-y-2">
            <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
              Laps by Session
            </div>
            {Object.entries(lapsBySession).map(([sessionType, laps]) => {
              const formattedType = formatSessionType(sessionType)
              const colorClass = getSessionTypeColor(sessionType)
              
              return (
                <div key={sessionType} className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Badge className={cn("h-5 text-[10px] border", colorClass)}>
                      <Flag className="h-2.5 w-2.5 mr-1" />
                      {formattedType}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">
                      {laps.length} {laps.length === 1 ? "lap" : "laps"}
                    </span>
                  </div>
                  
                  {/* Show lap numbers with their colors */}
                  <div className="flex flex-wrap items-center gap-1.5 pl-1">
                    {laps.map((lap) => {
                      const color = lapColors[lap] ?? LAP_COLOR_PALETTE[0]
                      const isRef = lap === selectedLaps[0]
                      return (
                        <div
                          key={lap}
                          className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-border/40 bg-background/40"
                        >
                          <div
                            className="h-2 w-2 rounded-sm"
                            style={{ backgroundColor: color }}
                          />
                          <span className={`text-[10px] tabular-nums ${isRef ? "font-semibold" : ""}`}>
                            {isRef ? "REF" : `L${lap}`}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
