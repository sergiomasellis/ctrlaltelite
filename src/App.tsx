import { useState, useCallback, useRef } from "react"
import { LapAnalysis } from "@/components/LapAnalysis"
import { Overview } from "@/components/Overview"
import { TitleBar } from "@/components/TitleBar"

export function App() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = useCallback((file: File) => {
    setSelectedFile(file)
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
    setSelectedFile(null)
  }, [])

  if (!selectedFile) {
    return (
      <div className="dark h-screen">
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
            <Overview onFileSelect={handleFileSelect} onFileUpload={handleFileUpload} />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="dark h-screen">
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
            initialFile={selectedFile}
            onBackToStart={handleBackToOverview}
          />
        </div>
      </div>
    </div>
  )
}

export default App
