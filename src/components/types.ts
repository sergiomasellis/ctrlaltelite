import type { TelemetryFileInfo } from "@/lib/telemetry-scanner"

export interface OverviewProps {
  onFilesSelect: (files: File[]) => void
  onFileUpload: () => void
}

export interface LapAnalysisProps {
  initialFiles?: File[] | null
  onBackToStart?: () => void
}

export interface TelemetrySessionGroup {
  id: string
  files: TelemetryFileInfo[]
  primaryFile: TelemetryFileInfo
  seasonID?: number
  sessionID?: number
  subSessionIDs: number[]
  sessionTypes: string[]
  totalLaps: number
  totalRecords: number
  displayDate: string
  dateSortValue: number
  location: string | null
  trackDisplay: string
  carName: string
  resultsLink: string | null
  hasReadyFiles: boolean
  hasErrors: boolean
  searchText: string
}
