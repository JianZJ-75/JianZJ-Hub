import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import type { Preferences } from '../../shared/workstation-protocol'
import { palettes, baseTokens, resolved, terminalTheme } from './palette.mjs'
import { lineGeometry, minimumPane, ResizeQueue } from './geometry.mjs'
import { paintBlockRows } from './block-glyphs.mjs'
import { isImeKey } from './keyboard.mjs'
export interface LivePane {
  paneId: string; workspaceId: string; name: string; cwd: string; sessionId?: string; generation?: number
  state: string; shellLabel: string; reclaimed?: boolean; exitCode?: number; error?: string; claudeExecutable?: string | null
  host: HTMLDivElement; term: Terminal; fit: FitAddon; seq: number; dimensions: string; initialSize?: { cols: number; rows: number }
  resize: ResizeQueue; disposed: boolean; inputBytes: number; inputChain: Promise<void>; cwdEscape: string
}
const bridge = window.workstation
function shellCwd(value: string) {
  let path = value
  try { path = decodeURIComponent(path) } catch {}
  const drive = /^\/([a-zA-Z])(?:\/|$)/.exec(path)
  return drive ? drive[1].toUpperCase() + ':' + path.slice(2).replaceAll('/', '\\') : path
}
export class Terminals {
  panes = new Map<string, LivePane>(); preferences: Preferences = { theme: 'system', fontSize: 14, density: 'comfortable' }; dark = false
  change: () => void = () => {}; focusChanged: (paneId: string) => void = () => {}; shortcut: (e: KeyboardEvent) => boolean = () => false
  private unsubscribe: () => void; private notifying = false
  private refit = () => { for (const pane of this.panes.values()) this.fit(pane) }
  constructor() {
    this.unsubscribe = bridge.onTerminal(e => this.receive(e))
    document.fonts.addEventListener('loadingdone', this.refit); window.addEventListener('resize', this.refit)
  }
  private notify() {
    if (this.notifying) return
    this.notifying = true; queueMicrotask(() => { this.notifying = false; this.change() })
  }
  make(paneId: string, workspaceId: string, name: string, cwd = '') {
    const host = document.createElement('div'); host.className = 'xterm-host'; host.dataset.terminal = paneId
    const term = new Terminal({ fontSize: this.preferences.fontSize, fontFamily: baseTokens.mono, lineHeight: 1, letterSpacing: .05, disableStdin: true, scrollback: 4000, allowProposedApi: false, cursorBlink: true, theme: terminalTheme(palettes[resolved(this.preferences.theme, this.dark)]) })
    const fit = new FitAddon(); term.loadAddon(fit); term.open(host)
    const pane = { paneId, workspaceId, name, cwd, shellLabel: 'Git Bash', state: 'creating', host, term, fit, seq: 0, dimensions: '', disposed: false, inputBytes: 0, inputChain: Promise.resolve(), cwdEscape: '' } as LivePane
    let composing = false
    host.addEventListener('compositionstart', () => { composing = true })
    host.addEventListener('compositionend', () => { composing = false })
    host.addEventListener('compositioncancel', () => { composing = false })
    pane.resize = new ResizeQueue(async (size: { cols: number; rows: number }) => {
      if (pane.disposed || pane.state !== 'running' || !pane.sessionId) throw new Error('SESSION_NOT_RUNNING')
      await bridge.resize({ sessionId: pane.sessionId, generation: pane.generation!, ...size })
    }, () => {
      pane.dimensions = pane.resize.applied ? `${pane.resize.applied.cols}x${pane.resize.applied.rows}` : ''
      if (!pane.disposed) this.notify()
    })
    this.panes.set(paneId, pane)
    term.onData(data => { void this.write(pane, data) })
    term.onRender(range => paintBlockRows(term.element, term.cols, range))
    host.addEventListener('focusin', () => this.focusChanged(paneId))
    host.addEventListener('paste', e => {
      const text = e.clipboardData?.getData('text/plain')
      if (typeof text !== 'string') return
      e.preventDefault(); term.paste(text)
    })
    term.attachCustomKeyEventHandler(e => {
      if (e.type !== 'keydown') return true
      // IME keys belong to xterm's CompositionHelper: it returns false for the
      // keys the IME consumed (229) and finalizes the composition for the key
      // that commits it (Enter, candidate digits). Returning false for every
      // composing key here skips that helper, so the commit key is swallowed —
      // the committed text is never flushed and Enter never reaches the shell.
      if (!isImeKey(e, composing) && this.shortcut(e)) return false
      if (e.ctrlKey && e.key.toLowerCase() === 'c' && term.hasSelection()) { e.preventDefault(); void bridge.clipboardWrite(term.getSelection()).catch(error => this.error(pane, error)); return false }
      // Paste: both Ctrl+V and Ctrl+Shift+V. The app documents them as paste; leaving
      // Ctrl+V to xterm turns it into readline's quoted-insert (\x16), which never pastes.
      if (e.ctrlKey && !e.altKey && !e.metaKey && e.key.toLowerCase() === 'v') { e.preventDefault(); void bridge.clipboardRead().then(text => { if (typeof text !== 'string') throw new Error('INVALID_CLIPBOARD_TEXT'); term.paste(text) }).catch(error => this.error(pane, error)); return false }
      return true
    })
    return pane
  }
  private async firstSize(pane: LivePane) {
    await document.fonts.ready
    return new Promise<{ cols: number; rows: number }>((resolve, reject) => {
      const deadline = Date.now() + 15000
      const measure = () => {
        if (pane.disposed) { reject(new Error('PANE_DISPOSED_DURING_CREATE')); return }
        const size = this.fit(pane)
        if (size) { resolve(size); return }
        if (Date.now() > deadline) { reject(new Error('等待有效终端布局超时，未启动 Shell。请显示窗口后重试。')); return }
        setTimeout(measure, 30)
      }
      measure()
    })
  }
  async start(pane: LivePane) {
    try {
      const size = await this.firstSize(pane); pane.initialSize = size
      const info = await bridge.create({ requestId: 'request-' + crypto.randomUUID(), workspaceId: pane.workspaceId, paneId: pane.paneId, ...size })
      if (pane.disposed) throw new Error('PANE_DISPOSED_DURING_CREATE')
      pane.sessionId = info.sessionId; pane.generation = info.generation; pane.claudeExecutable = info.claudeExecutable; pane.shellLabel = info.shellLabel
      if (pane.state === 'creating') { pane.state = 'running'; pane.term.options.disableStdin = false; pane.resize.initialize(size) }
      this.fit(pane); this.notify(); return info
    } catch (error) { this.error(pane, error); throw error }
  }
  private error(pane: LivePane, error: unknown) { if (!pane.disposed) { pane.error = String(error); this.notify() } }
  async write(pane: LivePane, data: string) {
    if (pane.state !== 'running' || !pane.sessionId) return
    const bytes = new TextEncoder().encode(data).length
    if (bytes > 65536 || pane.inputBytes + bytes > 65536) { this.error(pane, '输入过大或终端忙；未发送本次输入，请缩小粘贴内容。'); return }
    pane.inputBytes += bytes
    pane.inputChain = pane.inputChain.then(() => { if (pane.state !== 'running' || pane.disposed) return; return bridge.write({ sessionId: pane.sessionId!, generation: pane.generation!, data }) }).catch(error => this.error(pane, error)).finally(() => { pane.inputBytes -= bytes })
    return pane.inputChain
  }
  private updateCwd(pane: LivePane, data: string) {
    const text = pane.cwdEscape + data
    const re = /\x1b\]7;file:\/\/([^\x07\x1b]*)(?:\x07|\x1b\\)/g
    let match: RegExpExecArray | null, changed = false
    while ((match = re.exec(text))) {
      const next = shellCwd(match[1])
      if (next && next !== pane.cwd) { pane.cwd = next; changed = true }
    }
    pane.cwdEscape = text.slice(-512)
    if (changed) this.notify()
  }
  private receive(event: any) {
    const pane = this.panes.get(event.paneId)
    if (!pane || pane.disposed || event.workspaceId !== pane.workspaceId || event.generation !== 1) return
    if (pane.sessionId && (event.sessionId !== pane.sessionId || event.generation !== pane.generation)) return
    pane.sessionId = event.sessionId; pane.generation = event.generation
    if (event.type === 'data') {
      if (event.seq !== pane.seq + 1) { this.error(pane, 'OUTPUT_SEQUENCE_ERROR'); return }
      pane.seq = event.seq
      this.updateCwd(pane, event.data)
      pane.term.write(event.data, () => { if (!pane.disposed) void bridge.ack({ sessionId: event.sessionId, generation: event.generation, seq: event.seq }).catch(error => this.error(pane, error)) })
    } else {
      pane.state = event.type === 'exit' ? 'exited' : 'failed'; pane.exitCode = event.exitCode; pane.error = event.error
      pane.reclaimed = Array.isArray(event.cleanup?.remaining) && event.cleanup.remaining.length === 0
      pane.resize.dispose(); pane.term.options.disableStdin = true; this.notify()
    }
  }
  fit(pane: LivePane): { cols: number; rows: number } | undefined {
    if (pane.disposed || !pane.host.isConnected || !pane.host.getClientRects().length || pane.host.clientWidth < 20 || pane.host.clientHeight < 20) return
    // One compatibility seam for pinned xterm 6 metrics, also used by FitAddon.
    const core = (pane.term as any)._core
    core._charSizeService?.measure()
    const grid = lineGeometry(this.preferences.fontSize, this.preferences.density, window.devicePixelRatio, core._renderService?.dimensions.device.char.height)
    if (!grid) return
    if (Math.abs(pane.term.options.lineHeight! - grid.lineHeight) > .00001) pane.term.options.lineHeight = grid.lineHeight
    const proposed = pane.fit.proposeDimensions()
    if (!proposed || !Number.isFinite(proposed.cols) || !Number.isFinite(proposed.rows) || proposed.cols < 2 || proposed.rows < 2) return
    const cols = Math.min(500, proposed.cols), rows = Math.min(500, proposed.rows)
    if (pane.term.cols !== cols || pane.term.rows !== rows) {
      // Use the addon's full-render resize path, not just its size calculator.
      pane.fit.fit()
      if (pane.term.cols > 500 || pane.term.rows > 500) pane.term.resize(cols, rows)
      this.notify()
    }
    const actual = { cols: pane.term.cols, rows: pane.term.rows }
    if (pane.state === 'running' && pane.sessionId) pane.resize.request(actual)
    return actual
  }
  minimum(paneId?: string | null) {
    const pane = paneId ? this.panes.get(paneId) : undefined
    const cell = pane ? (pane.term as any)._core?._renderService?.dimensions.css.cell.width : undefined
    return minimumPane(this.preferences.fontSize, this.preferences.density, cell || undefined)
  }
  appearance(prefs: Preferences, dark: boolean) {
    this.preferences = prefs; this.dark = dark
    const palette = palettes[resolved(prefs.theme, dark)]
    for (const pane of this.panes.values()) {
      pane.term.options.theme = terminalTheme(palette); pane.term.options.fontSize = prefs.fontSize
      this.fit(pane)
    }
  }
  async close(pane: LivePane) {
    if (pane.reclaimed) { this.dispose(pane.paneId); return }
    if (!pane.sessionId) throw new Error('终端仍在创建，请稍后重试')
    const previous = pane.state; pane.state = 'closing'; this.notify()
    try { const result = await bridge.close({ sessionId: pane.sessionId, generation: pane.generation! }); if (!result.outputComplete && previous !== 'failed') throw new Error('输出未完整交付；系统资源已回收，请核对失败状态后再次关闭展示。'); this.dispose(pane.paneId) }
    catch (error) { if (pane.state === 'closing') { pane.state = previous; pane.resize.retry(); this.fit(pane) } this.error(pane, error); throw error }
  }
  dispose(paneId: string) { const pane = this.panes.get(paneId); if (!pane) return; pane.disposed = true; pane.resize.dispose(); pane.term.dispose(); pane.host.remove(); this.panes.delete(paneId); this.notify() }
  destroy() { this.unsubscribe(); document.fonts.removeEventListener('loadingdone', this.refit); window.removeEventListener('resize', this.refit); for (const id of [...this.panes.keys()]) this.dispose(id) }
}
