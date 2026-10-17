export const LIMITS = Object.freeze({ chunk: 16384, window: 131072, events: 64, input: 65536, requests: 64, scrollback: 4000 })
export function object(p, keys) { if (!p || typeof p !== 'object' || Array.isArray(p) || Object.keys(p).some(k => !keys.includes(k))) throw new Error('INVALID_SCHEMA'); return p }
export function text(value, max = 128) { if (typeof value !== 'string' || !value.trim() || value.length > max || /[\x00-\x1f]/.test(value)) throw new Error('INVALID_TEXT'); return value }
export function id(value) { if (typeof value !== 'string' || !/^[a-z]+-[0-9a-f-]{36}$/.test(value)) throw new Error('INVALID_ID'); return value }
export function generation(value) { if (!Number.isSafeInteger(value) || value < 1) throw new Error('STALE_SESSION'); return value }
export function size(cols, rows) { if (![cols, rows].every(v => Number.isInteger(v) && v >= 2 && v <= 500)) throw new Error('INVALID_SIZE') }
export function input(data) { if (typeof data !== 'string' || Buffer.byteLength(data, 'utf8') > LIMITS.input) throw new Error('INVALID_INPUT') }
export function preferences(p) { object(p, ['theme', 'fontSize', 'density']); if (!['system', 'light', 'dark'].includes(p.theme) || !Number.isInteger(p.fontSize) || p.fontSize < 12 || p.fontSize > 18 || !['comfortable', 'compact'].includes(p.density)) throw new Error('INVALID_PREFERENCES'); return p }
export function workspace(p) { object(p, ['id', 'name', 'cwd', 'layout']); id(p.id); text(p.name, 64); text(p.cwd, 1024); if (!['single', 'right', 'down'].includes(p.layout)) throw new Error('INVALID_LAYOUT'); return p }
export class Credit {
  sent = 0; acked = 0; bytes = 0; peak = 0; entries = new Map()
  add(bytes) { if (!Number.isInteger(bytes) || bytes < 0 || bytes > LIMITS.chunk || this.bytes + bytes > LIMITS.window) throw new Error('OUTPUT_WINDOW_EXCEEDED'); const seq = ++this.sent; this.entries.set(seq, bytes); this.bytes += bytes; this.peak = Math.max(this.peak, this.bytes); return seq }
  ack(seq) { if (!Number.isSafeInteger(seq) || seq < this.acked || seq > this.sent) throw new Error('INVALID_ACK'); for (let n = this.acked + 1; n <= seq; n++) { this.bytes -= this.entries.get(n); this.entries.delete(n) } this.acked = seq }
}
export function senderAllowed(event, contents, url) { return !!contents && !contents.isDestroyed() && event.sender === contents && event.senderFrame === contents.mainFrame && event.senderFrame?.url === url }
