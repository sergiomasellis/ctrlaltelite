// Browser-side iRacing .ibt telemetry reader (no Node APIs).
//
// iRacing "disk telemetry" layout:
// - Header (varHeaderOffset bytes; commonly 144)
// - Var headers (numVars * 144 bytes)
// - Session info YAML (sessionInfoLen bytes at sessionInfoOffset)
// - Sample records starting at (sessionInfoOffset + sessionInfoLen), each bufLen bytes
//
// This reader focuses on random-access via Blob.slice().arrayBuffer().

export type IbtVarType = 0 | 1 | 2 | 3 | 4 | 5

export interface IbtDiskSubHeader {
  // Seconds since Unix epoch (observed in .ibt files)
  sessionStartDate: number
  sessionStartTime: number
  sessionEndTime: number
  lapCount: number
  recordCount: number
}

export interface IbtHeader {
  ver: number
  status: number
  tickRate: number
  sessionInfoUpdate: number
  sessionInfoLen: number
  sessionInfoOffset: number
  numVars: number
  varHeaderOffset: number
  numBuf: number
  bufLen: number
  headerBytes: number
  diskSubHeader?: IbtDiskSubHeader
}

export interface IbtVar {
  index: number
  name: string
  type: IbtVarType
  typeName: "char" | "bool" | "int" | "bitField" | "float" | "double" | `unknown(${number})`
  offset: number
  count: number
  countAsTime: number
  unit: string
  desc: string
}

export type IbtScalar = number | boolean | string | null
export type IbtValue = IbtScalar | Array<number | boolean | null>

export interface ReadSamplesOptions {
  varNames: string[]
  start?: number
  end?: number
  stride?: number
  chunkRecords?: number
  onProgress?: (p: { processedRecords: number; totalRecords: number }) => void
}

const VAR_HEADER_SIZE = 144
const VAR_TYPE_NAME: Record<number, IbtVar["typeName"]> = {
  0: "char",
  1: "bool",
  2: "int",
  3: "bitField",
  4: "float",
  5: "double",
}

const textDecoder = new TextDecoder("utf-8")

function stripNullTerminator(s: string) {
  const i = s.indexOf("\0")
  return i === -1 ? s : s.slice(0, i)
}

async function readSlice(blob: Blob, offset: number, length: number): Promise<ArrayBuffer> {
  return await blob.slice(offset, offset + length).arrayBuffer()
}

export async function readIbtHeader(blob: Blob): Promise<IbtHeader> {
  const base = await readSlice(blob, 0, 40)
  if (base.byteLength < 40) {
    throw new Error(`Invalid .ibt file: header is ${base.byteLength} bytes`)
  }
  const dv = new DataView(base)

  const header = {
    ver: dv.getInt32(0, true),
    status: dv.getInt32(4, true),
    tickRate: dv.getInt32(8, true),
    sessionInfoUpdate: dv.getInt32(12, true),
    sessionInfoLen: dv.getInt32(16, true),
    sessionInfoOffset: dv.getInt32(20, true),
    numVars: dv.getInt32(24, true),
    varHeaderOffset: dv.getInt32(28, true),
    numBuf: dv.getInt32(32, true),
    bufLen: dv.getInt32(36, true),
  }

  if (!Number.isFinite(header.varHeaderOffset) || header.varHeaderOffset <= 0) {
    throw new Error(`Invalid .ibt header: varHeaderOffset=${header.varHeaderOffset}`)
  }
  if (header.varHeaderOffset > blob.size) {
    throw new Error(`Invalid .ibt header: varHeaderOffset=${header.varHeaderOffset} exceeds file size=${blob.size}`)
  }
  if (!Number.isFinite(header.numVars) || header.numVars <= 0) {
    throw new Error(`Invalid .ibt header: numVars=${header.numVars}`)
  }
  if (!Number.isFinite(header.bufLen) || header.bufLen <= 0) {
    throw new Error(`Invalid .ibt header: bufLen=${header.bufLen}`)
  }
  if (!Number.isFinite(header.sessionInfoOffset) || header.sessionInfoOffset < 0) {
    throw new Error(`Invalid .ibt header: sessionInfoOffset=${header.sessionInfoOffset}`)
  }
  if (!Number.isFinite(header.sessionInfoLen) || header.sessionInfoLen < 0) {
    throw new Error(`Invalid .ibt header: sessionInfoLen=${header.sessionInfoLen}`)
  }
  if (header.sessionInfoOffset + header.sessionInfoLen > blob.size) {
    throw new Error(
      `Invalid .ibt header: sessionInfoOffset=${header.sessionInfoOffset} sessionInfoLen=${header.sessionInfoLen} exceeds file size=${blob.size}`,
    )
  }

  const fullHeaderBuf = await readSlice(blob, 0, header.varHeaderOffset)
  const out: IbtHeader = { ...header, headerBytes: header.varHeaderOffset }

  // iRacing disk telemetry typically appends a "diskSubHeader" in the final 32 bytes of the header (total 144 bytes).
  // We keep it optional but parse a few useful fields if present.
  if (fullHeaderBuf.byteLength >= 144) {
    const dvh = new DataView(fullHeaderBuf)
    out.diskSubHeader = {
      // Seconds since Unix epoch (observed in sample files)
      sessionStartDate: dvh.getInt32(112, true),
      sessionStartTime: dvh.getFloat64(120, true),
      sessionEndTime: dvh.getFloat64(128, true),
      lapCount: dvh.getInt32(136, true),
      recordCount: dvh.getInt32(140, true),
    }
  }

  return out
}

export async function readIbtVarHeaders(blob: Blob, header: IbtHeader): Promise<IbtVar[]> {
  const byteLen = header.numVars * VAR_HEADER_SIZE
  const expectedEnd = header.varHeaderOffset + byteLen
  if (expectedEnd > blob.size) {
    throw new Error(
      `Invalid .ibt file: var headers exceed file size (offset=${header.varHeaderOffset}, bytes=${byteLen}, size=${blob.size})`,
    )
  }
  const buf = await readSlice(blob, header.varHeaderOffset, byteLen)
  if (buf.byteLength < byteLen) {
    throw new Error(
      `Invalid .ibt file: expected ${byteLen} bytes of var headers at offset ${header.varHeaderOffset}, got ${buf.byteLength}`,
    )
  }
  const u8 = new Uint8Array(buf)

  const vars: IbtVar[] = []
  for (let i = 0; i < header.numVars; i++) {
    const base = i * VAR_HEADER_SIZE
    const dv = new DataView(buf, base, VAR_HEADER_SIZE)

    const type = dv.getInt32(0, true)
    const offset = dv.getInt32(4, true)
    const count = dv.getInt32(8, true)
    const countAsTime = dv.getInt32(12, true)

    const name = stripNullTerminator(textDecoder.decode(u8.slice(base + 16, base + 48)))
    const desc = stripNullTerminator(textDecoder.decode(u8.slice(base + 48, base + 112)))
    const unit = stripNullTerminator(textDecoder.decode(u8.slice(base + 112, base + 144)))

    vars.push({
      index: i,
      name,
      type: type as IbtVarType,
      typeName: VAR_TYPE_NAME[type] ?? `unknown(${type})`,
      offset,
      count,
      countAsTime,
      unit,
      desc,
    })
  }

  return vars
}

export async function readIbtSessionInfoYaml(blob: Blob, header: IbtHeader): Promise<string> {
  const buf = await readSlice(blob, header.sessionInfoOffset, header.sessionInfoLen)
  return textDecoder.decode(new Uint8Array(buf))
}

export function computeIbtDataStart(header: IbtHeader): number {
  return header.sessionInfoOffset + header.sessionInfoLen
}

export function computeIbtRecordCount(blobSizeBytes: number, dataStart: number, bufLen: number): number {
  const dataBytes = blobSizeBytes - dataStart
  if (dataBytes <= 0) return 0
  return Math.floor(dataBytes / bufLen)
}

export function findVarsByName(vars: IbtVar[]) {
  const map = new Map<string, IbtVar>()
  for (const v of vars) map.set(v.name.toLowerCase(), v)
  return map
}

type VarReader = {
  name: string
  type: IbtVarType
  offset: number
  count: number
  read: (dv: DataView, recordBase: number, recordBytes: Uint8Array) => IbtValue
}

function makeVarReaders(vars: IbtVar[]): VarReader[] {
  return vars.map((v) => {
    const readScalar = (dv: DataView, recordBase: number) => {
      const p = recordBase + v.offset
      switch (v.type) {
        case 0:
          return dv.getUint8(p)
        case 1:
          return dv.getUint8(p) !== 0
        case 2:
          return dv.getInt32(p, true)
        case 3:
          return dv.getUint32(p)
        case 4:
          return dv.getFloat32(p, true)
        case 5:
          return dv.getFloat64(p, true)
        default:
          return null
      }
    }

    const readArray = (dv: DataView, recordBase: number, recordBytes: Uint8Array) => {
      const p = recordBase + v.offset
      if (v.type === 0) {
        const bytes = recordBytes.slice(p, p + v.count)
        return stripNullTerminator(textDecoder.decode(bytes))
      }

      const out = new Array<number | boolean | null>(v.count)
      const elemSize =
        v.type === 5 ? 8 : v.type === 4 ? 4 : v.type === 2 || v.type === 3 ? 4 : v.type === 1 ? 1 : 1
      for (let i = 0; i < v.count; i++) {
        const pp = p + i * elemSize
        switch (v.type) {
          case 1:
            out[i] = dv.getUint8(pp) !== 0
            break
          case 2:
            out[i] = dv.getInt32(pp, true)
            break
          case 3:
            out[i] = dv.getUint32(pp)
            break
          case 4:
            out[i] = dv.getFloat32(pp, true)
            break
          case 5:
            out[i] = dv.getFloat64(pp, true)
            break
          default:
            out[i] = null
        }
      }
      return out
    }

    return {
      ...v,
      read: (dv: DataView, recordBase: number, recordBytes: Uint8Array) =>
        v.count === 1 ? readScalar(dv, recordBase) : readArray(dv, recordBase, recordBytes),
    }
  })
}

export async function readIbtSamples(
  blob: Blob,
  header: IbtHeader,
  vars: IbtVar[],
  opts: ReadSamplesOptions,
): Promise<Array<Record<string, IbtValue>>> {
  const dataStart = computeIbtDataStart(header)
  const recordCount =
    header.diskSubHeader?.recordCount ?? computeIbtRecordCount(blob.size, dataStart, header.bufLen)

  const start = opts.start ?? 0
  const end = Math.min(opts.end ?? recordCount, recordCount)
  const stride = Math.max(1, opts.stride ?? 1)
  const chunkRecords = Math.max(1, opts.chunkRecords ?? 1024)

  if (start < 0 || start > end) throw new Error(`Invalid range: start=${start}, end=${end}`)

  const want = new Set(opts.varNames.map((v) => v.toLowerCase()))
  const selected = vars.filter((v) => want.has(v.name.toLowerCase()))
  for (const name of opts.varNames) {
    if (!selected.some((v) => v.name.toLowerCase() === name.toLowerCase())) {
      throw new Error(`Missing channel in .ibt: ${name}`)
    }
  }

  const readers = makeVarReaders(selected)
  const rows: Array<Record<string, IbtValue>> = []

  let processed = 0
  for (let rec = start; rec < end; ) {
    const remaining = end - rec
    const take = Math.min(chunkRecords, remaining)
    const byteOffset = dataStart + rec * header.bufLen
    const byteLen = take * header.bufLen
    const chunkBuf = await readSlice(blob, byteOffset, byteLen)

    const dv = new DataView(chunkBuf)
    const bytes = new Uint8Array(chunkBuf)

    for (let r = 0; r < take; r++) {
      const globalIndex = rec + r
      if ((globalIndex - start) % stride !== 0) continue

      const recordBase = r * header.bufLen
      const row: Record<string, IbtValue> = {}
      for (const vr of readers) {
        row[vr.name] = vr.read(dv, recordBase, bytes)
      }
      row.__index = globalIndex
      rows.push(row)
    }

    rec += take
    processed += take
    opts.onProgress?.({ processedRecords: start + processed, totalRecords: end })
  }

  return rows
}

export interface IbtWeekendInfo {
  trackName?: string
  trackID?: number
  trackDisplayName?: string
  trackDisplayShortName?: string
  trackConfigName?: string
  trackCity?: string
  trackState?: string
  trackCountry?: string
  trackLength?: string
  trackLengthOfficial?: string
  trackNumTurns?: number
  trackType?: string
  sessionType?: string
  eventDate?: string
  eventTime?: string
  category?: string
  seriesID?: number
  seasonID?: number
  sessionID?: number
  subSessionID?: number
  official?: number
}

export interface IbtSessionResultPosition {
  position: number
  classPosition: number
  carIdx: number
  lap: number
  time: number
  fastestLap: number
  fastestTime: number
  lastTime: number
  lapsLed: number
  lapsComplete: number
  incidents: number
  reasonOutStr?: string
}

export interface IbtSessionInfo {
  sessionNum: number
  sessionType?: string
  sessionName?: string
  sessionLaps?: number
  sessionTime?: number
  resultsPositions?: IbtSessionResultPosition[]
}

export interface IbtSessionsByNum {
  [sessionNum: number]: IbtSessionInfo
}

export interface IbtSessionMetadata {
  carName?: string
  carPath?: string
  trackName?: string
  trackDisplayName?: string
  trackConfigName?: string
  sessionDate?: string
  sessionTime?: string
  sessionType?: string
  trackConfig?: string
  lapCount?: number
  recordCount?: number
  weekendInfo?: IbtWeekendInfo
  driverName?: string
  driverIRating?: number
  driverFlairName?: string
  sessionsByNum?: IbtSessionsByNum
}

export async function readIbtMetadata(blob: Blob): Promise<IbtSessionMetadata> {
  const header = await readIbtHeader(blob)
  const yaml = await readIbtSessionInfoYaml(blob, header)

  // Helper function to extract YAML values (handles both quoted and unquoted)
  const extractYamlValue = (yaml: string, key: string): string | null => {
    const quotedMatch = yaml.match(new RegExp(`${key}:\\s*"([^"]+)"`))
    if (quotedMatch) return quotedMatch[1]
    const unquotedMatch = yaml.match(new RegExp(`${key}:\\s*([^\\n]+)`))
    if (unquotedMatch) return unquotedMatch[1].trim()
    return null
  }

  const metadata: IbtSessionMetadata = {
    lapCount: header.diskSubHeader?.lapCount,
    recordCount: header.diskSubHeader?.recordCount,
  }

  const trackName = extractYamlValue(yaml, "TrackName")
  if (trackName) metadata.trackName = trackName

  const trackConfig = extractYamlValue(yaml, "TrackConfig")
  if (trackConfig) metadata.trackConfig = trackConfig

  const carMatch = yaml.match(/CarSetup:\s*\n\s*Car:\s*(?:"([^"]+)"|([^\n]+))/)
  if (carMatch) {
    metadata.carName = (carMatch[1] || carMatch[2]?.trim()) ?? null
  } else {
    const carName = extractYamlValue(yaml, "CarName")
    if (carName) metadata.carName = carName
  }

  const sessionType = extractYamlValue(yaml, "SessionType")
  if (sessionType) metadata.sessionType = sessionType

  if (header.diskSubHeader) {
    const date = new Date(header.diskSubHeader.sessionStartDate * 1000)
    metadata.sessionDate = date.toLocaleDateString()
    metadata.sessionTime = date.toLocaleTimeString()
  }

  const weekendInfo: IbtWeekendInfo = {}

  const weekendTrackName = extractYamlValue(yaml, "TrackName")
  if (weekendTrackName) weekendInfo.trackName = weekendTrackName

  const weekendTrackID = yaml.match(/TrackID:\s*(\d+)/)
  if (weekendTrackID) weekendInfo.trackID = parseInt(weekendTrackID[1], 10)

  const weekendTrackDisplayName = extractYamlValue(yaml, "TrackDisplayName")
  if (weekendTrackDisplayName) {
    weekendInfo.trackDisplayName = weekendTrackDisplayName
    metadata.trackDisplayName = weekendTrackDisplayName
  }

  const weekendTrackDisplayShortName = extractYamlValue(yaml, "TrackDisplayShortName")
  if (weekendTrackDisplayShortName) weekendInfo.trackDisplayShortName = weekendTrackDisplayShortName

  // Helper to clean track config name by removing "TrackCity: " prefix if present
  const cleanTrackConfigName = (value: string): string => {
    return value.replace(/^TrackCity:\s*/i, "").trim()
  }

  const weekendTrackConfigName = extractYamlValue(yaml, "TrackConfigName")
  if (weekendTrackConfigName) {
    const cleaned = cleanTrackConfigName(weekendTrackConfigName)
    weekendInfo.trackConfigName = cleaned
    metadata.trackConfigName = cleaned
  }

  // Helper to clean location field values by removing field name prefixes
  const cleanLocationValue = (value: string): string => {
    return value
      .replace(/^TrackCity:\s*/i, "")
      .replace(/^TrackState:\s*/i, "")
      .replace(/^TrackCountry:\s*/i, "")
      .trim()
  }

  const weekendTrackCity = extractYamlValue(yaml, "TrackCity")
  if (weekendTrackCity) weekendInfo.trackCity = cleanLocationValue(weekendTrackCity)

  const weekendTrackState = extractYamlValue(yaml, "TrackState")
  if (weekendTrackState) weekendInfo.trackState = cleanLocationValue(weekendTrackState)

  const weekendTrackCountry = extractYamlValue(yaml, "TrackCountry")
  if (weekendTrackCountry) weekendInfo.trackCountry = cleanLocationValue(weekendTrackCountry)

  const weekendTrackLength = extractYamlValue(yaml, "TrackLength")
  if (weekendTrackLength) weekendInfo.trackLength = weekendTrackLength

  const weekendTrackLengthOfficial = extractYamlValue(yaml, "TrackLengthOfficial")
  if (weekendTrackLengthOfficial) weekendInfo.trackLengthOfficial = weekendTrackLengthOfficial

  const weekendTrackNumTurns = yaml.match(/TrackNumTurns:\s*(\d+)/)
  if (weekendTrackNumTurns) weekendInfo.trackNumTurns = parseInt(weekendTrackNumTurns[1], 10)

  const weekendTrackType = extractYamlValue(yaml, "TrackType")
  if (weekendTrackType) weekendInfo.trackType = weekendTrackType

  // Extract EventType from WeekendInfo block (WeekendInfo: ... EventType: Race)
  // First try to find it within WeekendInfo block
  const weekendInfoMatch = yaml.match(/WeekendInfo:\s*\n([\s\S]*?)(?=\n\w+:|$)/)
  let weekendEventType: string | null = null
  if (weekendInfoMatch) {
    const weekendInfoBlock = weekendInfoMatch[1]
    weekendEventType = extractYamlValue(weekendInfoBlock, "EventType")
    const seriesID = weekendInfoBlock.match(/SeriesID:\s*(\d+)/)
    if (seriesID) weekendInfo.seriesID = parseInt(seriesID[1], 10)
    const seasonID = weekendInfoBlock.match(/SeasonID:\s*(\d+)/)
    if (seasonID) weekendInfo.seasonID = parseInt(seasonID[1], 10)
    const sessionID = weekendInfoBlock.match(/SessionID:\s*(\d+)/)
    if (sessionID) weekendInfo.sessionID = parseInt(sessionID[1], 10)
    const subSessionID = weekendInfoBlock.match(/SubSessionID:\s*(\d+)/)
    if (subSessionID) weekendInfo.subSessionID = parseInt(subSessionID[1], 10)
  }
  // Fallback to root level EventType if not found in WeekendInfo block
  if (!weekendEventType) {
    weekendEventType = extractYamlValue(yaml, "EventType")
  }
  if (weekendEventType) weekendInfo.sessionType = weekendEventType
  if (weekendInfo.seriesID == null) {
    const seriesID = yaml.match(/SeriesID:\s*(\d+)/)
    if (seriesID) weekendInfo.seriesID = parseInt(seriesID[1], 10)
  }
  if (weekendInfo.seasonID == null) {
    const seasonID = yaml.match(/SeasonID:\s*(\d+)/)
    if (seasonID) weekendInfo.seasonID = parseInt(seasonID[1], 10)
  }
  if (weekendInfo.sessionID == null) {
    const sessionID = yaml.match(/SessionID:\s*(\d+)/)
    if (sessionID) weekendInfo.sessionID = parseInt(sessionID[1], 10)
  }
  if (weekendInfo.subSessionID == null) {
    const subSessionID = yaml.match(/SubSessionID:\s*(\d+)/)
    if (subSessionID) weekendInfo.subSessionID = parseInt(subSessionID[1], 10)
  }

  const weekendDate = extractYamlValue(yaml, "Date")
  if (weekendDate) weekendInfo.eventDate = weekendDate

  // Parse session information from YAML
  // Sessions are typically listed in a Sessions array with SessionNum, SessionType, etc.
  const sessionsByNum: IbtSessionsByNum = {}
  
  // Try to extract sessions from the YAML
  // Format is typically:
  // Sessions:
  //   - SessionNum: 0
  //     SessionType: "Practice"
  //     SessionName: "PRACTICE"
  //     ResultsPositions:
  //     - Position: 1
  //       CarIdx: 5
  //       ...
  const sessionsMatch = yaml.match(/Sessions:\s*\n((?:\s+-\s+SessionNum:\s*\d+[\s\S]*?)+)/)
  if (sessionsMatch) {
    const sessionsBlock = sessionsMatch[1]
    const sessionEntries = sessionsBlock.matchAll(/-\s+SessionNum:\s*(\d+)([\s\S]*?)(?=\n\s+-|$)/g)
    
    for (const match of sessionEntries) {
      const sessionNum = parseInt(match[1]!, 10)
      const sessionBlock = match[2] || ""
      
      const sessionType = extractYamlValue(sessionBlock, "SessionType")
      const sessionName = extractYamlValue(sessionBlock, "SessionName")
      
      const sessionLapsMatch = sessionBlock.match(/SessionLaps:\s*(\d+)/)
      const sessionLaps = sessionLapsMatch ? parseInt(sessionLapsMatch[1], 10) : undefined
      
      const sessionTimeMatch = sessionBlock.match(/SessionTime:\s*([\d.]+)/)
      const sessionTime = sessionTimeMatch ? parseFloat(sessionTimeMatch[1]) : undefined
      
      // Parse ResultsPositions
      const resultsPositions: IbtSessionResultPosition[] = []
      const resultsMatch = sessionBlock.match(/ResultsPositions:\s*\n((?:\s+-\s+Position:\s*\d+[\s\S]*?)+)/)
      if (resultsMatch) {
        const resultsBlock = resultsMatch[1]
        const positionEntries = resultsBlock.matchAll(/-\s+Position:\s*(\d+)([\s\S]*?)(?=\n\s+-|$)/g)
        
        for (const posMatch of positionEntries) {
          const position = parseInt(posMatch[1]!, 10)
          const posBlock = posMatch[2] || ""
          
          const classPositionMatch = posBlock.match(/ClassPosition:\s*(\d+)/)
          const classPosition = classPositionMatch ? parseInt(classPositionMatch[1], 10) : 0
          
          const carIdxMatch = posBlock.match(/CarIdx:\s*(\d+)/)
          const carIdx = carIdxMatch ? parseInt(carIdxMatch[1], 10) : 0
          
          const lapMatch = posBlock.match(/Lap:\s*(\d+)/)
          const lap = lapMatch ? parseInt(lapMatch[1], 10) : 0
          
          const timeMatch = posBlock.match(/Time:\s*([\d.]+)/)
          const time = timeMatch ? parseFloat(timeMatch[1]) : 0
          
          const fastestLapMatch = posBlock.match(/FastestLap:\s*(\d+)/)
          const fastestLap = fastestLapMatch ? parseInt(fastestLapMatch[1], 10) : 0
          
          const fastestTimeMatch = posBlock.match(/FastestTime:\s*([\d.]+)/)
          const fastestTime = fastestTimeMatch ? parseFloat(fastestTimeMatch[1]) : 0
          
          const lastTimeMatch = posBlock.match(/LastTime:\s*([\d.]+)/)
          const lastTime = lastTimeMatch ? parseFloat(lastTimeMatch[1]) : 0
          
          const lapsLedMatch = posBlock.match(/LapsLed:\s*(\d+)/)
          const lapsLed = lapsLedMatch ? parseInt(lapsLedMatch[1], 10) : 0
          
          const lapsCompleteMatch = posBlock.match(/LapsComplete:\s*(\d+)/)
          const lapsComplete = lapsCompleteMatch ? parseInt(lapsCompleteMatch[1], 10) : 0
          
          const incidentsMatch = posBlock.match(/Incidents:\s*(\d+)/)
          const incidents = incidentsMatch ? parseInt(incidentsMatch[1], 10) : 0
          
          const reasonOutStr = extractYamlValue(posBlock, "ReasonOutStr")
          
          resultsPositions.push({
            position,
            classPosition,
            carIdx,
            lap,
            time,
            fastestLap,
            fastestTime,
            lastTime,
            lapsLed,
            lapsComplete,
            incidents,
            reasonOutStr: reasonOutStr || undefined,
          })
        }
      }
      
      sessionsByNum[sessionNum] = {
        sessionNum,
        sessionType: sessionType || undefined,
        sessionName: sessionName || undefined,
        sessionLaps,
        sessionTime,
        resultsPositions: resultsPositions.length > 0 ? resultsPositions : undefined,
      }
    }
  }
  
  // If no sessions found in array format, try to extract from SessionInfo or other fields
  if (Object.keys(sessionsByNum).length === 0) {
    // Try to find SessionInfo blocks
    const sessionInfoMatches = yaml.matchAll(/SessionInfo:\s*\n\s+SessionNum:\s*(\d+)([\s\S]*?)(?=\n\s+SessionInfo:|$)/g)
    for (const match of sessionInfoMatches) {
      const sessionNum = parseInt(match[1]!, 10)
      const sessionBlock = match[2] || ""
      
      const sessionType = extractYamlValue(sessionBlock, "SessionType")
      const sessionName = extractYamlValue(sessionBlock, "SessionName")
      
      sessionsByNum[sessionNum] = {
        sessionNum,
        sessionType: sessionType || undefined,
        sessionName: sessionName || undefined,
      }
    }
  }
  
  // If still no sessions found, try to infer from SessionType at root level
  if (Object.keys(sessionsByNum).length === 0) {
    const rootSessionType = extractYamlValue(yaml, "SessionType")
    if (rootSessionType) {
      sessionsByNum[0] = {
        sessionNum: 0,
        sessionType: rootSessionType,
      }
    }
  }
  
  // Check WeekendInfo.EventType (stored in weekendInfo.sessionType) FIRST and prioritize Race
  // This handles cases where EventType is in WeekendInfo but not in Sessions array
  // EventType from WeekendInfo takes precedence as it represents the overall event type
  if (weekendInfo.sessionType) {
    const eventTypeLower = weekendInfo.sessionType.toLowerCase()
    if (eventTypeLower.includes("race")) {
      // Race from EventType takes highest priority
      metadata.sessionType = weekendInfo.sessionType
    } else if (!metadata.sessionType) {
      // If no session type set yet, use EventType from WeekendInfo
      metadata.sessionType = weekendInfo.sessionType
    }
  }
  
  if (Object.keys(sessionsByNum).length > 0) {
    metadata.sessionsByNum = sessionsByNum
    
    // If we have session information, prioritize showing Race session type if it exists
    // But only if EventType from WeekendInfo doesn't already indicate Race
    const currentTypeLower = metadata.sessionType?.toLowerCase() || ""
    if (!currentTypeLower.includes("race")) {
      const raceSession = Object.values(sessionsByNum).find(s => 
        s.sessionType && (s.sessionType.toLowerCase().includes("race") || s.sessionName?.toLowerCase().includes("race"))
      )
      
      if (raceSession) {
        metadata.sessionType = raceSession.sessionType || "Race"
      } else if (!metadata.sessionType) {
        // Use the first session type found if no session type set yet
        const firstSession = Object.values(sessionsByNum)[0]
        if (firstSession?.sessionType) {
          metadata.sessionType = firstSession.sessionType
        }
      }
    }
  }

  let carName = null
  let carPath = null

  const driverCarIdxMatch = yaml.match(/DriverCarIdx:\s*(\d+)/)
  const driverCarIdx = driverCarIdxMatch ? parseInt(driverCarIdxMatch[1], 10) : null

  if (driverCarIdx !== null) {
    const driverEntryRegex = new RegExp(`-\\s*CarIdx:\\s*${driverCarIdx}\\b([\\s\\S]*?)(?=\\n\\s*-\\s*CarIdx:|$)`)
    const driverEntry = yaml.match(driverEntryRegex)

    if (driverEntry) {
      carName = extractYamlValue(driverEntry[1], "CarScreenName")
      carPath = extractYamlValue(driverEntry[1], "CarPath")
      
      // Extract driver information
      const userName = extractYamlValue(driverEntry[1], "UserName")
      const iRating = driverEntry[1].match(/IRating:\s*(\d+)/)
      const flairName = extractYamlValue(driverEntry[1], "FlairName")
      
      if (userName) metadata.driverName = userName
      if (iRating) metadata.driverIRating = parseInt(iRating[1], 10)
      if (flairName && flairName !== "-none-") metadata.driverFlairName = flairName
    }
  }

  if (!carName) {
    const firstDriverEntry = yaml.match(/Drivers:([\s\S]*?)-\s*CarIdx:\s*\d+/)
    if (firstDriverEntry) {
      carName = extractYamlValue(firstDriverEntry[1], "CarScreenName")
      carPath = extractYamlValue(firstDriverEntry[1], "CarPath")
    }
  }

  if (carName) metadata.carName = carName
  if (carPath) metadata.carPath = carPath

  if (Object.keys(weekendInfo).length > 0) {
    metadata.weekendInfo = weekendInfo
  }

  return metadata
}

/**
 * Extract session information from YAML string
 * Returns a map of session number to session info
 */
export function parseSessionsFromYaml(yaml: string): IbtSessionsByNum {
  const sessionsByNum: IbtSessionsByNum = {}
  
  const extractYamlValue = (yaml: string, key: string): string | null => {
    const quotedMatch = yaml.match(new RegExp(`${key}:\\s*"([^"]+)"`))
    if (quotedMatch) return quotedMatch[1]
    const unquotedMatch = yaml.match(new RegExp(`${key}:\\s*([^\\n]+)`))
    if (unquotedMatch) return unquotedMatch[1].trim()
    return null
  }
  
  // Try to extract sessions from the YAML
  // Format can be:
  // Sessions:
  //   - SessionNum: 0
  //     SessionType: "Practice"
  // Or under SessionInfo:
  // SessionInfo:
  //   Sessions:
  //     - SessionNum: 0
  //       SessionType: "Practice"
  // First try to find Sessions directly, or under SessionInfo
  let sessionsBlock: string | null = null
  
  // Find the Sessions: line and capture everything after it
  // Try to find Sessions: under SessionInfo first (most common case)
  const sessionInfoIndex = yaml.indexOf("SessionInfo:")
  if (sessionInfoIndex !== -1) {
    const afterSessionInfo = yaml.substring(sessionInfoIndex)
    const sessionsIndex = afterSessionInfo.indexOf("Sessions:")
    if (sessionsIndex !== -1) {
      // Find where Sessions: starts
      const sessionsStart = sessionInfoIndex + sessionsIndex + "Sessions:".length
      // Find the next top-level key (starts at beginning of line with capital letter) or end of file
      const restOfYaml = yaml.substring(sessionsStart)
      // Match from Sessions: until next top-level key or end
      const sessionsMatch = restOfYaml.match(/^\s*\n([\s\S]*?)(?=\n[A-Z][a-zA-Z]+:|$)/)
      if (sessionsMatch) {
        sessionsBlock = sessionsMatch[1]
      }
    }
  }
  
  // If not found under SessionInfo, try direct Sessions: at root level
  if (!sessionsBlock) {
    const directSessionsMatch = yaml.match(/^Sessions:\s*\n([\s\S]*?)(?=\n[A-Z][a-zA-Z]+:|$)/m)
    if (directSessionsMatch) {
      sessionsBlock = directSessionsMatch[1]
    }
  }
  
  if (sessionsBlock) {
    // Match session entries - look for "- SessionNum:" and stop at next "- SessionNum:" or end
    const sessionEntries = sessionsBlock.matchAll(/-\s+SessionNum:\s*(\d+)([\s\S]*?)(?=\n\s+-\s+SessionNum:|$)/g)
    
    for (const match of sessionEntries) {
      const sessionNum = parseInt(match[1]!, 10)
      const sessionBlock = match[2] || ""
      
      const sessionType = extractYamlValue(sessionBlock, "SessionType")
      const sessionName = extractYamlValue(sessionBlock, "SessionName")
      
      const sessionLapsMatch = sessionBlock.match(/SessionLaps:\s*(\d+)/)
      const sessionLaps = sessionLapsMatch ? parseInt(sessionLapsMatch[1], 10) : undefined
      
      const sessionTimeMatch = sessionBlock.match(/SessionTime:\s*([\d.]+)/)
      const sessionTime = sessionTimeMatch ? parseFloat(sessionTimeMatch[1]) : undefined
      
      // Parse ResultsPositions
      const resultsPositions: IbtSessionResultPosition[] = []
      const resultsMatch = sessionBlock.match(/ResultsPositions:\s*\n((?:\s+-\s+Position:\s*\d+[\s\S]*?)+)/)
      if (resultsMatch) {
        const resultsBlock = resultsMatch[1]
        const positionEntries = resultsBlock.matchAll(/-\s+Position:\s*(\d+)([\s\S]*?)(?=\n\s+-\s+Position:|$)/g)
        
        for (const posMatch of positionEntries) {
          const position = parseInt(posMatch[1]!, 10)
          const posBlock = posMatch[2] || ""
          
          const classPositionMatch = posBlock.match(/ClassPosition:\s*(\d+)/)
          const classPosition = classPositionMatch ? parseInt(classPositionMatch[1], 10) : 0
          
          const carIdxMatch = posBlock.match(/CarIdx:\s*(\d+)/)
          const carIdx = carIdxMatch ? parseInt(carIdxMatch[1], 10) : 0
          
          const lapMatch = posBlock.match(/Lap:\s*(\d+)/)
          const lap = lapMatch ? parseInt(lapMatch[1], 10) : 0
          
          const timeMatch = posBlock.match(/Time:\s*([\d.]+)/)
          const time = timeMatch ? parseFloat(timeMatch[1]) : 0
          
          const fastestLapMatch = posBlock.match(/FastestLap:\s*(\d+)/)
          const fastestLap = fastestLapMatch ? parseInt(fastestLapMatch[1], 10) : 0
          
          const fastestTimeMatch = posBlock.match(/FastestTime:\s*([\d.]+)/)
          const fastestTime = fastestTimeMatch ? parseFloat(fastestTimeMatch[1]) : 0
          
          const lastTimeMatch = posBlock.match(/LastTime:\s*([\d.]+)/)
          const lastTime = lastTimeMatch ? parseFloat(lastTimeMatch[1]) : 0
          
          const lapsLedMatch = posBlock.match(/LapsLed:\s*(\d+)/)
          const lapsLed = lapsLedMatch ? parseInt(lapsLedMatch[1], 10) : 0
          
          const lapsCompleteMatch = posBlock.match(/LapsComplete:\s*(\d+)/)
          const lapsComplete = lapsCompleteMatch ? parseInt(lapsCompleteMatch[1], 10) : 0
          
          const incidentsMatch = posBlock.match(/Incidents:\s*(\d+)/)
          const incidents = incidentsMatch ? parseInt(incidentsMatch[1], 10) : 0
          
          const reasonOutStr = extractYamlValue(posBlock, "ReasonOutStr")
          
          resultsPositions.push({
            position,
            classPosition,
            carIdx,
            lap,
            time,
            fastestLap,
            fastestTime,
            lastTime,
            lapsLed,
            lapsComplete,
            incidents,
            reasonOutStr: reasonOutStr || undefined,
          })
        }
      }
      
      sessionsByNum[sessionNum] = {
        sessionNum,
        sessionType: sessionType || undefined,
        sessionName: sessionName || undefined,
        sessionLaps,
        sessionTime,
        resultsPositions: resultsPositions.length > 0 ? resultsPositions : undefined,
      }
    }
  }
  
  // If no sessions found in array format, try to extract from SessionInfo blocks
  if (Object.keys(sessionsByNum).length === 0) {
    const sessionInfoMatches = yaml.matchAll(/SessionInfo:\s*\n\s+SessionNum:\s*(\d+)([\s\S]*?)(?=\n\s+SessionInfo:|$)/g)
    for (const match of sessionInfoMatches) {
      const sessionNum = parseInt(match[1]!, 10)
      const sessionBlock = match[2] || ""
      
      const sessionType = extractYamlValue(sessionBlock, "SessionType")
      const sessionName = extractYamlValue(sessionBlock, "SessionName")
      
      sessionsByNum[sessionNum] = {
        sessionNum,
        sessionType: sessionType || undefined,
        sessionName: sessionName || undefined,
      }
    }
  }
  
  // If still no sessions found, try to infer from SessionType at root level
  if (Object.keys(sessionsByNum).length === 0) {
    const rootSessionType = extractYamlValue(yaml, "SessionType")
    if (rootSessionType) {
      sessionsByNum[0] = {
        sessionNum: 0,
        sessionType: rootSessionType,
      }
    }
  }
  
  return sessionsByNum
}

/**
 * Extract WeekendInfo metadata from YAML string
 * Returns WeekendInfo object with track, event, and session details
 */
export function parseWeekendInfoFromYaml(yaml: string): IbtWeekendInfo {
  const weekendInfo: IbtWeekendInfo = {}
  
  const extractYamlValue = (yaml: string, key: string): string | null => {
    const quotedMatch = yaml.match(new RegExp(`${key}:\\s*"([^"]+)"`))
    if (quotedMatch) return quotedMatch[1]
    const unquotedMatch = yaml.match(new RegExp(`${key}:\\s*([^\\n]+)`))
    if (unquotedMatch) return unquotedMatch[1].trim()
    return null
  }
  
  // Extract WeekendInfo block
  const weekendInfoMatch = yaml.match(/WeekendInfo:\s*\n([\s\S]*?)(?=\n\w+:|$)/)
  const weekendInfoBlock = weekendInfoMatch ? weekendInfoMatch[1] : yaml
  
  // Track information
  const trackName = extractYamlValue(weekendInfoBlock, "TrackName")
  if (trackName) weekendInfo.trackName = trackName

  const trackID = weekendInfoBlock.match(/TrackID:\s*(\d+)/)
  if (trackID) weekendInfo.trackID = parseInt(trackID[1], 10)
  if (weekendInfo.trackID == null) {
    const rootTrackID = yaml.match(/TrackID:\s*(\d+)/)
    if (rootTrackID) weekendInfo.trackID = parseInt(rootTrackID[1], 10)
  }

  const trackDisplayName = extractYamlValue(weekendInfoBlock, "TrackDisplayName")
  if (trackDisplayName) weekendInfo.trackDisplayName = trackDisplayName
  
  const trackDisplayShortName = extractYamlValue(weekendInfoBlock, "TrackDisplayShortName")
  if (trackDisplayShortName) weekendInfo.trackDisplayShortName = trackDisplayShortName
  
  // Helper to clean track config name by removing "TrackCity: " prefix if present
  const cleanTrackConfigName = (value: string): string => {
    return value.replace(/^TrackCity:\s*/i, "").trim()
  }

  const trackConfigName = extractYamlValue(weekendInfoBlock, "TrackConfigName")
  if (trackConfigName) weekendInfo.trackConfigName = cleanTrackConfigName(trackConfigName)
  
  // Helper to clean location field values by removing field name prefixes
  const cleanLocationValue = (value: string): string => {
    return value
      .replace(/^TrackCity:\s*/i, "")
      .replace(/^TrackState:\s*/i, "")
      .replace(/^TrackCountry:\s*/i, "")
      .trim()
  }

  const trackCity = extractYamlValue(weekendInfoBlock, "TrackCity")
  if (trackCity) weekendInfo.trackCity = cleanLocationValue(trackCity)
  
  const trackState = extractYamlValue(weekendInfoBlock, "TrackState")
  if (trackState) weekendInfo.trackState = cleanLocationValue(trackState)
  
  const trackCountry = extractYamlValue(weekendInfoBlock, "TrackCountry")
  if (trackCountry) weekendInfo.trackCountry = cleanLocationValue(trackCountry)
  
  const trackLength = extractYamlValue(weekendInfoBlock, "TrackLength")
  if (trackLength) weekendInfo.trackLength = trackLength
  
  const trackLengthOfficial = extractYamlValue(weekendInfoBlock, "TrackLengthOfficial")
  if (trackLengthOfficial) weekendInfo.trackLengthOfficial = trackLengthOfficial
  
  const trackNumTurns = weekendInfoBlock.match(/TrackNumTurns:\s*(\d+)/)
  if (trackNumTurns) weekendInfo.trackNumTurns = parseInt(trackNumTurns[1], 10)
  
  const trackType = extractYamlValue(weekendInfoBlock, "TrackType")
  if (trackType) weekendInfo.trackType = trackType
  
  // Event information
  const eventType = extractYamlValue(weekendInfoBlock, "EventType")
  if (eventType) weekendInfo.sessionType = eventType
  
  // Extract additional fields from WeekendInfo block
  const category = extractYamlValue(weekendInfoBlock, "Category")
  if (category) weekendInfo.category = category
  
  const seriesID = weekendInfoBlock.match(/SeriesID:\s*(\d+)/)
  if (seriesID) weekendInfo.seriesID = parseInt(seriesID[1], 10)
  
  const seasonID = weekendInfoBlock.match(/SeasonID:\s*(\d+)/)
  if (seasonID) weekendInfo.seasonID = parseInt(seasonID[1], 10)
  
  const sessionID = weekendInfoBlock.match(/SessionID:\s*(\d+)/)
  if (sessionID) weekendInfo.sessionID = parseInt(sessionID[1], 10)
  
  const subSessionID = weekendInfoBlock.match(/SubSessionID:\s*(\d+)/)
  if (subSessionID) weekendInfo.subSessionID = parseInt(subSessionID[1], 10)
  
  const official = weekendInfoBlock.match(/Official:\s*(\d+)/)
  if (official) weekendInfo.official = parseInt(official[1], 10)
  
  // Extract date and time from WeekendOptions if available
  const weekendOptionsMatch = yaml.match(/WeekendOptions:\s*\n([\s\S]*?)(?=\n\w+:|$)/)
  if (weekendOptionsMatch) {
    const weekendOptionsBlock = weekendOptionsMatch[1]
    const date = extractYamlValue(weekendOptionsBlock, "Date")
    if (date) weekendInfo.eventDate = date
    
    const timeOfDay = extractYamlValue(weekendOptionsBlock, "TimeOfDay")
    if (timeOfDay) weekendInfo.eventTime = timeOfDay
  }
  
  // Fallback to root level Date if not in WeekendOptions
  if (!weekendInfo.eventDate) {
    const date = extractYamlValue(yaml, "Date")
    if (date) weekendInfo.eventDate = date
  }
  
  return weekendInfo
}
