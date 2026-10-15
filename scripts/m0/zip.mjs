import { inflateRawSync } from 'node:zlib'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fail, inside } from './preparation.mjs'

function crc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}
export function zipEntries(bytes) {
  let end = -1
  for (let pos = bytes.length - 22; pos >= Math.max(0, bytes.length - 65557); pos--) {
    if (bytes.readUInt32LE(pos) === 0x06054b50 && pos + 22 + bytes.readUInt16LE(pos + 20) === bytes.length) { end = pos; break }
  }
  if (end < 0 || bytes.readUInt32LE(end + 4) !== 0 || bytes.readUInt16LE(end + 8) !== bytes.readUInt16LE(end + 10)) fail('M0_ZIP_UNSUPPORTED', 'missing end record or multidisk archive')
  const count = bytes.readUInt16LE(end + 10), size = bytes.readUInt32LE(end + 12), start = bytes.readUInt32LE(end + 16)
  if (count > 1024 || start + size !== end) fail('M0_ZIP_UNSUPPORTED', 'central directory limit/offset')
  let pos = start, total = 0
  const entries = [], seen = new Set()
  for (let index = 0; index < count; index++) {
    if (pos + 46 > end || bytes.readUInt32LE(pos) !== 0x02014b50) fail('M0_ZIP_INVALID', 'central entry')
    const flags = bytes.readUInt16LE(pos + 8), method = bytes.readUInt16LE(pos + 10), crc = bytes.readUInt32LE(pos + 16), packed = bytes.readUInt32LE(pos + 20), length = bytes.readUInt32LE(pos + 24), nameSize = bytes.readUInt16LE(pos + 28), extraSize = bytes.readUInt16LE(pos + 30), commentSize = bytes.readUInt16LE(pos + 32), disk = bytes.readUInt16LE(pos + 34), mode = bytes.readUInt32LE(pos + 38) >>> 16, local = bytes.readUInt32LE(pos + 42)
    const next = pos + 46 + nameSize + extraSize + commentSize
    if (next > end) fail('M0_ZIP_INVALID', 'truncated central entry')
    const nameBytes = bytes.subarray(pos + 46, pos + 46 + nameSize), name = nameBytes.toString('utf8')
    const parts = name.split('/'), directory = name.endsWith('/'), segments = directory ? parts.slice(0, -1) : parts
    if (!name || name.includes(String.fromCharCode(92)) || /[:\x00-\x1f]/.test(name) || segments.some(p => !p || p === '.' || p === '..' || /[. ]$/.test(p) || /^(CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])(\.|$)/i.test(p)) || (mode & 0xf000) === 0xa000 || seen.has(name.toLowerCase())) fail('M0_UNSAFE_ZIP_ENTRY', name)
    seen.add(name.toLowerCase())
    total += length
    if (flags & 1 || disk !== 0 || ![0, 8].includes(method) || length > 64 * 1024 * 1024 || total > 128 * 1024 * 1024 || local + 30 > start || bytes.readUInt32LE(local) !== 0x04034b50) fail('M0_ZIP_UNSUPPORTED', name)
    const localNameSize = bytes.readUInt16LE(local + 26), localExtraSize = bytes.readUInt16LE(local + 28), dataStart = local + 30 + localNameSize + localExtraSize
    if (dataStart + packed > start || bytes.readUInt16LE(local + 8) !== method || bytes.readUInt16LE(local + 6) !== flags || !bytes.subarray(local + 30, local + 30 + localNameSize).equals(nameBytes)) fail('M0_ZIP_INVALID', `local entry ${name}`)
    const compressed = bytes.subarray(dataStart, dataStart + packed), data = method === 0 ? compressed : inflateRawSync(compressed, { maxOutputLength: Math.max(1, length) })
    if (data.length !== length || crc32(data) !== crc) fail('M0_ZIP_CRC_MISMATCH', name)
    entries.push({ name, directory, data }); pos = next
  }
  if (pos !== end) fail('M0_ZIP_INVALID', 'central directory size')
  return entries
}
export function extractZip(bytes, destination) {
  const entries = zipEntries(bytes)
  if (existsSync(destination)) fail('M0_EXTRACTION_DESTINATION_EXISTS', destination)
  // Validate the entire archive before writing any destination files.
  for (const entry of entries) inside(destination, entry.name)
  mkdirSync(destination, { recursive: true })
  for (const entry of entries) {
    const target = inside(destination, entry.name)
    if (entry.directory) mkdirSync(target, { recursive: true })
    else { mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, entry.data, { flag: 'wx' }) }
  }
}
