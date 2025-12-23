import { exists, readDir, readFile, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs"
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
}

interface TelemetryCache {
  version: number
  entries: Record<string, TelemetryCacheEntry>
}

const CACHE_FILE = "telemetry-cache.json"
const CACHE_VERSION = 2

async function loadCache(): Promise<TelemetryCache> {
  try {
    const hasCache = await exists(CACHE_FILE, { baseDir: BaseDirectory.AppLocalData })
    if (!hasCache) {
      return { version: CACHE_VERSION, entries: {} }
    }
    const raw = await readTextFile(CACHE_FILE, { baseDir: BaseDirectory.AppLocalData })
    const parsed = JSON.parse(raw) as TelemetryCache
    if (!parsed || parsed.version !== CACHE_VERSION || !parsed.entries) {
      return { version: CACHE_VERSION, entries: {} }
    }
    return parsed
  } catch {
    return { version: CACHE_VERSION, entries: {} }
  }
}

async function saveCache(cache: TelemetryCache) {
  try {
    await writeTextFile(CACHE_FILE, JSON.stringify(cache), { baseDir: BaseDirectory.AppLocalData })
  } catch {
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

    for (const file of ibtFiles) {
      const fileName = file.name || "unknown"
      const relativeFilePath = `${telemetryDir}/${fileName}`
      const filePath = await join(telemetryDir, fileName)

      try {
        const cached = cache.entries[relativeFilePath]
        const shouldRefresh =
          !cached || cached.error || !cached.metadata || Object.keys(cached.metadata).length === 0

        if (!shouldRefresh && cached) {
          fileInfos.push({
            path: filePath,
            name: fileName,
            metadata: cached.metadata ?? {},
            error: cached.error,
          })
          nextCacheEntries[relativeFilePath] = {
            ...cached,
            name: fileName,
          }
          continue
        }

        const fileData = await readFile(relativeFilePath, { baseDir: BaseDirectory.Document })
        const blob = new Blob([new Uint8Array(fileData as ArrayLike<number>)])
        const metadata = await readIbtMetadata(blob)

        nextCacheEntries[relativeFilePath] = {
          name: fileName,
          metadata,
        }

        fileInfos.push({
          path: filePath,
          name: fileName,
          metadata,
        })
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
        }
        fileInfos.push({
          path: filePath,
          name: fileName,
          metadata: cachedEntry.metadata ?? {},
          error: errorMessage,
        })
      }
    }

    await saveCache({ version: CACHE_VERSION, entries: nextCacheEntries })

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

