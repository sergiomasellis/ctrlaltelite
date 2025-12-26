import type { IbtLapData, SectorBoundary, SectorTimes } from "@/components/lap-analysis/types"
import { interpolateValue } from "./telemetry-utils"

// Simple YAML parser for sector boundaries
// Looks for sectors under SplitTimeInfo: Sectors: in the .ibt file YAML
export function parseSectorBoundaries(yaml: string): SectorBoundary[] {
  const sectors: SectorBoundary[] = []
  const lines = yaml.split("\n")
  let inSectors = false
  let indentLevel = 0
  let inSplitTimeInfo = false
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    
    // Look for SplitTimeInfo: section
    if (line.includes("SplitTimeInfo:")) {
      inSplitTimeInfo = true
      continue
    }
    
    // Look for Sectors: within SplitTimeInfo
    if (inSplitTimeInfo && line.includes("Sectors:")) {
      inSectors = true
      indentLevel = line.match(/^(\s*)/)?.[1]?.length ?? 0
      continue
    }
    
    // Also handle case where Sectors: appears directly (for backwards compatibility)
    if (!inSectors && line.includes("Sectors:")) {
      inSectors = true
      indentLevel = line.match(/^(\s*)/)?.[1]?.length ?? 0
      continue
    }
    
    // Exit SplitTimeInfo section if we hit a new top-level key
    if (inSplitTimeInfo && !inSectors && line.match(/^\w+:/) && !line.includes("SplitTimeInfo")) {
      inSplitTimeInfo = false
    }
    
    if (inSectors) {
      const currentIndent = line.match(/^(\s*)/)?.[1]?.length ?? 0
      // Exit if we hit a line at the same or less indent that's not part of the sectors list
      // (i.e., it's a new top-level key like "CarSetup:")
      if (currentIndent <= indentLevel && line.trim() && !line.includes("-") && !line.includes("SectorNum") && !line.includes("SectorStartPct")) {
        break // Exited sectors section
      }
      
      // Look for SectorNum in the current line or the previous line (for list item format)
      if (line.includes("SectorNum:")) {
        const sectorNumMatch = line.match(/SectorNum:\s*(\d+)/)
        // Look for SectorStartPct in the next line (indented)
        let startPctMatch = lines[i + 1]?.match(/SectorStartPct:\s*([\d.]+)/)
        // Also check current line in case it's on the same line
        if (!startPctMatch) {
          startPctMatch = line.match(/SectorStartPct:\s*([\d.]+)/)
        }
        
        if (sectorNumMatch && startPctMatch) {
          sectors.push({
            sectorNum: parseInt(sectorNumMatch[1], 10),
            startPct: parseFloat(startPctMatch[1]),
          })
        }
      }
    }
  }
  
  // Sort by sector number and ensure we have sector 0 (start/finish)
  sectors.sort((a, b) => a.sectorNum - b.sectorNum)
  if (sectors.length === 0 || sectors[0]!.sectorNum !== 0) {
    sectors.unshift({ sectorNum: 0, startPct: 0 })
  }
  
  // Ensure we have a final sector at 100% (1.0) if the last sector is not at 100%
  const lastSector = sectors[sectors.length - 1]
  if (lastSector && lastSector.startPct < 1.0) {
    // Add a final sector boundary at 100% (1.0) with the next sector number
    const maxSectorNum = Math.max(...sectors.map(s => s.sectorNum))
    sectors.push({ sectorNum: maxSectorNum + 1, startPct: 1.0 })
  }
  
  return sectors
}

// Calculate sector times for a lap
export function calculateSectorTimes(
  lapData: IbtLapData,
  sectorBoundaries: SectorBoundary[],
  officialTrackLengthKm?: number | null,
): SectorTimes[] {
  const sectorTimes: SectorTimes[] = []
  
  if (sectorBoundaries.length === 0) return sectorTimes
  
  // Use official track length from YAML if available, otherwise fall back to actual lap distance
  // Sector percentages in YAML are based on the official track length, not the measured lap distance
  const trackLengthKm = officialTrackLengthKm ?? lapData.distanceKm
  
  for (let i = 0; i < sectorBoundaries.length; i++) {
    const boundary = sectorBoundaries[i]!
    // SectorStartPct is stored as a decimal fraction (0.0-1.0), not percentage (0-100)
    // Calculate sector distance using official track length
    let sectorDistKm = boundary.startPct * trackLengthKm
    
    // For the last sector (100%), use actual lap distance instead of official track length
    // because telemetry data doesn't extend beyond the actual measured lap distance
    if (boundary.startPct >= 1.0) {
      sectorDistKm = lapData.distanceKm
    }
    
    // Clamp to actual lap distance to avoid interpolation issues
    sectorDistKm = Math.min(sectorDistKm, lapData.distanceKm)
    
    // Find the time at this distance
    const timeAtDist = interpolateValue(
      lapData.byDist,
      sectorDistKm,
      "distanceKm",
      (p) => p.timeSec,
    )
    
    if (timeAtDist != null) {
      sectorTimes.push({
        sectorNum: boundary.sectorNum,
        timeSec: timeAtDist,
        distanceKm: sectorDistKm,
      })
    }
  }
  
  // Calculate actual sector times (time difference between boundaries)
  const actualSectorTimes: SectorTimes[] = []
  for (let i = 0; i < sectorTimes.length; i++) {
    const prev = i > 0 ? sectorTimes[i - 1] : { timeSec: 0, distanceKm: 0 }
    const curr = sectorTimes[i]!
    actualSectorTimes.push({
      sectorNum: curr.sectorNum,
      timeSec: curr.timeSec - prev.timeSec,
      distanceKm: curr.distanceKm - prev.distanceKm,
    })
  }
  
  // Normalize sector times so they sum to the actual lap time
  // This ensures that sector deltas will correctly sum to lap time deltas
  const sumOfSectorTimes = actualSectorTimes.reduce((sum, st) => sum + st.timeSec, 0)
  if (sumOfSectorTimes > 0 && lapData.lapTimeSec > 0) {
    const normalizationFactor = lapData.lapTimeSec / sumOfSectorTimes
    return actualSectorTimes.map(st => ({
      ...st,
      timeSec: st.timeSec * normalizationFactor,
    }))
  }
  
  return actualSectorTimes
}


