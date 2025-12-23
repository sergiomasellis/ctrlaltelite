import type { IbtLapData, SectorBoundary, SectorTimes, IbtLapPoint } from "@/components/lap-analysis/types"
import { interpolateValue } from "./telemetry-utils"

// Simple YAML parser for sector boundaries
export function parseSectorBoundaries(yaml: string): SectorBoundary[] {
  const sectors: SectorBoundary[] = []
  const lines = yaml.split("\n")
  let inSectors = false
  let indentLevel = 0
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.includes("Sectors:")) {
      inSectors = true
      indentLevel = line.match(/^(\s*)/)?.[1]?.length ?? 0
      continue
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
  
  // Ensure we have a final sector at 100% if the last sector is not at 100%
  const lastSector = sectors[sectors.length - 1]
  if (lastSector && lastSector.startPct < 100) {
    // Add a final sector boundary at 100% with the next sector number
    const maxSectorNum = Math.max(...sectors.map(s => s.sectorNum))
    sectors.push({ sectorNum: maxSectorNum + 1, startPct: 100 })
  }
  
  return sectors
}

// Calculate sector times for a lap
export function calculateSectorTimes(
  lapData: IbtLapData,
  sectorBoundaries: SectorBoundary[],
): SectorTimes[] {
  const sectorTimes: SectorTimes[] = []
  
  if (sectorBoundaries.length === 0) return sectorTimes
  
  for (let i = 0; i < sectorBoundaries.length; i++) {
    const boundary = sectorBoundaries[i]!
    const sectorDistKm = (boundary.startPct * lapData.distanceKm) / 100
    
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
  
  return actualSectorTimes
}


