import { app } from 'electron'
import { Service } from '../../src/main/workstation/service'
import { Job, ProcessHandle, delay } from '../../src/adapters/windows/job-object'
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import koffi from 'koffi'
const kernel = koffi.load('kernel32.dll'), getHandles = kernel.func('int __stdcall GetProcessHandleCount(void *, _Out_ uint32_t *)')
const directory = resolve(process.env.JIANZJ_M1_EVIDENCE!)
mkdirSync(directory, { recursive: true }); app.setPath('userData', join(directory, 'userData'))
const fixture = join(directory, 'output-fixture.cjs')
writeFileSync(fixture, `const fs=require('fs'); const {once}=require('events'); (async()=>{for(let n=0;n<16000;n++){const line='[M1REC'+String(n).padStart(6,'0')+':'+(n*2654435761>>>0).toString(16).padStart(8,'0')+']';if(!process.stdout.write(line+'\\r\\n'))await once(process.stdout,'drain')}await new Promise(r=>process.stdout.write('M1_中文_TAIL\\r\\n',r));fs.writeFileSync(process.argv[2],'written');if(process.argv[3]==='hold')setInterval(()=>{},1000)})().catch(e=>{console.error(e);process.exit(2)})`)
app.whenReady().then(async () => {
  const service = new Service(join(__dirname, 'pty-service.js'), directory), checks: any[] = [], events: any[] = [], output = new Map<string, string>(), handles: ProcessHandle[] = []
  let slow = false, hold = false
  const queued: any[] = []
  service.on('terminal', event => {
    if (event.type === 'data') {
      output.set(event.sessionId, ((output.get(event.sessionId) || '') + event.data).slice(-8 * 1024 * 1024))
      const ack = () => void service.request('ack', { sessionId: event.sessionId, generation: 1, seq: event.seq }).catch(() => {})
      if (hold) queued.push(ack); else if (slow) setTimeout(ack, 8); else ack()
    } else events.push(event)
  })
  const until = async (f: () => any, timeout = 45000) => { const end = Date.now() + timeout; while (!f()) { if (Date.now() > end) throw new Error('CONDITION_TIMEOUT'); await delay(20) } return f() }
  const make = async () => {
    const sessionId = 'session-' + randomUUID(), result = await service.request('create', { sessionId, paneId: 'pane-' + randomUUID(), workspaceId: 'workspace-' + randomUUID(), generation: 1, cwd: directory, historyDir: directory, shell: 'powershell', cols: 100, rows: 30 })
    handles.push(new ProcessHandle(result.pid, false)); return result
  }
  const ref = (s: any, extra = {}) => ({ sessionId: s.sessionId, generation: 1, ...extra })
  const command = (s: any, data: string) => service.request('write', ref(s, { data: data + '\r' }))
  const check = async (name: string, run: () => any) => { const detail = await run(); checks.push({ name, status: 'pass', detail }); writeFileSync(join(directory, 'stress.json'), JSON.stringify({ checks }, null, 2)) }
  const quote = (s: string) => s.replaceAll("'", "''")
  const runWriter = (s: any, mode: string) => command(s, `[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); $env:ELECTRON_RUN_AS_NODE='1'; $p=Start-Process -FilePath '${quote(process.execPath)}' -ArgumentList @('"${quote(fixture)}"','"${quote(join(directory, mode + '.ready'))}"','${mode}') -NoNewWindow -PassThru; $p.WaitForExit(); ${mode === 'natural' ? 'exit 5' : ''}`)
  const validateOutput = (s: any) => {
    const text = output.get(s.sessionId) || '', plain = text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '')
    const records = plain.match(/\[M1REC\d{6}:[0-9a-f]{8}\]/g) || []
    const expected = Array.from({ length: 16000 }, (_, n) => '[M1REC' + String(n).padStart(6, '0') + ':' + (n * 2654435761 >>> 0).toString(16).padStart(8, '0') + ']')
    const hash = (records: string[]) => createHash('sha256').update(records.join('\n')).digest('hex')
    assert.equal(records.length, expected.length); assert.equal(hash(records), hash(expected)); assert.ok(plain.includes('M1_中文_TAIL'))
    return { records: records.length, actualSha256: hash(records), expectedSha256: hash(expected), tailUnicode: true, outputBytes: Buffer.byteLength(text) }
  }
  try {
    await service.ready
    let survivor: any
    await check('two independent sessions reject stale generation, bad resize and repeated close is idempotent', async () => {
      survivor = await make(); const b = await make()
      await assert.rejects(service.request('write', ref(b, { generation: 2, data: 'bad' })), /STALE_SESSION/)
      await assert.rejects(service.request('resize', ref(b, { cols: 0, rows: 24 })), /INVALID_SIZE/)
      const first = await service.request('close', ref(b)), again = await service.request('close', ref(b)); assert.equal(first.exitCode, again.exitCode)
      await command(survivor, 'Write-Output ("M1_SURVIVOR_"+(20+22))'); await until(() => output.get(survivor.sessionId)?.includes('M1_SURVIVOR_42'))
      return { closed: first, survivorPid: survivor.pid }
    })
    await check('paused consumer bounds service output; resumed slow consumer preserves every record at natural EOF', async () => {
      const s = await make(); output.set(s.sessionId, ''); hold = true
      await runWriter(s, 'natural'); await delay(600)
      const inspect = await service.request('inspect'), paused = inspect.active.find((v: any) => v.sessionId === s.sessionId)
      assert.ok(paused.bytes <= 131072); assert.ok(paused.bytes > 0)
      hold = false; slow = true; queued.splice(0).forEach(ack => ack())
      const exit = await until(() => events.find(e => e.sessionId === s.sessionId && e.type === 'exit'))
      slow = false; assert.equal(exit.exitCode, 5); assert.equal(exit.outputComplete, true); assert.ok(exit.peak <= 131072)
      return { paused, exit, output: validateOutput(s) }
    })
    await check('active close keeps output reader alive and delivers all produced tail bytes before reclaim', async () => {
      const s = await make(); output.set(s.sessionId, ''); slow = true
      await runWriter(s, 'hold'); await until(() => existsSync(join(directory, 'hold.ready')))
      const result = await service.request('close', ref(s)); slow = false
      assert.equal(result.outputComplete, true); assert.deepEqual(result.cleanup.remaining, [])
      return { result, output: validateOutput(s) }
    })
    await check('worker crash reclaims only its Job; survivor still interactive', async () => {
      const s = await make(), worker = new ProcessHandle(s.workerPid)
      worker.terminate(); await worker.waitForExit(); worker.dispose()
      const event = await until(() => events.find(e => e.sessionId === s.sessionId && e.type === 'fault'))
      assert.equal(event.outputComplete, false); assert.deepEqual(event.cleanup.remaining, [])
      await command(survivor, 'Write-Output ("M1_AFTERFAULT_"+(21+21))'); await until(() => output.get(survivor.sessionId)?.includes('M1_AFTERFAULT_42'))
      return event
    })
    await check('simultaneous natural exits keep per-session output and exit events isolated', async () => {
      const a = await make(), b = await make(); output.set(a.sessionId, ''); output.set(b.sessionId, '')
      await Promise.all([command(a, "Write-Output ('M1_PAIR_A_'+(19+23)); exit 5"), command(b, "Write-Output ('M1_PAIR_B_'+(19+23)); exit 7")])
      await until(() => [a,b].every(s => events.some(e => e.sessionId === s.sessionId && e.type === 'exit')))
      assert.ok(output.get(a.sessionId)?.includes('M1_PAIR_A_42')); assert.ok(!output.get(a.sessionId)?.includes('M1_PAIR_B_42'))
      assert.ok(output.get(b.sessionId)?.includes('M1_PAIR_B_42')); assert.ok(!output.get(b.sessionId)?.includes('M1_PAIR_A_42'))
      const exits = [a,b].map(s => events.filter(e => e.sessionId === s.sessionId && e.type === 'exit')); assert.ok(exits.every(e => e.length === 1)); assert.equal(exits[0][0].exitCode,5); assert.equal(exits[1][0].exitCode,7)
      return exits.flat()
    })
    await check('repeated create/close releases active registry, pending requests and native workers', async () => {
      const baseline = (await service.request('inspect')).active.length
      const count = () => { const n = new Uint32Array(1); assert.ok(getHandles(service.process!.handle, n)); return n[0] }
      const handlesBefore = count()
      const rounds = []
      for (let n = 0; n < 12; n++) { const s = await make(); const result = await service.request('close', ref(s)); assert.deepEqual(result.cleanup.remaining, []); const inspect = await service.request('inspect'); assert.equal(inspect.active.length, baseline); rounds.push({ round: n, peak: result.peak, active: inspect.active.length }) }
      await delay(100); const handlesAfter = count(); assert.ok(handlesAfter <= handlesBefore + 4, `handle growth ${handlesBefore}->${handlesAfter}`)
      return { rounds, handlesBefore, handlesAfter }
    })
    await check('service normal stop cleans running Shell and native worker; all retained identities exited', async () => {
      const info = await service.request('inspect'); await service.stop(); await Promise.all(handles.map(h => h.waitForExit())); assert.ok(handles.every(h => h.exited)); return { before: info, identities: handles.map(h => ({ pid: h.pid, createdAt: h.createdAt, exited: h.exited })) }
    })
    writeFileSync(join(directory, 'stress.json'), JSON.stringify({ status: 'pass', checks, events }, null, 2)); app.exit(0)
  } catch (error) {
    hold = false; queued.splice(0).forEach(ack => ack())
    writeFileSync(join(directory, 'stress.json'), JSON.stringify({ status: 'fail', error: String(error), checks, events, outputs: [...output.entries()] }, null, 2)); await service.reclaim(); app.exit(1)
  } finally { handles.forEach(h => h.dispose()) }
})
