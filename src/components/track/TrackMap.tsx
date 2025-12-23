import { useRef, useMemo, useCallback } from "react"
import type { IbtLapData, IbtLapPoint } from "@/components/lap-analysis/types"
import { LAP_COLOR_PALETTE } from "@/components/lap-analysis/constants"
import { useCursorSubscription } from "@/lib/cursorStore"

interface TrackMapProps {
  lapDataByLap: Record<number, IbtLapData> | null
  selectedLaps: number[]
  lapColors: Record<number, string>
}

// Track SVG path - realistic racing circuit
export function TrackMap({
  lapDataByLap,
  selectedLaps,
  lapColors,
}: TrackMapProps) {
  // Ref for the cursor group element - updated via subscription
  const cursorGroupRef = useRef<SVGGElement>(null)
  // Calculate bounds from all selected laps
  const bounds = useMemo(() => {
    if (!lapDataByLap || selectedLaps.length === 0) return null
    
    let minLat = Infinity
    let maxLat = -Infinity
    let minLon = Infinity
    let maxLon = -Infinity
    
    for (const lap of selectedLaps) {
      const lapData = lapDataByLap[lap]
      if (!lapData) continue
      
      for (const p of lapData.byDist) {
        if (p.lat != null && p.lon != null) {
          minLat = Math.min(minLat, p.lat)
          maxLat = Math.max(maxLat, p.lat)
          minLon = Math.min(minLon, p.lon)
          maxLon = Math.max(maxLon, p.lon)
        }
      }
    }
    
    if (!Number.isFinite(minLat)) return null
    
    return { minLat, maxLat, minLon, maxLon }
  }, [lapDataByLap, selectedLaps])

  // Calculate SVG dimensions and aspect ratio based on GPS bounds
  const svgDimensions = useMemo(() => {
    if (!bounds) return { width: 400, height: 320, padding: 20 }
    
    const latRange = bounds.maxLat - bounds.minLat || 0.001
    const lonRange = bounds.maxLon - bounds.minLon || 0.001
    
    // Account for longitude compression at higher latitudes
    // Average latitude for the track
    const avgLat = (bounds.minLat + bounds.maxLat) / 2
    const lonScale = Math.cos((avgLat * Math.PI) / 180)
    
    // Calculate the actual aspect ratio of the GPS data
    const gpsAspectRatio = (lonRange * lonScale) / latRange
    
    // Base dimensions (can be adjusted)
    const baseWidth = 800
    const baseHeight = 600
    const padding = 20
    
    // Calculate dimensions that preserve the GPS aspect ratio
    let width: number
    let height: number
    
    if (gpsAspectRatio > baseWidth / baseHeight) {
      // GPS data is wider - fit to width
      width = baseWidth
      height = baseWidth / gpsAspectRatio
    } else {
      // GPS data is taller - fit to height
      height = baseHeight
      width = baseHeight * gpsAspectRatio
    }
    
    return { width, height, padding }
  }, [bounds])

  // Convert GPS coordinates to SVG coordinates
  const gpsToSvg = useCallback((lat: number, lon: number): { x: number; y: number } | null => {
    if (!bounds) return null
    
    const latRange = bounds.maxLat - bounds.minLat || 0.001
    const lonRange = bounds.maxLon - bounds.minLon || 0.001
    
    const { width, height, padding } = svgDimensions
    const plotWidth = width - padding * 2
    const plotHeight = height - padding * 2
    
    const x = padding + ((lon - bounds.minLon) / lonRange) * plotWidth
    const y = padding + ((bounds.maxLat - lat) / latRange) * plotHeight // Invert Y axis
    
    return { x, y }
  }, [bounds, svgDimensions])

  // Convert GPS coordinates to SVG path
  const gpsToSvgPath = useCallback((points: IbtLapPoint[]): string => {
    const validPoints = points.filter((p) => p.lat != null && p.lon != null)
    if (validPoints.length === 0) return ""

    const pathParts: string[] = []
    let first = true

    for (const p of validPoints) {
      const svgPos = gpsToSvg(p.lat!, p.lon!)
      if (!svgPos) continue

      if (first) {
        pathParts.push(`M ${svgPos.x.toFixed(2)} ${svgPos.y.toFixed(2)}`)
        first = false
      } else {
        pathParts.push(`L ${svgPos.x.toFixed(2)} ${svgPos.y.toFixed(2)}`)
      }
    }

    return pathParts.join(" ")
  }, [gpsToSvg])

  // Generate paths for selected laps
  const lapPaths = useMemo(() => {
    if (!lapDataByLap || selectedLaps.length === 0) return []
    return selectedLaps.map((lap) => {
      const lapData = lapDataByLap[lap]
      if (!lapData) return null
      const color = lapColors[lap] ?? LAP_COLOR_PALETTE[0]
      const path = gpsToSvgPath(lapData.byDist)
      return { lap, path, color, lapData }
    }).filter((p): p is { lap: number; path: string; color: string; lapData: IbtLapData } => p != null && p.path !== "")
  }, [lapDataByLap, selectedLaps, lapColors, gpsToSvgPath])

  // Build array of valid GPS points for interpolation (memoized separately for performance)
  const validGpsPoints = useMemo(() => {
    if (!lapDataByLap || selectedLaps.length === 0) return []
    
    const refLap = selectedLaps[0]
    if (refLap == null) return []
    
    const lapData = lapDataByLap[refLap]
    if (!lapData) return []
    
    // Filter to only points with valid GPS coordinates, sorted by distance
    return lapData.byDist
      .filter((p): p is IbtLapPoint & { lat: number; lon: number } => 
        p.lat != null && p.lon != null && Number.isFinite(p.lat) && Number.isFinite(p.lon)
      )
      .sort((a, b) => a.distanceKm - b.distanceKm)
  }, [lapDataByLap, selectedLaps])

  // Get total lap distance for percentage calculation
  const totalLapDistance = useMemo(() => {
    if (!lapDataByLap || selectedLaps.length === 0) return 0
    const refLap = selectedLaps[0]
    if (refLap == null) return 0
    const lapData = lapDataByLap[refLap]
    return lapData?.distanceKm ?? 0
  }, [lapDataByLap, selectedLaps])

  // Get reference lap color
  const refLapColor = useMemo(() => {
    const refLap = selectedLaps[0]
    if (refLap == null) return LAP_COLOR_PALETTE[0]
    return lapColors[refLap] ?? LAP_COLOR_PALETTE[0]
  }, [selectedLaps, lapColors])

  // Subscribe to cursor updates and directly manipulate SVG elements
  useCursorSubscription((cursorDistance) => {
    const g = cursorGroupRef.current
    if (!g) return
    
    // Hide if no valid cursor position
    if (cursorDistance == null || !bounds || validGpsPoints.length < 2 || totalLapDistance <= 0) {
      g.style.display = 'none'
      return
    }
    
    // Calculate percentage through the lap (0 to 1)
    const lapPercentage = Math.max(0, Math.min(1, cursorDistance / totalLapDistance))
    
    // Map percentage to an index in the valid GPS points array
    const floatIndex = lapPercentage * (validGpsPoints.length - 1)
    const indexLo = Math.floor(floatIndex)
    const indexHi = Math.min(indexLo + 1, validGpsPoints.length - 1)
    const t = floatIndex - indexLo // Fractional part for interpolation
    
    const p0 = validGpsPoints[indexLo]
    const p1 = validGpsPoints[indexHi]
    if (!p0 || !p1) {
      g.style.display = 'none'
      return
    }
    
    // Linear interpolation between the two GPS points
    const lat = p0.lat + (p1.lat - p0.lat) * t
    const lon = p0.lon + (p1.lon - p0.lon) * t
    
    // Use the same gpsToSvg function that the track paths use for consistent positioning
    const svgPos = gpsToSvg(lat, lon)
    if (!svgPos) {
      g.style.display = 'none'
      return
    }
    
    // Update all circle elements directly
    g.style.display = 'block'
    const circles = g.querySelectorAll('circle')
    circles.forEach(circle => {
      circle.setAttribute('cx', String(svgPos.x))
      circle.setAttribute('cy', String(svgPos.y))
    })
  }, [bounds, gpsToSvg, validGpsPoints, totalLapDistance])

  // Fallback to mock track if no GPS data
  if (lapPaths.length === 0) {
    const trackPath = `
      M 50 120
      C 72 70, 95 50, 130 45
      C 165 40, 200 55, 230 75
      C 260 95, 280 120, 290 150
      C 300 180, 295 210, 275 235
      C 255 260, 220 275, 180 280
      C 140 285, 100 275, 70 255
      C 40 235, 25 200, 30 165
      C 35 130, 45 115, 50 120
      M 180 280
      C 200 270, 230 250, 260 220
      C 290 190, 320 150, 340 120
      C 360 90, 370 70, 365 55
      C 360 40, 340 35, 315 40
      C 290 45, 260 60, 230 75
    `
    return (
      <svg viewBox="0 0 400 320" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
        <path d={trackPath} fill="none" stroke="#2a2a2a" strokeWidth="28" strokeLinecap="round" strokeLinejoin="round" />
        <path d={trackPath} fill="none" stroke="#1a1a1a" strokeWidth="24" strokeLinecap="round" strokeLinejoin="round" />
        <path d={trackPath} fill="none" stroke="#333" strokeWidth="26" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4 8" />
      </svg>
    )
  }

  const { width, height } = svgDimensions

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet">
      {/* Render racing lines for each selected lap */}
      {lapPaths.map(({ lap, path, color }) => (
        <path
          key={lap}
          d={path}
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.9"
        />
      ))}
      
      {/* Render cursor dot for reference lap only - updated via subscription for performance */}
      <g ref={cursorGroupRef} style={{ pointerEvents: "none", display: "none" }}>
        {/* Outer glow ring */}
        <circle
          r="12"
          fill="none"
          stroke={refLapColor}
          strokeWidth="2.5"
          opacity="0.5"
        />
        {/* Middle glow */}
        <circle
          r="8"
          fill={refLapColor}
          opacity="0.3"
        />
        {/* Main dot with white border */}
        <circle
          r="6"
          fill={refLapColor}
          stroke="#ffffff"
          strokeWidth="3"
        />
        {/* Inner highlight */}
        <circle
          r="3"
          fill="#ffffff"
          opacity="1"
        />
      </g>
    </svg>
  )
}

