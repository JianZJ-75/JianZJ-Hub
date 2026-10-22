import test from 'node:test'
import assert from 'node:assert/strict'
import { installCompositionInput } from '../../src/renderer/workstation/keyboard.mjs'
import { readFileSync } from 'node:fs'
import { transformSync } from 'esbuild'
import { runInNewContext } from 'node:vm'

// Load pinned xterm's actual helper, not a rewritten composition engine.
// Only DI decorators/imports are removed; the methods and their timers stay intact.
const source = readFileSync(new URL('../../node_modules/@xterm/xterm/src/browser/input/CompositionHelper.ts', import.meta.url), 'utf8')
  .replace(/^import .*;$/gm, '').replace(/@I\w+\s/g, '')
const code = transformSync(source, { loader: 'ts', format: 'cjs', target: 'es2022' }).code
function fixture(adapt = true) {
  const tasks = [], module = { exports: {} }, emitted = [], textarea = { value: '', selectionStart: 0, selectionEnd: 0, style: {} }
  runInNewContext(code, { module, exports: module.exports, setTimeout: fn => tasks.push(fn), C0: { DEL: '\x7f' } })
  const data = text => emitted.push(text), service = { triggerDataEvent: data }
  const helper = new module.exports.CompositionHelper(textarea, { classList: { add() {}, remove() {} } }, { buffer: { isCursorInViewport: false } }, {}, service, {})
  const state = adapt ? installCompositionInput(helper, textarea) : { start() {}, end() {}, input() {}, keydown() {} }
  const flush = () => { let n = 0; while (tasks.length) { assert.ok(++n < 100); tasks.shift()() } }
  let prefix = '', suffix = '', lastText = ''
  const begin = () => {
    prefix = textarea.value.slice(0, textarea.selectionStart); suffix = textarea.value.slice(textarea.selectionEnd)
    const native = { ...textarea }; state.start(); assert.deepEqual(textarea, native, 'adapter cannot change native value or caret')
    helper.compositionstart()
  }
  const update = text => { lastText = text; helper.compositionupdate({ data: text }); textarea.value = prefix + text + suffix; textarea.selectionStart = textarea.selectionEnd = prefix.length + text.length; state.input() }
  const start = text => { begin(); update(text); flush() }
  const end = (append = false, cancelled = false) => { helper.compositionend(); state.end({ data: cancelled ? '' : lastText }); textarea.selectionStart = textarea.selectionEnd = append ? textarea.value.length : 0 }
  const key = code => { const event = { keyCode: code }; state.keydown(event); return helper.keydown(event) }
  return { textarea, state, emitted, helper, service, data, begin, update, start, end, key, flush }
}

test('actual pinned helper reproduces old CJK suffixes and the adapter reads only new candidates', () => {
  for (const adapt of [false, true]) {
    const f = fixture(adapt)
    for (const text of ['按这个', '方案', '继续']) { f.start(text); f.end(); f.flush() }
    assert.deepEqual(f.emitted, adapt ? ['按这个', '方案', '继续'] : ['按这个', '这个', '这个'])
    assert.equal(f.textarea.value, '继续方案按这个', 'native TSF text is never cleared, reordered or replaced')
    assert.equal(f.textarea.selectionStart, 0)
    assert.equal(f.helper._coreService, f.service, 'the real input emitter is untouched')
  }
})

test('partial and full native scratch selections do not inflate the helper start position', () => {
  for (const [start, end] of [[0, 0], [0, 1], [1, 2], [0, 3]]) {
    const f = fixture(); f.start('按这个'); f.end(); f.flush()
    f.textarea.selectionStart = start; f.textarea.selectionEnd = end
    f.begin(); assert.equal(f.helper._compositionPosition.start, 3)
    f.update('方案'); f.flush(); f.end(); f.flush()
    assert.deepEqual(f.emitted, ['按这个', '方案'])
  }
})

test('equal selected replacements are new commits, but empty cancellation restores no old text', () => {
  for (const selection of [[0, 1], [0, 3]]) {
    const f = fixture(); f.start('按这个'); f.end(); f.flush()
    const [start, end] = selection, selected = f.textarea.value.slice(start, end)
    f.textarea.selectionStart = start; f.textarea.selectionEnd = end
    f.start(selected); f.end(); f.flush()
    assert.deepEqual(f.emitted, ['按这个', selected])
    f.textarea.selectionStart = start; f.textarea.selectionEnd = end
    f.begin(); f.update('cancel'); f.flush(); f.update(selected); f.flush(); f.end(false, true); f.flush()
    assert.deepEqual(f.emitted, ['按这个', selected])
    f.start('方案'); f.end(); f.flush(); assert.equal(f.emitted.at(-1), '方案')
  }
})

test('append insertion and equal repeated words remain valid, including surrogate pairs', () => {
  const f = fixture()
  for (const text of ['你好', '你好', '😃中文']) { f.start(text); f.end(true); f.flush() }
  assert.deepEqual(f.emitted, ['你好', '你好', '😃中文'])
  assert.equal(f.textarea.value, '你好你好😃中文')
})

test('protocol replies cannot acknowledge or mutate a pending composition', () => {
  for (const reply of ['\x1b[0n', '\x1b[1;1R', '\x1b]10;rgb:ffff/ffff/ffff\x1b\\']) {
    const f = fixture(); f.start('按这个'); f.end(); f.data(reply)
    assert.equal(f.textarea.value, '按这个')
    f.flush(); assert.deepEqual(f.emitted, [reply, '按这个'])
    f.start('方案'); f.end(); f.flush(); assert.deepEqual(f.emitted, [reply, '按这个', '方案'])
  }
})

test('empty commit and pending 229 punctuation survive replies and unrelated input', () => {
  const f = fixture(); f.start(''); f.end(); f.flush()
  assert.equal(f.key(229), false); f.textarea.value = '。'; f.state.input()
  assert.equal(f.key(38), true)
  f.data('\x1b[0n'); f.data('\x1b[A', true); f.data('pasted', true)
  assert.equal(f.textarea.value, '。')
  f.flush(); assert.deepEqual(f.emitted, ['\x1b[0n', '\x1b[A', 'pasted', '。'])
  f.start('方案'); f.end(); f.flush(); assert.equal(f.emitted.at(-1), '方案')
})

test('multiple queued 229 reads cannot turn scratch handling into a spurious DEL', () => {
  const f = fixture(); f.start(''); f.end(); f.flush()
  f.key(229); f.textarea.value = '。'; f.state.input(); f.key(229); f.flush()
  assert.deepEqual(f.emitted, ['。']); assert.equal(f.textarea.value, '。')
})

test('old deferred read can run during the next prepend composition without losing either word', () => {
  const f = fixture(); f.start('按这个'); f.end()
  f.begin(); f.update('方案'); f.flush()
  assert.equal(f.textarea.value, '方案按这个')
  assert.deepEqual(f.emitted, ['按这个'])
  f.end(); f.flush(); assert.deepEqual(f.emitted, ['按这个', '方案'])
  f.start('继续'); f.end(); f.flush(); assert.deepEqual(f.emitted, ['按这个', '方案', '继续'])
})

test('native Enter/blur-style textarea clearing resets the read view before new input', () => {
  const f = fixture(); f.start('按这个'); f.end(); f.flush()
  f.textarea.value = ''; f.textarea.selectionStart = f.textarea.selectionEnd = 0
  f.start('方案'); f.end(); f.flush(); assert.deepEqual(f.emitted, ['按这个', '方案'])
  assert.equal(f.textarea.value, '方案')
})
