export type IbtLapPoint = {
  distanceKm: number
  timeSec: number
  speedKmh: number | null
  throttlePct: number | null
  brakePct: number | null
  gear: number | null
  rpm: number | null
  steeringDeg: number | null
  lat: number | null
  lon: number | null
}

export type SectorBoundary = {
  sectorNum: number
  startPct: number
}

export type SectorTimes = {
  sectorNum: number
  timeSec: number
  distanceKm: number
}

export type IbtLapData = {
  byDist: IbtLapPoint[]
  byTime: IbtLapPoint[]
  lapTimeSec: number
  distanceKm: number
  points: number
  sectorTimes: SectorTimes[]
}

