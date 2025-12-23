import type { IbtLapData } from "./types"
import { interpolateValue, interpolateGps, perpendicularDistanceMeters, gpsDistanceMeters } from "@/lib/telemetry-utils"

export function prepareTelemetryData(
  ibtLapDataByLap: Record<number, IbtLapData> | null,
  selectedLaps: number[]
): any[] {
  if (!ibtLapDataByLap || selectedLaps.length === 0) {
    return []
  }

  const refLap = selectedLaps[0]
  const refData = ibtLapDataByLap[refLap]
  if (!refData) return []

  // Downsample to max ~500 points for chart performance
  const MAX_CHART_POINTS = 500
  const allDistances = refData.byDist.map((p) => p.distanceKm)
  const stride = Math.max(1, Math.ceil(allDistances.length / MAX_CHART_POINTS))
  const distances = allDistances.filter((_, i) => i % stride === 0)

  // For each distance point, interpolate values from all selected laps
  const result: any[] = []
  for (const dist of distances) {
    const point: any = { distance: dist }

    // Reference lap values (always present)
    const refPoint = refData.byDist.find((p) => Math.abs(p.distanceKm - dist) < 0.001) ?? refData.byDist[0]
    point[`speed_${refLap}`] = refPoint.speedKmh
    point[`throttle_${refLap}`] = refPoint.throttlePct
    point[`brake_${refLap}`] = refPoint.brakePct
    point[`brakeABSactive_${refLap}`] = refPoint.brakeABSactive
    point[`gear_${refLap}`] = refPoint.gear
    point[`rpm_${refLap}`] = refPoint.rpm
    point[`steering_${refLap}`] = refPoint.steeringDeg
    point[`tireTempLF_${refLap}`] = refPoint.tireTempLF
    point[`tireTempRF_${refLap}`] = refPoint.tireTempRF
    point[`tireTempLR_${refLap}`] = refPoint.tireTempLR
    point[`tireTempRR_${refLap}`] = refPoint.tireTempRR
    point[`tirePressureLF_${refLap}`] = refPoint.tirePressureLF
    point[`tirePressureRF_${refLap}`] = refPoint.tirePressureRF
    point[`tirePressureLR_${refLap}`] = refPoint.tirePressureLR
    point[`tirePressureRR_${refLap}`] = refPoint.tirePressureRR
    point[`tireWearLF_${refLap}`] = refPoint.tireWearLF
    point[`tireWearRF_${refLap}`] = refPoint.tireWearRF
    point[`tireWearLR_${refLap}`] = refPoint.tireWearLR
    point[`tireWearRR_${refLap}`] = refPoint.tireWearRR
    point[`lineDist_${refLap}`] = 0 // Reference lap is center line
    point[`timeDelta_${refLap}`] = 0 // Reference lap has zero delta

    // Other selected laps
    for (let i = 1; i < selectedLaps.length; i++) {
      const lap = selectedLaps[i]!
      const lapData = ibtLapDataByLap[lap]
      if (!lapData) continue

      // Interpolate at this distance
      const speed = interpolateValue(lapData.byDist, dist, "distanceKm", (p) => p.speedKmh)
      const throttle = interpolateValue(lapData.byDist, dist, "distanceKm", (p) => p.throttlePct)
      const brake = interpolateValue(lapData.byDist, dist, "distanceKm", (p) => p.brakePct)
      const brakeABS = interpolateValue(lapData.byDist, dist, "distanceKm", (p) => p.brakeABSactive === true ? 1 : p.brakeABSactive === false ? 0 : null)
      const gear = interpolateValue(lapData.byDist, dist, "distanceKm", (p) => p.gear)
      const rpm = interpolateValue(lapData.byDist, dist, "distanceKm", (p) => p.rpm)
      const steering = interpolateValue(lapData.byDist, dist, "distanceKm", (p) => p.steeringDeg)
      const tireTempLF = interpolateValue(lapData.byDist, dist, "distanceKm", (p) => p.tireTempLF)
      const tireTempRF = interpolateValue(lapData.byDist, dist, "distanceKm", (p) => p.tireTempRF)
      const tireTempLR = interpolateValue(lapData.byDist, dist, "distanceKm", (p) => p.tireTempLR)
      const tireTempRR = interpolateValue(lapData.byDist, dist, "distanceKm", (p) => p.tireTempRR)
      const tirePressureLF = interpolateValue(lapData.byDist, dist, "distanceKm", (p) => p.tirePressureLF)
      const tirePressureRF = interpolateValue(lapData.byDist, dist, "distanceKm", (p) => p.tirePressureRF)
      const tirePressureLR = interpolateValue(lapData.byDist, dist, "distanceKm", (p) => p.tirePressureLR)
      const tirePressureRR = interpolateValue(lapData.byDist, dist, "distanceKm", (p) => p.tirePressureRR)
      const tireWearLF = interpolateValue(lapData.byDist, dist, "distanceKm", (p) => p.tireWearLF)
      const tireWearRF = interpolateValue(lapData.byDist, dist, "distanceKm", (p) => p.tireWearRF)
      const tireWearLR = interpolateValue(lapData.byDist, dist, "distanceKm", (p) => p.tireWearLR)
      const tireWearRR = interpolateValue(lapData.byDist, dist, "distanceKm", (p) => p.tireWearRR)

      point[`speed_${lap}`] = speed
      point[`throttle_${lap}`] = throttle
      point[`brake_${lap}`] = brake
      point[`brakeABSactive_${lap}`] = brakeABS != null ? brakeABS > 0.5 : null
      point[`gear_${lap}`] = gear
      point[`rpm_${lap}`] = rpm
      point[`steering_${lap}`] = steering
      point[`tireTempLF_${lap}`] = tireTempLF
      point[`tireTempRF_${lap}`] = tireTempRF
      point[`tireTempLR_${lap}`] = tireTempLR
      point[`tireTempRR_${lap}`] = tireTempRR
      point[`tirePressureLF_${lap}`] = tirePressureLF
      point[`tirePressureRF_${lap}`] = tirePressureRF
      point[`tirePressureLR_${lap}`] = tirePressureLR
      point[`tirePressureRR_${lap}`] = tirePressureRR
      point[`tireWearLF_${lap}`] = tireWearLF
      point[`tireWearRF_${lap}`] = tireWearRF
      point[`tireWearLR_${lap}`] = tireWearLR
      point[`tireWearRR_${lap}`] = tireWearRR

      // Line distance: difference in lateral position (simplified as distance offset)
      // Time delta: interpolate time at this distance, compare to reference
      const lapTime = interpolateValue(lapData.byDist, dist, "distanceKm", (p) => p.timeSec)
      const refTime = interpolateValue(refData.byDist, dist, "distanceKm", (p) => p.timeSec)
      if (lapTime != null && refTime != null) {
        point[`timeDelta_${lap}`] = lapTime - refTime
      } else {
        point[`timeDelta_${lap}`] = null
      }

      // Line distance: perpendicular distance in meters from comparison lap to reference lap racing line
      // at the same distance through the lap (using GPS coordinates)
      // Positive = left of reference line, Negative = right of reference line
      const refGps = interpolateGps(refData.byDist, dist)
      const lapGps = interpolateGps(lapData.byDist, dist)
      
      if (refGps && lapGps) {
        // Get a point slightly ahead on the reference lap to determine direction
        const lookAheadDist = Math.min(dist + 0.01, refData.distanceKm) // 10 meters ahead
        const refGpsAhead = interpolateGps(refData.byDist, lookAheadDist)
        
        if (refGpsAhead) {
          // Calculate perpendicular distance from comparison lap point to reference lap line segment
          const perpDist = perpendicularDistanceMeters(
            lapGps.lat,
            lapGps.lon,
            refGps.lat,
            refGps.lon,
            refGpsAhead.lat,
            refGpsAhead.lon
          )
          point[`lineDist_${lap}`] = perpDist
        } else {
          // Fallback to straight-line distance if we can't determine direction
          const distanceMeters = gpsDistanceMeters(refGps.lat, refGps.lon, lapGps.lat, lapGps.lon)
          point[`lineDist_${lap}`] = distanceMeters
        }
      } else {
        point[`lineDist_${lap}`] = null
      }
    }

    result.push(point)
  }

  return result
}

