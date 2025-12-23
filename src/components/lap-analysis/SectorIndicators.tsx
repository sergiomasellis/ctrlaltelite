import type { SectorBoundary } from "./types"

interface SectorIndicatorsProps {
  sectorBoundaries: SectorBoundary[]
}

export function SectorIndicators({ sectorBoundaries }: SectorIndicatorsProps) {
  if (sectorBoundaries.length <= 1) return null

  return (
    <div className="flex h-8 border-t border-border flex-shrink-0">
      {sectorBoundaries.slice(1).map((sector, index) => {
        const sectorNum = sector.sectorNum
        const isEven = index % 2 === 0
        const isLast = index === sectorBoundaries.length - 2
        return (
          <div
            key={sectorNum}
            className={`flex flex-1 items-center justify-center ${
              !isLast ? "border-r border-border" : ""
            } ${isEven ? "bg-background" : "bg-muted/30"}`}
          >
            <span className="text-xs font-medium">S{sectorNum}</span>
          </div>
        )
      })}
    </div>
  )
}

