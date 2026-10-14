export function validateSize(cols, rows) {
  if (![cols, rows].every(v => Number.isInteger(v) && v >= 2 && v <= 500)) throw new Error('INVALID_SIZE')
}
export function validateSessionId(value) {
  if (typeof value !== 'string' || !/^m0-[0-9a-f-]{36}$/.test(value)) throw new Error('INVALID_SESSION')
}
export function validateWrite(value) {
  if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > 65536) throw new Error('INVALID_INPUT')
}
