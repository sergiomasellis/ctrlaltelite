export type TrackMapPoint = {
  distanceKm: number
  left: {
    lat: number
    lon: number
    altitudeM: number | null
  }
  right: {
    lat: number
    lon: number
    altitudeM: number | null
  }
}

export type TrackMapCorner = {
  distanceKm: number
  lat: number
  lon: number
  altitudeM: number | null
}

export type TrackMapData = {
  version: 1
  trackKey: string
  trackName: string | null
  trackConfigName: string | null
  trackId: number | null
  leftLap: number
  rightLap: number
  points: TrackMapPoint[]
  corners: TrackMapCorner[]
}
