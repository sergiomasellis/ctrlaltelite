import { useState, useCallback, useEffect, createContext, useContext, useRef } from "react"

// ============================================
// CURSOR STORE - Bypasses React state for performance
// Uses direct DOM manipulation like canvas-based apps
// ============================================

export type CursorListener = (distance: number | null) => void

export interface CursorStore {
  distance: number | null
  listeners: Set<CursorListener>
  setDistance: (distance: number | null) => void
  subscribe: (listener: CursorListener) => () => void
}

export function createCursorStore(): CursorStore {
  const store: CursorStore = {
    distance: null,
    listeners: new Set(),
    setDistance: (distance: number | null) => {
      store.distance = distance
      // Notify all listeners synchronously (like canvas redraw)
      store.listeners.forEach(listener => listener(distance))
    },
    subscribe: (listener: CursorListener) => {
      store.listeners.add(listener)
      return () => store.listeners.delete(listener)
    }
  }
  return store
}

export const CursorStoreContext = createContext<CursorStore | null>(null)

// Hook to subscribe to cursor updates with direct DOM manipulation
export function useCursorSubscription(
  callback: CursorListener,
  deps: React.DependencyList = []
) {
  const store = useContext(CursorStoreContext)
  
  useEffect(() => {
    if (!store) return
    // Subscribe and return unsubscribe function
    return store.subscribe(callback)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, ...deps])
}

// Hook to get cursor update function (doesn't cause re-renders)
export function useCursorUpdate() {
  const store = useContext(CursorStoreContext)
  return useCallback((distance: number | null) => {
    store?.setDistance(distance)
  }, [store])
}

// Cursor distance display - subscribes to cursor updates
export function CursorDistanceDisplay() {
  const [distance, setDistance] = useState<number | null>(null)
  
  useCursorSubscription((d) => setDistance(d), [])
  
  if (distance === null) return null
  
  return (
    <span className="text-[10px] text-muted-foreground">{distance.toFixed(3)} km</span>
  )
}

