import { useState, useCallback, useRef } from "react"
import { LapAnalysis } from "@/components/LapAnalysis"
import { Overview } from "@/components/Overview"
import { TitleBar } from "@/components/TitleBar"

export function App() {
  const [selectedFiles, setSelectedFiles] = useState<File[] | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  if (!selectedFiles || selectedFiles.length === 0) {
    return (
      <div className="h-screen">
        <div className="flex h-screen flex-col">
          <TitleBar />
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
        <TitleBar />
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
