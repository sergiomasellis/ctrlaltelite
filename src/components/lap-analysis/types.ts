export type IbtLapPoint = {
  distanceKm: number
  timeSec: number
  speedKmh: number | null
  throttlePct: number | null
  brakePct: number | null
  brakeABSactive: boolean | null
  gear: number | null
  rpm: number | null
  steeringDeg: number | null
  lat: number | null
  lon: number | null
  // Tire data
  tireTempLF: number | null
  tireTempRF: number | null
  tireTempLR: number | null
  tireTempRR: number | null
  tirePressureLF: number | null
  tirePressureRF: number | null
  tirePressureLR: number | null
  tirePressureRR: number | null
  tireWearLF: number | null
  tireWearRF: number | null
  tireWearLR: number | null
  tireWearRR: number | null
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



