import type { IbtLapPoint } from "@/components/lap-analysis/types"
import type { TrackMapCorner, TrackMapData } from "@/components/track/types"
import type { IbtWeekendInfo } from "@/lib/ibt"
import { interpolateGps, interpolateValue } from "@/lib/telemetry-utils"

type BuildTrackMapParams = {
  leftLapPoints: IbtLapPoint[]
  rightLapPoints: IbtLapPoint[]
  leftLapNumber: number
  rightLapNumber: number
  trackKey: string
  trackName: string | null
  trackConfigName: string | null
  trackId: number | null
  corners?: TrackMapCorner[]
  sampleCount?: number
}

const DEFAULT_SAMPLE_COUNT = 900

function normalizeTrackKey(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
}

export function createTrackKey(weekendInfo: IbtWeekendInfo | null): string | null {
  if (!weekendInfo) return null

  const baseName =
    weekendInfo.trackDisplayName ??
    weekendInfo.trackName ??
    weekendInfo.trackDisplayShortName ??
    null

  if (!baseName) return null

  const configName = weekendInfo.trackConfigName ?? null
  const parts = configName && !baseName.toLowerCase().includes(configName.toLowerCase())
    ? `${baseName} ${configName}`
    : baseName

  const key = normalizeTrackKey(parts)
  return key.length > 0 ? key : null
}

export function buildTrackMapData({
  leftLapPoints,
  rightLapPoints,
  leftLapNumber,
  rightLapNumber,
  trackKey,
  trackName,
  trackConfigName,
  trackId,
  corners,
  sampleCount = DEFAULT_SAMPLE_COUNT,
}: BuildTrackMapParams): TrackMapData {
  if (leftLapPoints.length < 2 || rightLapPoints.length < 2) {
    throw new Error("Both edge laps must contain at least two points.")
  }

  const leftMaxDistance = leftLapPoints[leftLapPoints.length - 1]!.distanceKm
  const rightMaxDistance = rightLapPoints[rightLapPoints.length - 1]!.distanceKm
  const maxDistance = Math.min(leftMaxDistance, rightMaxDistance)

  if (!Number.isFinite(maxDistance) || maxDistance <= 0) {
    throw new Error("Edge laps do not contain usable lap distance values.")
  }

  const count = Math.max(2, Math.floor(sampleCount))
  const points: TrackMapData["points"] = []
  for (let i = 0; i < count; i++) {
    const distanceKm = (i / (count - 1)) * maxDistance
    const left = interpolateGps(leftLapPoints, distanceKm)
    const right = interpolateGps(rightLapPoints, distanceKm)
    if (!left || !right) continue

    const leftAltitudeM = interpolateValue(leftLapPoints, distanceKm, "distanceKm", (p) => p.altitudeM)
    const rightAltitudeM = interpolateValue(rightLapPoints, distanceKm, "distanceKm", (p) => p.altitudeM)

    points.push({
      distanceKm,
      left: { lat: left.lat, lon: left.lon, altitudeM: leftAltitudeM },
      right: { lat: right.lat, lon: right.lon, altitudeM: rightAltitudeM },
    })
  }

  if (points.length < 2) {
    throw new Error("Unable to build a track mesh from the selected laps.")
  }

  const sortedCorners = (corners ?? [])
    .map((corner) => {
      const leftAlt = interpolateValue(leftLapPoints, corner.distanceKm, "distanceKm", (p) => p.altitudeM)
      const rightAlt = interpolateValue(rightLapPoints, corner.distanceKm, "distanceKm", (p) => p.altitudeM)
      const altitudeM =
        corner.altitudeM ??
        (leftAlt != null && rightAlt != null ? (leftAlt + rightAlt) / 2 : leftAlt ?? rightAlt ?? null)
      return { ...corner, altitudeM }
    })
    .sort((a, b) => a.distanceKm - b.distanceKm)

  return {
    version: 1,
    trackKey,
    trackName,
    trackConfigName,
    trackId,
    leftLap: leftLapNumber,
    rightLap: rightLapNumber,
    points,
    corners: sortedCorners,
  }
}

export function isTrackMapData(value: unknown): value is TrackMapData {
  if (!value || typeof value !== "object") return false
  const record = value as {
    version?: number
    trackKey?: string
    points?: Array<{
      distanceKm?: number
      left?: { lat?: number; lon?: number; altitudeM?: number | null }
      right?: { lat?: number; lon?: number; altitudeM?: number | null }
    }>
    trackId?: number | null
    corners?: Array<{
      distanceKm?: number
      lat?: number
      lon?: number
      altitudeM?: number | null
    }>
  }

  if (record.version !== 1) return false
  if (!record.trackKey || typeof record.trackKey !== "string") return false
  if (!Array.isArray(record.points) || record.points.length < 2) return false
  if (record.trackId != null && typeof record.trackId !== "number") return false

  const point = record.points[0]
  if (!point) return false
  if (typeof point.distanceKm !== "number") return false
  if (!point.left || typeof point.left.lat !== "number" || typeof point.left.lon !== "number") return false
  if (!point.right || typeof point.right.lat !== "number" || typeof point.right.lon !== "number") return false

  if (record.corners != null) {
    if (!Array.isArray(record.corners)) return false
    for (const corner of record.corners) {
      if (!corner) return false
      if (typeof corner.distanceKm !== "number") return false
      if (typeof corner.lat !== "number") return false
      if (typeof corner.lon !== "number") return false
      if (corner.altitudeM != null && typeof corner.altitudeM !== "number") return false
    }
  }

  return true
}
