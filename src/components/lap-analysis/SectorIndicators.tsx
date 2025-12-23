import type { SectorBoundary, IbtLapData } from "./types"

interface SectorIndicatorsProps {
  sectorBoundaries: SectorBoundary[]
  selectedLaps: number[]
  lapDataByLap: Record<number, IbtLapData>
  onSectorClick?: (sectorStartKm: number, sectorEndKm: number) => void
}

export function SectorIndicators({ 
  sectorBoundaries, 
  selectedLaps,
  lapDataByLap,
  onSectorClick 
}: SectorIndicatorsProps) {
  if (sectorBoundaries.length <= 1) return null

  const handleSectorClick = (sectorIndex: number) => {
    if (!onSectorClick || selectedLaps.length === 0) return
    
    // Use the first selected lap as reference for distance calculation
    const refLap = selectedLaps[0]
    const refData = lapDataByLap[refLap]
    if (!refData) return

    // sectorIndex is the index in the sliced array (after slice(1))
    // sectorBoundaries.slice(1) removes sector 0, so:
    // - sectorIndex 0 = sectorBoundaries[1] (Sector 1)
    // - sectorIndex 1 = sectorBoundaries[2] (Sector 2)
    // - sectorIndex 2 = sectorBoundaries[3] (Sector 3)
    //
    // For each sector, we need:
    // - Start: previous boundary (where this sector starts)
    // - End: current boundary (where this sector ends)
    const startBoundaryIndex = sectorIndex // Previous boundary (sector start)
    const endBoundaryIndex = sectorIndex + 1 // Current boundary (sector end)
    
    const startBoundary = sectorBoundaries[startBoundaryIndex]
    const endBoundary = sectorBoundaries[endBoundaryIndex]
    
    if (!startBoundary || !endBoundary) return

    // Check if startPct values are stored as decimal (0-1) or percentage (0-100)
    // Values can be mixed - check each boundary individually
    // If a value is > 1, it's a percentage; otherwise it's a decimal
    const startIsDecimal = startBoundary.startPct <= 1
    const endIsDecimal = endBoundary.startPct <= 1
    
    let sectorStartKm: number
    let sectorEndKm: number
    
    if (startIsDecimal) {
      // startPct is stored as decimal (0-1), multiply directly
      sectorStartKm = startBoundary.startPct * refData.distanceKm
    } else {
      // startPct is stored as percentage (0-100), divide by 100
      sectorStartKm = (startBoundary.startPct * refData.distanceKm) / 100
    }
    
    if (endIsDecimal) {
      // startPct is stored as decimal (0-1), multiply directly
      sectorEndKm = endBoundary.startPct * refData.distanceKm
    } else {
      // startPct is stored as percentage (0-100), divide by 100
      sectorEndKm = (endBoundary.startPct * refData.distanceKm) / 100
    }

    // Debug logging
    console.log('Sector click:', {
      sectorIndex,
      sectorNum: sectorBoundaries[sectorIndex + 1]?.sectorNum,
      startBoundary: { sectorNum: startBoundary.sectorNum, startPct: startBoundary.startPct },
      endBoundary: { sectorNum: endBoundary.sectorNum, startPct: endBoundary.startPct },
      refDataDistanceKm: refData.distanceKm,
      startIsDecimal,
      endIsDecimal,
      sectorStartKm,
      sectorEndKm,
    })

    onSectorClick(sectorStartKm, sectorEndKm)
  }

  return (
    <div className="flex h-8 border-t border-border flex-shrink-0">
      {sectorBoundaries.slice(1).map((sector, index) => {
        const sectorNum = sector.sectorNum
        const isEven = index % 2 === 0
        const isLast = index === sectorBoundaries.length - 2
        const isClickable = onSectorClick != null && selectedLaps.length > 0
        return (
          <div
            key={sectorNum}
            onClick={() => handleSectorClick(index)}
            className={`flex flex-1 items-center justify-center ${
              !isLast ? "border-r border-border" : ""
            } ${isEven ? "bg-background" : "bg-muted/30"} ${
              isClickable ? "cursor-pointer hover:bg-muted/50 transition-colors" : ""
            }`}
          >
            <span className="text-xs font-medium">S{sectorNum}</span>
          </div>
        )
      })}
    </div>
  )
}

