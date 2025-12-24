#!/usr/bin/env node
/**
 * iRacing .ibt telemetry converter (CSV / JSON / NDJSON)
 *
 * Works on iRacing "disk telemetry" files which follow the iRacing SDK
 * header + var header + sessionInfo YAML + fixed-size sample records layout.
 *
 * Examples:
 *   node scripts/convert-ibt.mjs --input "public/telemtry/foo.ibt" --format csv
 *   node scripts/convert-ibt.mjs --input "public/telemtry/foo.ibt" --format ndjson --vars "SessionTime,Speed,RPM,Gear"
 *   node scripts/convert-ibt.mjs --input "public/telemtry/foo.ibt" --list-vars
 */

import fs from "node:fs"
import path from "node:path"
import process from "node:process"

const VAR_HEADER_SIZE = 144

// iRacing SDK var types:
// 0=char, 1=bool, 2=int, 3=bitField, 4=float, 5=double
const VAR_TYPE_NAME = {
  0: "char",
  1: "bool",
  2: "int",
  3: "bitField",
  4: "float",
  5: "double",
}

function fail(message) {
  const err = new Error(message)
  err.name = "IbtConvertError"
  throw err
}

function stripNullTerminator(s) {
  const i = s.indexOf("\0")
  return i === -1 ? s : s.slice(0, i)
}

function parseCsvList(s) {
  return String(s)
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
}

function toInt(value, name) {
  const n = Number(value)
  if (!Number.isFinite(n) || !Number.isInteger(n)) fail(`Expected integer for --${name}, got: ${value}`)
  return n
}

function printHelp() {
  // Keep this help text copy/paste friendly for Windows PowerShell.
  console.log(`
Convert iRacing .ibt telemetry to CSV/JSON.

Usage:
  node scripts/convert-ibt.mjs --input <file.ibt> [options]

Options:
  --format <csv|ndjson|json>     Output format (default: csv)
  --out <path|->                Output file path (default: next to input)
  --vars <v1,v2,...>            Export only these channels (case-insensitive). Default: all.
  --exclude <v1,v2,...>         Exclude these channels
  --start <n>                   Start sample index (inclusive, default: 0)
  --end <n>                     End sample index (exclusive, default: recordCount)
  --stride <n>                  Export every Nth sample (default: 1)
  --delimiter <char>            CSV delimiter (default: ,)
  --no-index                    Do not include SampleIndex column/key
  --no-time                     Do not auto-include SessionTime channel
  --meta <path>                 Write metadata JSON (header/vars/sessionInfo YAML)
  --session-yaml <path>         Write raw sessionInfo YAML to a separate file
  --list-vars                   Print available telemetry channels and exit
  --help                        Show this help

Examples:
  node scripts/convert-ibt.mjs --input "public/telemtry/acuransxevo22gt3_virginia 2022 full 2025-12-20 22-57-02.ibt" --format csv
  node scripts/convert-ibt.mjs --input "public/telemtry/file.ibt" --format ndjson --vars "SessionTime,Speed,RPM,Gear,Throttle,Brake" --stride 2
  node scripts/convert-ibt.mjs --input "public/telemtry/file.ibt" --list-vars
`.trim())
}

function parseArgs(argv) {
  const opts = {
    input: undefined,
    format: "csv",
    out: undefined,
    vars: undefined,
    exclude: undefined,
    start: 0,
    end: undefined,
    stride: 1,
    delimiter: ",",
    includeIndex: true,
    autoIncludeTime: true,
    meta: undefined,
    sessionYaml: undefined,
    listVars: false,
    help: false,
  }

  const positional = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith("--")) {
      positional.push(a)
      continue
    }
    const key = a.slice(2)
    if (key === "help") {
      opts.help = true
      continue
    }
    if (key === "list-vars") {
      opts.listVars = true
      continue
    }
    if (key === "no-index") {
      opts.includeIndex = false
      continue
    }
    if (key === "no-time") {
      opts.autoIncludeTime = false
      continue
    }

    const value = argv[i + 1]
    if (value == null || value.startsWith("--")) fail(`Missing value for --${key}`)
    i++

    switch (key) {
      case "input":
        opts.input = value
        break
      case "format":
        opts.format = value
        break
      case "out":
        opts.out = value
        break
      case "vars":
        opts.vars = parseCsvList(value)
        break
      case "exclude":
        opts.exclude = parseCsvList(value)
        break
      case "start":
        opts.start = toInt(value, "start")
        break
      case "end":
        opts.end = toInt(value, "end")
        break
      case "stride":
        opts.stride = toInt(value, "stride")
        break
      case "delimiter":
        opts.delimiter = value
        break
      case "meta":
        opts.meta = value
        break
      case "session-yaml":
        opts.sessionYaml = value
        break
      default:
        fail(`Unknown option: --${key}`)
    }
  }

  if (!opts.input) opts.input = positional[0]
  return opts
}

function readHeader(fd) {
  // Read the first 40 bytes to get the base header fields (and varHeaderOffset).
  const base = Buffer.alloc(40)
  fs.readSync(fd, base, 0, base.length, 0)
  const dv = new DataView(base.buffer, base.byteOffset, base.byteLength)

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

  if (header.varHeaderOffset <= 0 || header.varHeaderOffset > 1024 * 1024) {
    fail(`Unexpected varHeaderOffset: ${header.varHeaderOffset} (is this an .ibt file?)`)
  }

  // Read full header region (up to var headers)
  const full = Buffer.alloc(header.varHeaderOffset)
  fs.readSync(fd, full, 0, full.length, 0)

  const out = { ...header, headerBytes: header.varHeaderOffset }

  // iRacing disk telemetry typically appends a "diskSubHeader" in the final 32 bytes of the header (total 144 bytes).
  // We keep it optional but parse a few useful fields if present.
  if (full.length >= 144) {
    const dvh = new DataView(full.buffer, full.byteOffset, full.byteLength)
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

function readVarHeaders(fd, header) {
  const byteLen = header.numVars * VAR_HEADER_SIZE
  const buf = Buffer.alloc(byteLen)
  fs.readSync(fd, buf, 0, buf.length, header.varHeaderOffset)

  const vars = []
  for (let i = 0; i < header.numVars; i++) {
    const base = i * VAR_HEADER_SIZE
    const dv = new DataView(buf.buffer, buf.byteOffset + base, VAR_HEADER_SIZE)

    const type = dv.getInt32(0, true)
    const offset = dv.getInt32(4, true)
    const count = dv.getInt32(8, true)
    const countAsTime = dv.getInt32(12, true)

    const name = stripNullTerminator(buf.slice(base + 16, base + 48).toString("ascii"))
    const desc = stripNullTerminator(buf.slice(base + 48, base + 112).toString("ascii"))
    const unit = stripNullTerminator(buf.slice(base + 112, base + 144).toString("ascii"))

    vars.push({
      index: i,
      name,
      type,
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

function readSessionInfo(fd, header) {
  const buf = Buffer.alloc(header.sessionInfoLen)
  fs.readSync(fd, buf, 0, buf.length, header.sessionInfoOffset)
  return buf.toString("utf8")
}

function computeDataStart(header) {
  return header.sessionInfoOffset + header.sessionInfoLen
}

function computeRecordCount(fileSizeBytes, dataStart, bufLen) {
  const dataBytes = fileSizeBytes - dataStart
  if (dataBytes < 0) return { recordCount: 0, remainder: dataBytes }
  return { recordCount: Math.floor(dataBytes / bufLen), remainder: dataBytes % bufLen }
}

function pickVars(allVars, { vars, exclude, autoIncludeTime }) {
  const byLower = new Map(allVars.map((v) => [v.name.toLowerCase(), v]))

  const selected = []
  const pushUnique = (v) => {
    if (!v) return
    if (selected.some((x) => x.name === v.name)) return
    selected.push(v)
  }

  if (Array.isArray(vars) && vars.length > 0) {
    for (const requested of vars) {
      const v = byLower.get(requested.toLowerCase())
      if (!v) fail(`Unknown channel in --vars: ${requested}`)
      pushUnique(v)
    }
  } else {
    for (const v of allVars) pushUnique(v)
  }

  if (Array.isArray(exclude) && exclude.length > 0) {
    const excludeSet = new Set(exclude.map((x) => x.toLowerCase()))
    for (let i = selected.length - 1; i >= 0; i--) {
      if (excludeSet.has(selected[i].name.toLowerCase())) selected.splice(i, 1)
    }
  }

  if (autoIncludeTime) {
    const st = byLower.get("sessiontime")
    if (st) pushUnique(st)
  }

  // Keep SessionTime first if present (dashboard-friendly).
  const stIdx = selected.findIndex((v) => v.name.toLowerCase() === "sessiontime")
  if (stIdx > 0) {
    const [st] = selected.splice(stIdx, 1)
    selected.unshift(st)
  }

  return selected
}

function csvEscape(value, delimiter) {
  if (value == null) return ""
  let s = String(value)
  const needsQuote = s.includes(delimiter) || s.includes("\n") || s.includes("\r") || s.includes('"')
  if (s.includes('"')) s = s.replaceAll('"', '""')
  return needsQuote ? `"${s}"` : s
}

function makeVarReaders(vars) {
  return vars.map((v) => {
    const type = v.type
    const count = v.count
    const baseOffset = v.offset

    const readScalar = (buf, recBase) => {
      const p = recBase + baseOffset
      switch (type) {
        case 0:
          return buf.readUInt8(p)
        case 1:
          return buf.readUInt8(p) !== 0
        case 2:
          return buf.readInt32LE(p)
        case 3:
          return buf.readUInt32LE(p)
        case 4:
          return buf.readFloatLE(p)
        case 5:
          return buf.readDoubleLE(p)
        default:
          return null
      }
    }

    const readArray = (buf, recBase) => {
      if (type === 0) {
        const p = recBase + baseOffset
        return stripNullTerminator(buf.toString("utf8", p, p + count))
      }
      const out = new Array(count)
      const elemSize =
        type === 5 ? 8 : type === 4 ? 4 : type === 2 || type === 3 ? 4 : type === 1 ? 1 : type === 0 ? 1 : 0
      for (let i = 0; i < count; i++) {
        const p = recBase + baseOffset + i * elemSize
        switch (type) {
          case 1:
            out[i] = buf.readUInt8(p) !== 0
            break
          case 2:
            out[i] = buf.readInt32LE(p)
            break
          case 3:
            out[i] = buf.readUInt32LE(p)
            break
          case 4:
            out[i] = buf.readFloatLE(p)
            break
          case 5:
            out[i] = buf.readDoubleLE(p)
            break
          case 0:
            out[i] = buf.readUInt8(p)
            break
          default:
            out[i] = null
        }
      }
      return out
    }

    return {
      ...v,
      read: count === 1 ? readScalar : readArray,
    }
  })
}

function defaultOutPath(inputPath, format) {
  const dir = path.dirname(inputPath)
  const base = path.basename(inputPath, path.extname(inputPath))
  const ext = format === "csv" ? ".csv" : format === "ndjson" ? ".ndjson" : ".json"
  return path.join(dir, `${base}${ext}`)
}

async function writeCsv({ fd, header, fileSizeBytes, dataStart, recordCount, vars, opts }) {
  const delimiter = opts.delimiter ?? ","
  const outPath = opts.out ?? defaultOutPath(opts.input, "csv")
  const out = outPath === "-" ? process.stdout : fs.createWriteStream(outPath)

  const readers = makeVarReaders(vars)

  const columns = []
  if (opts.includeIndex) columns.push({ name: "SampleIndex", get: (_buf, sampleIndex) => sampleIndex })

  for (const v of readers) {
    if (v.count === 1) {
      columns.push({ name: v.name, get: (buf, _sampleIndex, recBase) => v.read(buf, recBase) })
      continue
    }

    // Expand arrays into multiple columns for CSV
    if (v.type === 0) {
      columns.push({ name: v.name, get: (buf, _sampleIndex, recBase) => v.read(buf, recBase) })
      continue
    }

    for (let i = 0; i < v.count; i++) {
      columns.push({
        name: `${v.name}[${i}]`,
        get: (buf, _sampleIndex, recBase) => {
          const arr = v.read(buf, recBase)
          return Array.isArray(arr) ? arr[i] : ""
        },
      })
    }
  }

  out.write(columns.map((c) => csvEscape(c.name, delimiter)).join(delimiter) + "\n")

  const start = opts.start ?? 0
  const end = opts.end ?? recordCount
  const stride = opts.stride ?? 1

  const chunkRecords = 1024
  const chunkBuf = Buffer.alloc(header.bufLen * chunkRecords)

  let pos = dataStart + start * header.bufLen
  const posEnd = dataStart + end * header.bufLen
  let sampleIndex = start

  while (pos < posEnd) {
    const remaining = posEnd - pos
    const toRead = Math.min(chunkBuf.length, remaining)
    const bytesRead = fs.readSync(fd, chunkBuf, 0, toRead, pos)
    if (bytesRead <= 0) break

    const recordsInChunk = Math.floor(bytesRead / header.bufLen)
    let lines = ""

    for (let r = 0; r < recordsInChunk; r++) {
      const recBase = r * header.bufLen
      const i = sampleIndex + r
      if ((i - start) % stride !== 0) continue

      const row = []
      for (const c of columns) {
        const value = c.get(chunkBuf, i, recBase)
        if (typeof value === "boolean") {
          row.push(value ? "1" : "0")
        } else if (value == null || Number.isNaN(value)) {
          row.push("")
        } else {
          row.push(csvEscape(value, delimiter))
        }
      }
      lines += row.join(delimiter) + "\n"
    }

    if (lines) out.write(lines)

    pos += recordsInChunk * header.bufLen
    sampleIndex += recordsInChunk
  }

  if (out !== process.stdout) {
    await new Promise((resolve, reject) => {
      out.on("error", reject)
      out.end(resolve)
    })
  }

  const written = outPath === "-" ? "(stdout)" : outPath
  console.error(
    `Wrote CSV: ${written}  | samples: ${recordCount} (exported ${Math.ceil((end - start) / stride)}) | file: ${
      (fileSizeBytes / (1024 * 1024)).toFixed(1)
    } MiB`,
  )
}

async function writeNdjson({ fd, header, fileSizeBytes, dataStart, recordCount, vars, opts }) {
  const outPath = opts.out ?? defaultOutPath(opts.input, "ndjson")
  const out = outPath === "-" ? process.stdout : fs.createWriteStream(outPath)
  const readers = makeVarReaders(vars)

  const start = opts.start ?? 0
  const end = opts.end ?? recordCount
  const stride = opts.stride ?? 1

  const chunkRecords = 1024
  const chunkBuf = Buffer.alloc(header.bufLen * chunkRecords)

  let pos = dataStart + start * header.bufLen
  const posEnd = dataStart + end * header.bufLen
  let sampleIndex = start

  while (pos < posEnd) {
    const remaining = posEnd - pos
    const toRead = Math.min(chunkBuf.length, remaining)
    const bytesRead = fs.readSync(fd, chunkBuf, 0, toRead, pos)
    if (bytesRead <= 0) break

    const recordsInChunk = Math.floor(bytesRead / header.bufLen)
    let lines = ""

    for (let r = 0; r < recordsInChunk; r++) {
      const recBase = r * header.bufLen
      const i = sampleIndex + r
      if ((i - start) % stride !== 0) continue

      const obj = {}
      if (opts.includeIndex) obj.SampleIndex = i
      for (const v of readers) {
        obj[v.name] = v.read(chunkBuf, recBase)
      }
      lines += JSON.stringify(obj) + "\n"
    }

    if (lines) out.write(lines)

    pos += recordsInChunk * header.bufLen
    sampleIndex += recordsInChunk
  }

  if (out !== process.stdout) {
    await new Promise((resolve, reject) => {
      out.on("error", reject)
      out.end(resolve)
    })
  }

  const written = outPath === "-" ? "(stdout)" : outPath
  console.error(
    `Wrote NDJSON: ${written}  | samples: ${recordCount} (exported ${Math.ceil((end - start) / stride)}) | file: ${
      (fileSizeBytes / (1024 * 1024)).toFixed(1)
    } MiB`,
  )
}

async function writeJsonArray({ fd, header, fileSizeBytes, dataStart, recordCount, vars, opts }) {
  const outPath = opts.out ?? defaultOutPath(opts.input, "json")
  const out = outPath === "-" ? process.stdout : fs.createWriteStream(outPath)
  const readers = makeVarReaders(vars)

  const start = opts.start ?? 0
  const end = opts.end ?? recordCount
  const stride = opts.stride ?? 1

  out.write("[\n")

  const chunkRecords = 1024
  const chunkBuf = Buffer.alloc(header.bufLen * chunkRecords)

  let pos = dataStart + start * header.bufLen
  const posEnd = dataStart + end * header.bufLen
  let sampleIndex = start
  let first = true

  while (pos < posEnd) {
    const remaining = posEnd - pos
    const toRead = Math.min(chunkBuf.length, remaining)
    const bytesRead = fs.readSync(fd, chunkBuf, 0, toRead, pos)
    if (bytesRead <= 0) break

    const recordsInChunk = Math.floor(bytesRead / header.bufLen)
    let chunkOut = ""

    for (let r = 0; r < recordsInChunk; r++) {
      const recBase = r * header.bufLen
      const i = sampleIndex + r
      if ((i - start) % stride !== 0) continue

      const obj = {}
      if (opts.includeIndex) obj.SampleIndex = i
      for (const v of readers) {
        obj[v.name] = v.read(chunkBuf, recBase)
      }

      const prefix = first ? "" : ",\n"
      first = false
      chunkOut += prefix + JSON.stringify(obj)
    }

    if (chunkOut) out.write(chunkOut)

    pos += recordsInChunk * header.bufLen
    sampleIndex += recordsInChunk
  }

  out.write("\n]\n")

  if (out !== process.stdout) {
    await new Promise((resolve, reject) => {
      out.on("error", reject)
      out.end(resolve)
    })
  }

  const written = outPath === "-" ? "(stdout)" : outPath
  console.error(
    `Wrote JSON: ${written}  | samples: ${recordCount} (exported ${Math.ceil((end - start) / stride)}) | file: ${
      (fileSizeBytes / (1024 * 1024)).toFixed(1)
    } MiB`,
  )
}

async function writeMeta({ header, fileSizeBytes, dataStart, recordCountComputed, remainder, vars, sessionInfo, opts }) {
  if (!opts.meta) return

  const weekendInfo = {}

  const weekendTrackDisplayName = sessionInfo.match(/TrackDisplayName:\s*"([^"]+)"/)
  if (weekendTrackDisplayName) weekendInfo.trackDisplayName = weekendTrackDisplayName[1]

  const weekendTrackDisplayShortName = sessionInfo.match(/TrackDisplayShortName:\s*"([^"]+)"/)
  if (weekendTrackDisplayShortName) weekendInfo.trackDisplayShortName = weekendTrackDisplayShortName[1]

  const weekendTrackConfigName = sessionInfo.match(/TrackConfigName:\s*"([^"]+)"/)
  if (weekendTrackConfigName) weekendInfo.trackConfigName = weekendTrackConfigName[1]

  const weekendTrackCity = sessionInfo.match(/TrackCity:\s*"([^"]+)"/)
  if (weekendTrackCity) weekendInfo.trackCity = weekendTrackCity[1]

  const weekendTrackState = sessionInfo.match(/TrackState:\s*"([^"]+)"/)
  if (weekendTrackState) weekendInfo.trackState = weekendTrackState[1]

  const weekendTrackCountry = sessionInfo.match(/TrackCountry:\s*"([^"]+)"/)
  if (weekendTrackCountry) weekendInfo.trackCountry = weekendTrackCountry[1]

  const weekendTrackLength = sessionInfo.match(/TrackLength:\s*"([^"]+)"/)
  if (weekendTrackLength) weekendInfo.trackLength = weekendTrackLength[1]

  const weekendTrackLengthOfficial = sessionInfo.match(/TrackLengthOfficial:\s*"([^"]+)"/)
  if (weekendTrackLengthOfficial) weekendInfo.trackLengthOfficial = weekendTrackLengthOfficial[1]

  const weekendTrackNumTurns = sessionInfo.match(/TrackNumTurns:\s*(\d+)/)
  if (weekendTrackNumTurns) weekendInfo.trackNumTurns = parseInt(weekendTrackNumTurns[1], 10)

  const weekendTrackType = sessionInfo.match(/TrackType:\s*"([^"]+)"/)
  if (weekendTrackType) weekendInfo.trackType = weekendTrackType[1]

  const weekendEventType = sessionInfo.match(/EventType:\s*"([^"]+)"/)
  if (weekendEventType) weekendInfo.sessionType = weekendEventType[1]

  const weekendDate = sessionInfo.match(/^\s*Date:\s*"([^"]+)"/m)
  if (weekendDate) weekendInfo.eventDate = weekendDate[1]

  let carName = null
  let carPath = null

  const driverCarIdxMatch = sessionInfo.match(/DriverCarIdx:\s*(\d+)/)
  const driverCarIdx = driverCarIdxMatch ? parseInt(driverCarIdxMatch[1], 10) : null

  if (driverCarIdx !== null) {
    const driverEntryRegex = new RegExp(`-\\s*CarIdx:\\s*${driverCarIdx}\\b([\\s\\S]*?)(?=\\n\\s*-\\s*CarIdx:|$)`)
    const driverEntry = sessionInfo.match(driverEntryRegex)

    if (driverEntry) {
      const carScreenNameMatch = driverEntry[1].match(/CarScreenName:\s*"([^"]+)"/)
      if (carScreenNameMatch) carName = carScreenNameMatch[1]

      const carPathMatch = driverEntry[1].match(/CarPath:\s*"([^"]+)"/)
      if (carPathMatch) carPath = carPathMatch[1]
    }
  }

  if (!carName) {
    const firstDriverEntry = sessionInfo.match(/Drivers:([\s\S]*?)-\s*CarIdx:\s*\d+/)
    if (firstDriverEntry) {
      const carScreenNameMatch = firstDriverEntry[1].match(/CarScreenName:\s*"([^"]+)"/)
      if (carScreenNameMatch) carName = carScreenNameMatch[1]

      const carPathMatch = firstDriverEntry[1].match(/CarPath:\s*"([^"]+)"/)
      if (carPathMatch) carPath = carPathMatch[1]
    }
  }

  const trackMatch = sessionInfo.match(/TrackName:\s*"([^"]+)"/)
  const trackName = trackMatch ? trackMatch[1] : undefined

  const trackConfigMatch = sessionInfo.match(/TrackConfig:\s*"([^"]+)"/)
  const trackConfig = trackConfigMatch ? trackConfigMatch[1] : undefined

  const sessionTypeMatch = sessionInfo.match(/SessionType:\s*"([^"]+)"/)
  const sessionType = sessionTypeMatch ? sessionTypeMatch[1] : undefined

  const trackDisplayNameMatch = sessionInfo.match(/TrackDisplayName:\s*"([^"]+)"/)
  const trackDisplayName = trackDisplayNameMatch ? trackDisplayNameMatch[1] : undefined

  const metadata = {
    carName,
    carPath,
    trackName,
    trackDisplayName,
    trackConfigName: weekendInfo.trackConfigName,
    sessionType,
    trackConfig,
  }

  if (Object.keys(weekendInfo).length > 0) {
    metadata.weekendInfo = weekendInfo
  }

  const meta = {
    input: {
      path: opts.input,
      bytes: fileSizeBytes,
    },
    header: {
      ver: header.ver,
      status: header.status,
      tickRate: header.tickRate,
      sessionInfoUpdate: header.sessionInfoUpdate,
      sessionInfoLen: header.sessionInfoLen,
      sessionInfoOffset: header.sessionInfoOffset,
      numVars: header.numVars,
      varHeaderOffset: header.varHeaderOffset,
      numBuf: header.numBuf,
      bufLen: header.bufLen,
      headerBytes: header.headerBytes,
      diskSubHeader: header.diskSubHeader ?? null,
    },
    data: {
      dataStart,
      recordCountComputed,
      remainderBytes: remainder,
    },
    variables: vars.map((v) => ({
      index: v.index,
      name: v.name,
      type: v.type,
      typeName: v.typeName,
      offset: v.offset,
      count: v.count,
      countAsTime: v.countAsTime,
      unit: v.unit,
      desc: v.desc,
    })),
    sessionInfoYAML: sessionInfo,
    metadata,
  }

  fs.writeFileSync(opts.meta, JSON.stringify(meta, null, 2), "utf8")
  console.error(`Wrote metadata: ${opts.meta}`)
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))

  if (opts.help) {
    printHelp()
    return
  }

  if (!opts.input) {
    printHelp()
    fail("Missing --input <file.ibt>")
  }

  if (!fs.existsSync(opts.input)) fail(`Input file not found: ${opts.input}`)
  if (opts.stride <= 0) fail(`--stride must be >= 1`)
  if (opts.start < 0) fail(`--start must be >= 0`)
  if (opts.end != null && opts.end < 0) fail(`--end must be >= 0`)

  const stat = fs.statSync(opts.input)
  const fd = fs.openSync(opts.input, "r")
  try {
    const header = readHeader(fd)
    const allVars = readVarHeaders(fd, header)
    const sessionInfo = readSessionInfo(fd, header)
    const dataStart = computeDataStart(header)

    const { recordCount: recordCountComputed, remainder } = computeRecordCount(stat.size, dataStart, header.bufLen)
    const recordCount = recordCountComputed

    if (remainder !== 0) {
      console.error(`Warning: data section is not an even multiple of bufLen. remainderBytes=${remainder}`)
    }

    if (opts.end == null) opts.end = recordCount
    if (opts.end > recordCount) opts.end = recordCount
    if (opts.start > opts.end) fail(`--start must be <= --end`)

    if (opts.listVars) {
      // Print a concise list. Prefer tab-separated for easy pasting into spreadsheets.
      console.log("name\ttype\tcount\tunit\toffset\tdesc")
      for (const v of allVars) {
        console.log(
          `${v.name}\t${v.typeName}\t${v.count}\t${v.unit || ""}\t${v.offset}\t${(v.desc || "").replaceAll("\t", " ")}`,
        )
      }
      return
    }

    const selectedVars = pickVars(allVars, {
      vars: opts.vars,
      exclude: opts.exclude,
      autoIncludeTime: opts.autoIncludeTime,
    })

    // Basic sanity check that selected vars fit within bufLen.
    for (const v of selectedVars) {
      if (v.offset < 0 || v.offset >= header.bufLen) fail(`Channel ${v.name} has invalid offset ${v.offset}`)
    }

    // Optional side exports
    if (opts.sessionYaml) {
      fs.writeFileSync(opts.sessionYaml, sessionInfo, "utf8")
      console.error(`Wrote session YAML: ${opts.sessionYaml}`)
    }

    await writeMeta({
      header,
      fileSizeBytes: stat.size,
      dataStart,
      recordCountComputed,
      remainder,
      vars: allVars,
      sessionInfo,
      opts,
    })

    const format = String(opts.format || "csv").toLowerCase()
    if (format === "csv") {
      await writeCsv({
        fd,
        header,
        fileSizeBytes: stat.size,
        dataStart,
        recordCount,
        vars: selectedVars,
        opts,
      })
      return
    }

    if (format === "ndjson") {
      await writeNdjson({
        fd,
        header,
        fileSizeBytes: stat.size,
        dataStart,
        recordCount,
        vars: selectedVars,
        opts,
      })
      return
    }

    if (format === "json") {
      await writeJsonArray({
        fd,
        header,
        fileSizeBytes: stat.size,
        dataStart,
        recordCount,
        vars: selectedVars,
        opts,
      })
      return
    }

    fail(`Unsupported --format: ${opts.format} (expected csv|ndjson|json)`)
  } finally {
    fs.closeSync(fd)
  }
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err)
  console.error(`Error: ${msg}`)
  process.exitCode = 1
})


