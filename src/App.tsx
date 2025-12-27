import { useState, useCallback, useEffect, useRef } from "react"
import { LapAnalysis } from "@/components/LapAnalysis"
import { Overview } from "@/components/Overview"
import { TitleBar } from "@/components/TitleBar"
import { TrackDesigner } from "@/components/admin/TrackDesigner"

export function App() {
  const [selectedFiles, setSelectedFiles] = useState<File[] | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isTauri, setIsTauri] = useState(() => {
    if (typeof window === "undefined") return false
    const globals = window as { __TAURI__?: unknown; __TAURI_INTERNALS__?: unknown }
    return globals.__TAURI_INTERNALS__ != null || globals.__TAURI__ != null
  })
  const [showTrackDesigner, setShowTrackDesigner] = useState(
    () => import.meta.env.DEV && window.location.hash === "#track-designer"
  )

  useEffect(() => {
    if (!import.meta.env.DEV) return
    const handleHashChange = () => {
      setShowTrackDesigner(window.location.hash === "#track-designer")
    }
    window.addEventListener("hashchange", handleHashChange)
    return () => window.removeEventListener("hashchange", handleHashChange)
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    const globals = window as { __TAURI__?: unknown; __TAURI_INTERNALS__?: unknown }
    setIsTauri(globals.__TAURI_INTERNALS__ != null || globals.__TAURI__ != null)
  }, [])

  const handleFileSelect = useCallback((file: File) => {
    setSelectedFiles([file])
  }, [])

  const handleFilesSelect = useCallback((files: File[]) => {
    setSelectedFiles(files)
  }, [])

  const handleFileUpload = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0]
    if (file) {
      handleFileSelect(file)
    }
    e.currentTarget.value = ""
  }, [handleFileSelect])

  const handleBackToOverview = useCallback(() => {
    setSelectedFiles(null)
  }, [])

  const handleExitDesigner = useCallback(() => {
    window.location.hash = ""
    setShowTrackDesigner(false)
    setSelectedFiles(null)
  }, [])

  if (showTrackDesigner) {
    return (
      <div className="h-screen">
        <div className="flex h-screen flex-col">
          {isTauri && <TitleBar />}
          <div className="min-h-0 flex-1">
            <TrackDesigner onExit={handleExitDesigner} />
          </div>
        </div>
      </div>
    )
  }

  if (!selectedFiles || selectedFiles.length === 0) {
    return (
      <div className="h-screen">
        <div className="flex h-screen flex-col">
          {isTauri && <TitleBar />}
          <div className="min-h-0 flex-1">
            <input
              ref={fileInputRef}
              type="file"
              accept=".ibt"
              className="hidden"
              onChange={handleFileInputChange}
            />
            <Overview onFilesSelect={handleFilesSelect} onFileUpload={handleFileUpload} />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen">
      <div className="flex h-screen flex-col">
        {isTauri && <TitleBar />}
        <div className="min-h-0 flex-1">
          <input
            ref={fileInputRef}
            type="file"
            accept=".ibt"
            className="hidden"
            onChange={handleFileInputChange}
          />
          <LapAnalysis
            initialFiles={selectedFiles}
            onBackToStart={handleBackToOverview}
          />
        </div>
      </div>
    </div>
  )
}

export default App
