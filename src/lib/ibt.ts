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

  const fullHeaderBuf = await readSlice(blob, 0, header.varHeaderOffset)
  const out: IbtHeader = { ...header, headerBytes: header.varHeaderOffset }

  if (fullHeaderBuf.byteLength >= 144) {
    const dh = new DataView(fullHeaderBuf)
    out.diskSubHeader = {
      sessionStartDate: dh.getInt32(112, true),
      sessionStartTime: dh.getFloat64(120, true),
      sessionEndTime: dh.getFloat64(128, true),
      lapCount: dh.getInt32(136, true),
      recordCount: dh.getInt32(140, true),
    }
  }

  return out
}

export async function readIbtVarHeaders(blob: Blob, header: IbtHeader): Promise<IbtVar[]> {
  const byteLen = header.numVars * VAR_HEADER_SIZE
  const buf = await readSlice(blob, header.varHeaderOffset, byteLen)
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
          return dv.getUint32(p, true)
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
            out[i] = dv.getUint32(pp, true)
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
      name: v.name,
      type: v.type,
      offset: v.offset,
      count: v.count,
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

export interface IbtSessionMetadata {
  trackName?: string
  carName?: string
  sessionDate?: string
  sessionTime?: string
  sessionType?: string
  trackConfig?: string
  lapCount?: number
  recordCount?: number
}

export async function readIbtMetadata(blob: Blob): Promise<IbtSessionMetadata> {
  const header = await readIbtHeader(blob)
  const yaml = await readIbtSessionInfoYaml(blob, header)
  
  const metadata: IbtSessionMetadata = {
    lapCount: header.diskSubHeader?.lapCount,
    recordCount: header.diskSubHeader?.recordCount,
  }

  const trackMatch = yaml.match(/TrackName:\s*"([^"]+)"/)
  if (trackMatch) metadata.trackName = trackMatch[1]

  const trackConfigMatch = yaml.match(/TrackConfig:\s*"([^"]+)"/)
  if (trackConfigMatch) metadata.trackConfig = trackConfigMatch[1]

  const carMatch = yaml.match(/CarSetup:\s*\n\s*Car:\s*"([^"]+)"/)
  if (carMatch) {
    metadata.carName = carMatch[1]
  } else {
    const carMatch2 = yaml.match(/CarName:\s*"([^"]+)"/)
    if (carMatch2) metadata.carName = carMatch2[1]
  }

  const sessionTypeMatch = yaml.match(/SessionType:\s*"([^"]+)"/)
  if (sessionTypeMatch) metadata.sessionType = sessionTypeMatch[1]

  if (header.diskSubHeader) {
    const date = new Date(header.diskSubHeader.sessionStartDate * 1000)
    metadata.sessionDate = date.toLocaleDateString()
    metadata.sessionTime = date.toLocaleTimeString()
  }

  return metadata
}


