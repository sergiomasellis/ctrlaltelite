import { readDir, readFile, writeFile } from "@tauri-apps/plugin-fs"
import { BaseDirectory, join } from "@tauri-apps/api/path"
import { readIbtMetadata, type IbtSessionMetadata } from "./ibt"

export interface TelemetryFileInfo {
  path: string
  name: string
  metadata: IbtSessionMetadata
  error?: string
}

interface TelemetryCacheEntry {
  name: string
  metadata: IbtSessionMetadata
  error?: string
  mtime?: number // File modification time (Unix timestamp in milliseconds)
}

interface TelemetryCache {
  version: number
  entries: Record<string, TelemetryCacheEntry>
}

const CACHE_FILE = "telemetry-cache.json"
const CACHE_VERSION = 31 // Incremented to force refresh of incomplete metadata entries

async function loadCache(): Promise<TelemetryCache> {
  try {
    // Try to read the cache file directly - if it doesn't exist, readFile will throw
    // Use readFile instead of readTextFile since readTextFile may not be allowed for AppLocalData
    const fileData = await readFile(CACHE_FILE, { baseDir: BaseDirectory.AppLocalData })
    const raw = new TextDecoder("utf-8").decode(new Uint8Array(fileData as ArrayLike<number>))
    const parsed = JSON.parse(raw) as TelemetryCache
    if (!parsed || parsed.version !== CACHE_VERSION || !parsed.entries) {
      console.log(`Cache version mismatch or invalid: expected ${CACHE_VERSION}, got ${parsed?.version}, entries: ${Object.keys(parsed?.entries || {}).length}`)
      return { version: CACHE_VERSION, entries: {} }
    }
    console.log(`Loaded cache with ${Object.keys(parsed.entries).length} entries`)
    return parsed
  } catch (error) {
    // File doesn't exist or can't be read - start fresh
    const errorMessage = error instanceof Error ? error.message : String(error)
    if (
      errorMessage.includes("not found") || 
      errorMessage.includes("No such file") ||
      errorMessage.includes("cannot find the file") ||
      errorMessage.includes("os error 2")
    ) {
      // File doesn't exist yet - this is normal on first run
      console.log("No cache file found, starting fresh")
    } else {
      console.error("Failed to load cache:", error)
    }
    return { version: CACHE_VERSION, entries: {} }
  }
}

async function saveCache(cache: TelemetryCache) {
  try {
    // Use writeFile with TextEncoder since writeTextFile may not be allowed for AppLocalData
    const jsonString = JSON.stringify(cache)
    const encoder = new TextEncoder()
    const data = encoder.encode(jsonString)
    await writeFile(CACHE_FILE, data, { baseDir: BaseDirectory.AppLocalData })
  } catch (error) {
    console.error("Failed to save cache:", error)
    return
  }
}

export async function scanTelemetryFiles(): Promise<TelemetryFileInfo[]> {
  try {
    const telemetryDir = "iRacing/telemetry"
    
    console.log("Scanning telemetry directory:", telemetryDir)
    
    let entries
    try {
      entries = await readDir(telemetryDir, { baseDir: BaseDirectory.Document })
      console.log("Found entries:", entries.length)
    } catch (error) {
      console.error("Failed to read directory:", telemetryDir, error)
      throw new Error(`Failed to read telemetry directory: ${error instanceof Error ? error.message : String(error)}`)
    }

    const ibtFiles = entries.filter(
      (entry: { name?: string; isDir?: boolean }) => entry.name?.endsWith(".ibt") && !entry.isDir
    )

    console.log("Found .ibt files:", ibtFiles.length)

    if (ibtFiles.length === 0) {
      return []
    }

    const cache = await loadCache()
    const nextCacheEntries: Record<string, TelemetryCacheEntry> = {}
    const fileInfos: TelemetryFileInfo[] = []
    const filesToRefresh: Array<{ file: typeof ibtFiles[0]; relativeFilePath: string; filePath: string }> = []
    const filesToRefreshSync: Array<{ file: typeof ibtFiles[0]; relativeFilePath: string; filePath: string }> = []

    // First pass: Use cache for files with valid metadata
    // Check file modification time from readDir entry if available, otherwise use cache if it exists
    for (const file of ibtFiles) {
      const fileName = file.name || "unknown"
      const relativeFilePath = `${telemetryDir}/${fileName}`
      const filePath = await join(telemetryDir, fileName)

      const cached = cache.entries[relativeFilePath]
      
      // Try to get mtime from readDir entry (if available in Tauri FS plugin)
      // Type assertion for potential mtime property
      const fileEntry = file as typeof file & { mtime?: Date | number }
      let currentMtime: number | undefined
      
      if (fileEntry.mtime) {
        currentMtime = fileEntry.mtime instanceof Date 
          ? fileEntry.mtime.getTime() 
          : typeof fileEntry.mtime === 'number' 
            ? fileEntry.mtime 
            : undefined
      }
      
      const cachedMtime = cached?.mtime
      
      // Check if file has been modified since last cache
      // If we don't have current mtime, assume file might be modified and check cache validity
      const fileModified = currentMtime !== undefined && cachedMtime !== undefined 
        ? cachedMtime !== currentMtime 
        : false // If we can't determine, rely on cache validity check
      
      // Check if cache has valid metadata (has key fields)
      // Consider cache valid if it has any of: carName, trackDisplayName, trackName, OR if it has sessionDate/sessionTime
      const hasValidMetadata = cached?.metadata && (
        cached.metadata.carName || 
        cached.metadata.trackDisplayName || 
        cached.metadata.trackName ||
        (cached.metadata.sessionDate && cached.metadata.sessionTime) ||
        Object.keys(cached.metadata).length > 3 // Has multiple fields, likely complete
      )
      const hasError = cached?.error
      
      // Debug logging for first few files
      if (fileInfos.length < 3 && cached) {
        console.log(`File ${fileName}: hasCache=${!!cached}, hasValidMetadata=${!!hasValidMetadata}, hasError=${!!hasError}, metadataKeys=${Object.keys(cached.metadata || {}).length}`)
      }
      
      // Always show cached data if it exists (even if incomplete), but queue for refresh if:
      // 1. File has been modified, OR
      // 2. Cache doesn't have valid metadata (missing key fields)
      const needsRefresh = fileModified || (cached && !hasValidMetadata && !hasError)
      const needsSyncRefresh = (cached && !hasValidMetadata && !hasError) || !cached // No cache or incomplete cache - refresh immediately
      
      // Always use cached data for immediate display
      if (cached) {
        fileInfos.push({
          path: filePath,
          name: fileName,
          metadata: cached.metadata ?? {},
          error: cached.error,
        })
        
        // If file hasn't been modified and has valid metadata, keep using cache
        if (!needsRefresh) {
          nextCacheEntries[relativeFilePath] = {
            ...cached,
            name: fileName,
            mtime: currentMtime ?? cached.mtime, // Preserve or update mtime
          }
        } else if (needsSyncRefresh) {
          // Incomplete cache - refresh synchronously so user sees data immediately
          filesToRefreshSync.push({ file, relativeFilePath, filePath })
          nextCacheEntries[relativeFilePath] = {
            ...cached,
            name: fileName,
          }
        } else {
          // File modified - refresh in background
          filesToRefresh.push({ file, relativeFilePath, filePath })
          nextCacheEntries[relativeFilePath] = {
            ...cached,
            name: fileName,
          }
        }
      } else {
        // No cache exists - refresh synchronously so user sees data
        filesToRefreshSync.push({ file, relativeFilePath, filePath })
        fileInfos.push({
          path: filePath,
          name: fileName,
          metadata: {},
        })
      }
    }

    // Refresh incomplete cache entries synchronously so user sees data immediately
    if (filesToRefreshSync.length > 0) {
      console.log(`Refreshing ${filesToRefreshSync.length} incomplete cache entries synchronously...`)
      console.log(`Total files: ${ibtFiles.length}, Using cache: ${ibtFiles.length - filesToRefreshSync.length - filesToRefresh.length}, Sync refresh: ${filesToRefreshSync.length}, Background refresh: ${filesToRefresh.length}`)
      
      const BATCH_SIZE = 3 // Smaller batches for sync refresh to avoid blocking too long
      for (let i = 0; i < filesToRefreshSync.length; i += BATCH_SIZE) {
        const batch = filesToRefreshSync.slice(i, i + BATCH_SIZE)
        await Promise.all(
          batch.map(async ({ file, relativeFilePath }) => {
            const fileName = file.name || "unknown"
            
            // Try to get mtime from file entry
            const fileEntry = file as typeof file & { mtime?: Date | number }
            let currentMtime: number | undefined
            
            if (fileEntry.mtime) {
              currentMtime = fileEntry.mtime instanceof Date 
                ? fileEntry.mtime.getTime() 
                : typeof fileEntry.mtime === 'number' 
                  ? fileEntry.mtime 
                  : Date.now()
            } else {
              currentMtime = Date.now()
            }
            
            try {
              const fileData = await readFile(relativeFilePath, { baseDir: BaseDirectory.Document })
              const blob = new Blob([new Uint8Array(fileData as ArrayLike<number>)])
              const metadata = await readIbtMetadata(blob)

              // Verify we got useful metadata
              const hasUsefulMetadata = metadata.carName || metadata.trackDisplayName || metadata.trackName || 
                (metadata.sessionDate && metadata.sessionTime) || Object.keys(metadata).length > 3
              
              if (!hasUsefulMetadata) {
                console.warn(`File ${fileName} refreshed but still has incomplete metadata:`, Object.keys(metadata))
              }

              nextCacheEntries[relativeFilePath] = {
                name: fileName,
                metadata,
                mtime: currentMtime,
              }

              // Update the fileInfo in place
              const existingIndex = fileInfos.findIndex(f => f.name === fileName)
              if (existingIndex >= 0) {
                fileInfos[existingIndex] = {
                  ...fileInfos[existingIndex],
                  metadata,
                }
              }
            } catch (error) {
              console.error("Failed to read file:", file.name, error)
              const cachedEntry = cache.entries[relativeFilePath] ?? {
                name: fileName,
                metadata: {},
              }
              const errorMessage = error instanceof Error ? error.message : String(error)
              nextCacheEntries[relativeFilePath] = {
                ...cachedEntry,
                error: errorMessage,
                mtime: currentMtime,
              }
              
              const existingIndex = fileInfos.findIndex(f => f.name === fileName)
              if (existingIndex >= 0) {
                fileInfos[existingIndex].error = errorMessage
              }
            }
          })
        )
      }
      
      // Save cache after sync refresh
      await saveCache({ version: CACHE_VERSION, entries: nextCacheEntries })
      console.log(`Saved cache with ${Object.keys(nextCacheEntries).length} entries after sync refresh`)
    } else if (Object.keys(nextCacheEntries).length > 0) {
      // Save cache even if no sync refresh needed (to preserve mtime updates, etc.)
      await saveCache({ version: CACHE_VERSION, entries: nextCacheEntries })
    }

    // Sort and return results
    fileInfos.sort((a, b) => {
      const dateA = a.metadata.sessionDate && a.metadata.sessionTime
        ? new Date(`${a.metadata.sessionDate} ${a.metadata.sessionTime}`).getTime()
        : 0
      const dateB = b.metadata.sessionDate && b.metadata.sessionTime
        ? new Date(`${b.metadata.sessionDate} ${b.metadata.sessionTime}`).getTime()
        : 0
      return dateB - dateA
    })

    // Refresh files in background (don't await - let it complete asynchronously)
    if (filesToRefresh.length > 0) {
      console.log(`Refreshing metadata for ${filesToRefresh.length} files in background...`)
      
      // Process in batches to avoid overwhelming the system
      const refreshFiles = async () => {
        const BATCH_SIZE = 5
        for (let i = 0; i < filesToRefresh.length; i += BATCH_SIZE) {
          const batch = filesToRefresh.slice(i, i + BATCH_SIZE)
          await Promise.all(
            batch.map(async ({ file, relativeFilePath }) => {
              const fileName = file.name || "unknown"
              
              // Try to get mtime from file entry
              const fileEntry = file as typeof file & { mtime?: Date | number }
              let currentMtime: number | undefined
              
              if (fileEntry.mtime) {
                currentMtime = fileEntry.mtime instanceof Date 
                  ? fileEntry.mtime.getTime() 
                  : typeof fileEntry.mtime === 'number' 
                    ? fileEntry.mtime 
                    : Date.now()
              } else {
                // Fallback to current time if mtime not available
                currentMtime = Date.now()
              }
              
              try {
                const fileData = await readFile(relativeFilePath, { baseDir: BaseDirectory.Document })
                const blob = new Blob([new Uint8Array(fileData as ArrayLike<number>)])
                const metadata = await readIbtMetadata(blob)

                nextCacheEntries[relativeFilePath] = {
                  name: fileName,
                  metadata,
                  mtime: currentMtime,
                }
              } catch (error) {
                console.error("Failed to read file:", file.name, error)
                const cachedEntry = cache.entries[relativeFilePath] ?? {
                  name: fileName,
                  metadata: {},
                }
                const errorMessage = error instanceof Error ? error.message : String(error)
                nextCacheEntries[relativeFilePath] = {
                  ...cachedEntry,
                  error: errorMessage,
                  mtime: currentMtime,
                }
              }
            })
          )
        }
        // Save cache after all refreshes complete
        await saveCache({ version: CACHE_VERSION, entries: nextCacheEntries })
      }
      
      // Don't await - let it run in background
      refreshFiles().catch(err => {
        console.error("Background refresh failed:", err)
      })
    } else {
      // No files to refresh, just save cache as-is
      await saveCache({ version: CACHE_VERSION, entries: nextCacheEntries })
    }

    fileInfos.sort((a, b) => {
      const dateA = a.metadata.sessionDate && a.metadata.sessionTime
        ? new Date(`${a.metadata.sessionDate} ${a.metadata.sessionTime}`).getTime()
        : 0
      const dateB = b.metadata.sessionDate && b.metadata.sessionTime
        ? new Date(`${b.metadata.sessionDate} ${b.metadata.sessionTime}`).getTime()
        : 0
      return dateB - dateA
    })

    return fileInfos
  } catch (error) {
    throw new Error(
      `Failed to scan telemetry files: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
