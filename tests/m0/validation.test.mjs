import test from 'node:test'
import assert from 'node:assert/strict'
import { validateSessionId, validateSize, validateWrite } from '../../src/shared/validation.mjs'
test('size rejects zero, fractional, NaN, string and excessive values', () => {
  validateSize(80, 24)
  for (const v of [0, -1, 1.1, NaN, '80', 501]) assert.throws(() => validateSize(v, 24))
})
test('session ID is scoped, not an arbitrary process identifier', () => {
  validateSessionId('m0-12345678-1234-1234-1234-123456789abc')
  for (const v of [1234, '', '../../file', 'shell']) assert.throws(() => validateSessionId(v))
})
test('write preserves control input but limits UTF-8 byte size', () => {
  validateWrite('\x03\x1b[A中文\r')
  assert.throws(() => validateWrite('中'.repeat(22000)))
  assert.throws(() => validateWrite({ command: 'exec' }))
})
