import test from 'node:test'
import assert from 'node:assert/strict'
import { leaves, split, remove, validate, ratio, minimum } from '../../src/core/layout/tree.mjs'
import { Credit, LIMITS, object, id, generation, input, size, preferences, workspace, senderAllowed } from '../../src/shared/workstation/rules.mjs'
import { readFileSync } from 'node:fs'
const leaf = paneId => ({ type: 'leaf', paneId })
test('split targets current leaf; nested close preserves all unrelated identities', () => {
  let tree = split(leaf('a'), 'a', 'b', 'right'); tree = split(tree, 'b', 'c', 'down')
  assert.deepEqual(leaves(tree), ['a', 'b', 'c']); assert.equal(tree.first.paneId, 'a'); validate(tree)
  const after = remove(tree, 'b'); assert.deepEqual(leaves(after), ['a', 'c']); assert.equal(after.first, tree.first)
  assert.deepEqual(remove(remove(after, 'a'), 'c'), null)
})
test('random deterministic split/close sequences have no duplicate, missing or unary leaves', () => {
  let tree = leaf('p0'), serial = 1, seed = 42
  for (let n = 0; n < 1000; n++) { seed = (seed * 1664525 + 1013904223) >>> 0; const ids = leaves(tree); if (ids.length < 2 || seed % 3) tree = split(tree, ids[seed % ids.length], 'p' + serial++, seed & 1 ? 'right' : 'down'); else tree = remove(tree, ids[seed % ids.length]); validate(tree) }
  assert.ok(leaves(tree).length > 6)
})
test('recursive minimum bounds drag ratio; insufficient span leaves layout unchanged', () => {
  const tree = split(split(leaf('a'), 'a', 'b', 'right'), 'b', 'c', 'down')
  assert.deepEqual(minimum(tree), { width: 450, height: 330 })
  assert.equal(ratio(tree, tree.id, 0, 900).ratio, 220 / 890)
  assert.equal(ratio(tree, tree.id, 1, 900).ratio, 1 - 220 / 890)
  assert.equal(ratio(tree, tree.id, .2, 300), tree)
})
test('invalid splits, duplicates, ratios and axes are rejected', () => {
  assert.throws(() => split(leaf('a'), 'missing', 'b', 'right')); assert.throws(() => split(leaf('a'), 'a', 'a', 'down')); assert.throws(() => split(leaf('a'), 'a', 'b', 'other'))
  assert.throws(() => validate({ type: 'split', axis: 'right', ratio: 0, first: leaf('a'), second: leaf('b') })); assert.throws(() => validate({ type: 'split', axis: 'right', ratio: .5, first: leaf('a'), second: leaf('a') }))
})
test('credit has a hard byte bound and strictly scoped cumulative acknowledgements', () => {
  const c = new Credit(); for (let n = 0; n < LIMITS.window / LIMITS.chunk; n++) c.add(LIMITS.chunk)
  assert.equal(c.bytes, LIMITS.window); assert.throws(() => c.add(1)); assert.throws(() => c.ack(c.sent + 1)); assert.throws(() => c.ack(-1)); assert.throws(() => c.ack('1'))
  c.ack(4); assert.equal(c.bytes, LIMITS.window / 2); c.ack(4); assert.equal(c.bytes, LIMITS.window / 2); assert.throws(() => c.ack(3)); c.ack(c.sent); assert.equal(c.bytes, 0); assert.equal(c.entries.size, 0)
})
test('dimensions, UTF-8 input and generation reject malformed and excessive values', () => {
  for (const v of [0, -1, '80', NaN, Infinity, 1.2, 501]) assert.throws(() => size(v, 24))
  size(80, 24); input('\x03\x1b[A中文\r'); assert.throws(() => input('中'.repeat(22000))); assert.throws(() => input({ command: 'exec' })); for (const v of [0, -1, '1', NaN]) assert.throws(() => generation(v))
})
test('schemas do not accept extra fields, arbitrary paths-as-identifiers or invalid preferences', () => {
  assert.throws(() => object({ exec: 'anything' }, [])); assert.throws(() => object(null, [])); assert.throws(() => id('../../file'))
  preferences({ theme: 'system', fontSize: 14, density: 'comfortable' }); assert.throws(() => preferences({ theme: 'system', fontSize: 19, density: 'comfortable' })); assert.throws(() => preferences({ theme: 'dark', fontSize: 14, density: 'compact', exec: 'x' }))
  workspace({ id: 'workspace-12345678-1234-1234-1234-123456789abc', name: '中文项目', cwd: 'D:/test', layout: 'single' }); assert.throws(() => workspace({ id: 'workspace-12345678-1234-1234-1234-123456789abc', name: 'x', cwd: 'D:/test', layout: 'restore' }))
})
test('production sender must be exactly the owning WebContents, mainFrame and app URL', () => {
  const frame = { url: 'file:///app/index.html' }, contents = { mainFrame: frame, isDestroyed: () => false }, event = { sender: contents, senderFrame: frame }
  assert.equal(senderAllowed(event, contents, frame.url), true)
  for (const e of [{ ...event, sender: {} }, { ...event, senderFrame: { ...frame } }, { ...event, senderFrame: { url: 'file:///evil.html' } }]) assert.equal(senderAllowed(e, contents, frame.url), false)
  assert.equal(senderAllowed(event, contents, 'file:///evil.html'), false)
})
const { palettes, resolved, terminalTheme } = await import('../../src/renderer/workstation/palette.mjs')
for (const [mode, systemDark, expected] of [['light', false, 'light'], ['dark', true, 'dark'], ['system', false, 'light'], ['system', true, 'dark']]) test(`theme ${mode} / OS dark=${systemDark} resolves page and xterm from same palette`, () => { const actual = resolved(mode, systemDark), p = palettes[actual]; assert.equal(actual, expected); assert.equal(terminalTheme(p).background, p.terminal); assert.equal(terminalTheme(p).foreground, p.text); assert.equal(terminalTheme(p).cursor, p.accent) })
test('runtime system toggle changes system resolution, not explicit theme', () => { assert.notEqual(resolved('system', false), resolved('system', true)); assert.equal(resolved('light', true), 'light'); assert.equal(resolved('dark', false), 'dark') })

const { isImeKey } = await import('../../src/renderer/workstation/keyboard.mjs')
test('IME candidate and commit keys bypass product shortcuts while ordinary keys remain eligible', () => {
  assert.equal(isImeKey({ isComposing: true, keyCode: 49 }), true)
  assert.equal(isImeKey({ isComposing: false, keyCode: 229 }), true)
  assert.equal(isImeKey({ isComposing: false, which: 229 }), true)
  assert.equal(isImeKey({ isComposing: false, keyCode: 49, which: 49 }, true), true)
  assert.equal(isImeKey({ isComposing: false, keyCode: 49, which: 49 }), false)
  assert.equal(isImeKey({ isComposing: false, keyCode: 13, which: 13 }), false)
})

// Bash readline renders CJK input as octal \nnn unless a UTF-8 locale governs it.
// A packaged app launched from Explorer inherits no LANG/LC_CTYPE, so the launch
// environment must supply one. Guards the fix in src/adapters/windows/workstation/shell.ts.
const { utf8Locale } = await import('../../src/adapters/windows/workstation/utf8-locale.mjs')
test('locale-free Git Bash env is given a UTF-8 ctype; an existing UTF-8 locale is preserved', () => {
  assert.equal(utf8Locale({}), 'C.UTF-8')
  assert.equal(utf8Locale({ LANG: 'C' }), 'C.UTF-8')
  assert.equal(utf8Locale({ LC_CTYPE: 'C' }), 'C.UTF-8')
  assert.equal(utf8Locale({ LC_ALL: 'C' }), 'C.UTF-8')          // LC_ALL is the winner; a non-UTF-8 LC_ALL must be upgraded
  assert.equal(utf8Locale({ LANG: 'zh_CN.UTF-8' }), null)
  assert.equal(utf8Locale({ LC_CTYPE: 'en_US.UTF-8' }), null)
  assert.equal(utf8Locale({ LC_ALL: 'C.UTF-8' }), null)
})
