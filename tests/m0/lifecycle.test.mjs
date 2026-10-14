import test from 'node:test'
import assert from 'node:assert/strict'
import { Lifecycle } from '../../src/services/pty/lifecycle.mjs'
test('exit is emitted once and requires an actual DWORD exit code', () => {
  const state = new Lifecycle(); state.running()
  assert.throws(() => state.complete(undefined), /INVALID_EXIT_CODE/)
  assert.equal(state.complete(259), true) // 259 can be a real exit code for a signaled handle.
  assert.equal(state.complete(259), false)
  assert.equal(state.state, 'exited')
})
test('failed native worker remains failed after confirmed process cleanup', () => {
  const state = new Lifecycle(); state.running(); state.fault(); state.beginClose()
  assert.equal(state.complete(1), true)
  assert.equal(state.state, 'failed')
})
test('close is idempotent and exited sessions cannot restart', () => {
  const state = new Lifecycle(); state.running(); state.beginClose(); state.beginClose()
  assert.equal(state.state, 'closing'); assert.equal(state.complete(0), true)
  assert.throws(() => state.running(), /INVALID_STATE/)
  state.beginClose(); assert.equal(state.state, 'exited')
})
