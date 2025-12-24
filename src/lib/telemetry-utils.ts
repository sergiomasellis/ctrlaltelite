import type { IbtLapPoint } from "@/components/lap-analysis/types"

export function formatLapTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "—"
  const ms = Math.round(seconds * 1000)
  const m = Math.floor(ms / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  const milli = ms % 1000
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(milli).padStart(3, "0")}`
}

export function formatDeltaSeconds(deltaSec: number) {
  if (!Number.isFinite(deltaSec)) return "—"
  const sign = deltaSec >= 0 ? "+" : "-"
  return `${sign}${Math.abs(deltaSec).toFixed(3)}s`
}

export function formatSectorTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "—"
  return `${seconds.toFixed(3)}s`
}

function binarySearchLowerBound(points: IbtLapPoint[], x: number, xKey: "distanceKm" | "timeSec") {
  // returns greatest index i such that points[i][xKey] <= x
  let lo = 0
  let hi = points.length - 1
  let ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const v = points[mid][xKey]
    if (v <= x) {
      ans = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return ans
}

export function interpolateValue(
  points: IbtLapPoint[],
  x: number,
  xKey: "distanceKm" | "timeSec",
  getY: (p: IbtLapPoint) => number | null,
): number | null {
  if (points.length === 0) return null
  const xMin = points[0][xKey]
  const xMax = points[points.length - 1][xKey]
  if (x < xMin || x > xMax) return null

  const i = binarySearchLowerBound(points, x, xKey)
  if (i < 0) return null
  if (i >= points.length - 1) return getY(points[points.length - 1])

  const p0 = points[i]
  const p1 = points[i + 1]
  const x0 = p0[xKey]
  const x1 = p1[xKey]
  const y0 = getY(p0)
  const y1 = getY(p1)
  if (y0 == null || y1 == null) return null
  if (x1 === x0) return y0

  const t = (x - x0) / (x1 - x0)
  return y0 + (y1 - y0) * t
}

// Calculate distance between two GPS coordinates using Haversine formula
// Returns distance in meters
export function gpsDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000 // Earth's radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

// Interpolate GPS coordinates at a given distance
export function interpolateGps(
  points: IbtLapPoint[],
  distanceKm: number,
): { lat: number; lon: number } | null {
  if (points.length === 0) return null
  
  const lat = interpolateValue(points, distanceKm, "distanceKm", (p) => p.lat)
  const lon = interpolateValue(points, distanceKm, "distanceKm", (p) => p.lon)
  
  if (lat == null || lon == null) return null
  return { lat, lon }
}

// Calculate signed perpendicular distance from a point to a line segment
// Returns positive if point is to the left of the line (when looking in direction of travel), negative if to the right
export function perpendicularDistanceMeters(
  pointLat: number,
  pointLon: number,
  lineStartLat: number,
  lineStartLon: number,
  lineEndLat: number,
  lineEndLon: number,
): number {
  // Convert to local coordinates (meters) for simpler calculation
  // Use a simple approximation: 1 degree lat ≈ 111km, 1 degree lon ≈ 111km * cos(lat)
  const latToMeters = 111000
  const lonToMeters = 111000 * Math.cos((lineStartLat * Math.PI) / 180)
  
  const px = (pointLon - lineStartLon) * lonToMeters
  const py = (pointLat - lineStartLat) * latToMeters
  const dx = (lineEndLon - lineStartLon) * lonToMeters
  const dy = (lineEndLat - lineStartLat) * latToMeters
  
  // Calculate perpendicular distance using cross product
  // The sign indicates which side of the line the point is on
  const crossProduct = dx * py - dy * px
  const lineLength = Math.sqrt(dx * dx + dy * dy)
  
  if (lineLength === 0) {
    // Line segment has zero length, just return straight-line distance
    return Math.sqrt(px * px + py * py)
  }
  
  // Perpendicular distance (signed)
  return crossProduct / lineLength
}





