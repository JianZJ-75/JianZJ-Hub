export function lineGeometry(fontSize, density, dpr, deviceCharHeight) {
  if (![fontSize, dpr, deviceCharHeight].every(n => Number.isFinite(n) && n > 0)) return undefined
  const targetCssHeight = fontSize * (density === 'compact' ? 1.25 : 1.35)
  const deviceHeight = Math.max(deviceCharHeight, Math.round(targetCssHeight * dpr))
  // xterm 6 DOM renderer floors deviceCharHeight * lineHeight, unlike CSS em.
  return { targetCssHeight, deviceHeight, cssHeight: deviceHeight / dpr, lineHeight: (deviceHeight + .001) / deviceCharHeight }
}
export function minimumPane(fontSize, density, cellWidth = fontSize * .55) {
  return { width: Math.max(220, Math.ceil(cellWidth * 24 + 44 + 14 + 2)), height: Math.ceil(fontSize * (density === 'compact' ? 1.25 : 1.35) * 4 + 39 + 29 + 40 + 2) }
}
const key = size => size ? `${size.cols}x${size.rows}` : ''
export class ResizeQueue {
  desired; applied; busy = false; error; disposed = false
  constructor(send, changed = () => {}) { this.send = send; this.changed = changed }
  get pending() { return this.busy || key(this.desired) !== key(this.applied) }
  initialize(size) { this.applied = { ...size }; this.desired = { ...size }; this.error = undefined; this.changed() }
  request(size) {
    if (this.disposed) return
    if (key(this.desired) === key(size)) return
    this.desired = { ...size }; this.error = undefined; this.changed(); void this.flush()
  }
  async flush() {
    if (this.busy || this.disposed) return
    this.busy = true
    try {
      while (!this.disposed && key(this.desired) !== key(this.applied)) {
        const next = { ...this.desired }; await this.send(next)
        if (this.disposed) return
        this.applied = next; this.error = undefined; this.changed()
      }
    } catch (error) { if (!this.disposed) { this.error = String(error); this.changed() } }
    finally { this.busy = false; if (!this.disposed) this.changed() }
  }
  retry() { if (!this.disposed && this.error) { this.error = undefined; void this.flush() } }
  dispose() { this.disposed = true }
}
