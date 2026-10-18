import { appendFileSync } from 'node:fs'
const target = process.env.JIANZJ_M1_IO_TRACE
export function ioTrace(event, fields = {}) {
  if (!target) return
  try { appendFileSync(target, JSON.stringify({ at: Date.now(), pid: process.pid, event, ...fields }) + '\n') } catch {}
}
