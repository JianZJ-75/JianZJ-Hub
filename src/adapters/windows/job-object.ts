import koffi from 'koffi'
import { randomUUID } from 'node:crypto'
if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('M0_REQUIRES_WINDOWS_X64')
const kernel = koffi.load('kernel32.dll')
const createJob = kernel.func('void * __stdcall CreateJobObjectW(void *, str16)')
const setJob = kernel.func('int __stdcall SetInformationJobObject(void *, int, void *, uint32_t)')
const assign = kernel.func('int __stdcall AssignProcessToJobObject(void *, void *)')
const queryJob = kernel.func('int __stdcall QueryInformationJobObject(void *, int, _Out_ void *, uint32_t, _Out_ uint32_t *)')
const terminateJob = kernel.func('int __stdcall TerminateJobObject(void *, uint32_t)')
const openProcess = kernel.func('void * __stdcall OpenProcess(uint32_t, int, uint32_t)')
const times = kernel.func('int __stdcall GetProcessTimes(void *, _Out_ void *, _Out_ void *, _Out_ void *, _Out_ void *)')
const wait = kernel.func('uint32_t __stdcall WaitForSingleObject(void *, uint32_t)')
const getExitCode = kernel.func('int __stdcall GetExitCodeProcess(void *, _Out_ uint32_t *)')
const terminateProcess = kernel.func('int __stdcall TerminateProcess(void *, uint32_t)')
const closeHandle = kernel.func('int __stdcall CloseHandle(void *)')
const lastError = kernel.func('uint32_t __stdcall GetLastError()')
const createEvent = kernel.func('void * __stdcall CreateEventW(void *, int, int, str16)')
const setEvent = kernel.func('int __stdcall SetEvent(void *)')
function check(ok: unknown, label: string) { if (!ok) throw new Error(`${label}: Win32 ${lastError()}`) }
export const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms))
export class ProcessHandle {
  readonly handle: unknown
  readonly createdAt: string
  private disposed = false
  constructor(readonly pid: number, assignable = true) {
    if (!Number.isInteger(pid) || pid <= 0) throw new Error('INVALID_PID')
    this.handle = openProcess(0x100000 | 0x1000 | (assignable ? 0x100 | 0x1 : 0), 0, pid)
    check(this.handle, `OpenProcess(${pid})`)
    const created = Buffer.alloc(8)
    try { check(times(this.handle, created, Buffer.alloc(8), Buffer.alloc(8), Buffer.alloc(8)), 'GetProcessTimes') }
    catch (error) { this.dispose(); throw error }
    this.createdAt = created.readBigUInt64LE().toString()
  }
  get exited() { const status = wait(this.handle, 0); if (status !== 0 && status !== 258) throw new Error(`WaitForSingleObject:${status}`); return status === 0 }
  get exitCode(): number {
    if (!this.exited) throw new Error('PROCESS_STILL_RUNNING')
    const code = new Uint32Array(1)
    check(getExitCode(this.handle, code), 'GetExitCodeProcess')
    return code[0]
  }
  async waitForExit(timeout = 10000) {
    const end = Date.now() + timeout
    while (!this.exited && Date.now() < end) await delay(50)
    if (!this.exited) throw new Error(`PROCESS_REMAINS:${this.pid}:${this.createdAt}`)
  }
  terminate() { check(terminateProcess(this.handle, 1), `TerminateProcess(${this.pid})`) }
  dispose() { if (!this.disposed) { closeHandle(this.handle); this.disposed = true } }
}
export class Job {
  private handle: unknown
  constructor() {
    this.handle = createJob(null, null); check(this.handle, 'CreateJobObjectW')
    // JOBOBJECT_EXTENDED_LIMIT_INFORMATION x64: 144 bytes, LimitFlags offset 16.
    const limits = Buffer.alloc(144); limits.writeUInt32LE(0x2000, 16)
    try { check(setJob(this.handle, 9, limits, limits.length), 'SetInformationJobObject(KILL_ON_JOB_CLOSE)') }
    catch (error) { this.dispose(); throw error }
  }
  assign(process: ProcessHandle) { check(assign(this.handle, process.handle), `AssignProcessToJobObject(${process.pid})`) }
  pids(): number[] {
    const buf = Buffer.alloc(8 + 8 * 4096)
    check(queryJob(this.handle, 3, buf, buf.length, new Uint32Array(1)), 'QueryInformationJobObject')
    const assigned = buf.readUInt32LE(0), count = buf.readUInt32LE(4)
    if (assigned !== count || count > 4096) throw new Error('JOB_PID_LIST_TRUNCATED')
    return Array.from({ length: count }, (_, i) => Number(buf.readBigUInt64LE(8 + i * 8)))
  }
  async terminate() {
    check(terminateJob(this.handle, 1), 'TerminateJobObject')
    const end = Date.now() + 10000
    while (this.pids().length && Date.now() < end) await delay(50)
    const remaining = this.pids(); if (remaining.length) throw new Error(`TERMINATION_FAILED:${remaining.join(',')}`)
  }
  dispose() { if (this.handle) { closeHandle(this.handle); this.handle = null } }
}
export class StartupGate {
  readonly name = `Local\\JianZJHub-M0-${randomUUID()}`
  private handle: unknown
  constructor() { this.handle = createEvent(null, 1, 0, this.name); check(this.handle, 'CreateEventW') }
  release() { check(setEvent(this.handle), 'SetEvent') }
  dispose() { if (this.handle) { closeHandle(this.handle); this.handle = null } }
}
