import { useCallback, useEffect, useState } from "react"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { Maximize2, Minimize2, Minus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    const appWindow = getCurrentWindow()
    let unlistenResized: (() => void) | null = null
    let unlistenMoved: (() => void) | null = null

    const syncMaximized = async () => {
      try {
        setIsMaximized(await appWindow.isMaximized())
      } catch {
        setIsMaximized(false)
      }
    }

    void syncMaximized()

    const setupListeners = async () => {
      try {
        unlistenResized = await appWindow.onResized(async () => {
          await syncMaximized()
        })

        unlistenMoved = await appWindow.onMoved(async () => {
          await syncMaximized()
        })
      } catch (error) {
        console.error("Failed to setup window listeners:", error)
      }
    }

    void setupListeners()

    return () => {
      unlistenResized?.()
      unlistenMoved?.()
    }
  }, [])

  const handleMinimize = useCallback(async () => {
    try {
      await getCurrentWindow().minimize()
    } catch (error) {
      console.error("Failed to minimize window:", error)
    }
  }, [])

  const handleToggleMaximize = useCallback(async () => {
    try {
      const appWindow = getCurrentWindow()
      await appWindow.toggleMaximize()
      setIsMaximized(await appWindow.isMaximized())
    } catch (error) {
      console.error("Failed to toggle maximize:", error)
    }
  }, [])

  const handleClose = useCallback(async () => {
    try {
      await getCurrentWindow().close()
    } catch (error) {
      console.error("Failed to close window:", error)
    }
  }, [])

  return (
    <div
      data-tauri-drag-region
      className="flex h-10 items-center justify-between border-b border-border/60 bg-background/85 px-3 backdrop-blur"
    >
      <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-[10px] font-bold text-primary-foreground">
          CAE
        </div>
        <span className="tracking-wide">Ctrl Alt Elite</span>
      </div>
      <div className="flex items-center gap-1" data-tauri-drag-region="false">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleMinimize}
          data-tauri-drag-region="false"
          aria-label="Minimize"
        >
          <Minus className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleToggleMaximize}
          data-tauri-drag-region="false"
          aria-label={isMaximized ? "Restore" : "Maximize"}
        >
          {isMaximized ? (
            <Minimize2 className="h-3.5 w-3.5" />
          ) : (
            <Maximize2 className="h-3.5 w-3.5" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleClose}
          data-tauri-drag-region="false"
          aria-label="Close"
          className={cn("text-destructive hover:bg-destructive/20")}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}
