import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { formatFiles, plan, root, runSteps } from '../../scripts/check.mjs'

const quiet = { write() {} }

function options(spawn) {
  return { spawn, stdout: quiet, stderr: quiet }
}

test('aggregate checks have a deterministic order and use local Node tools', () => {
  const steps = plan()
  assert.deepEqual(
    steps.map((step) => step.name),
    ['lint', 'format:check', 'test:tooling', 'typecheck', 'test', 'm1:test'],
  )
  const calls = []
  assert.equal(
    runSteps(
      steps,
      options((...args) => {
        calls.push(args)
        return { status: 0 }
      }),
    ),
    0,
  )
  assert.equal(calls.length, steps.length)
  for (const [index, [executable, args, settings]] of calls.entries()) {
    assert.equal(executable, process.execPath)
    assert.deepEqual(args, steps[index].args)
    assert.equal(settings.cwd, root)
    assert.equal(settings.shell, false)
    assert.equal(settings.stdio, 'inherit')
  }
})

test('nonzero status, signals, startup errors and thrown errors stop subsequent checks', () => {
  const steps = [
    { name: 'first', args: [] },
    { name: 'must-not-run', args: [] },
  ]
  for (const [outcome, expected] of [
    [{ status: 23 }, 23],
    [{ status: null, signal: 'SIGTERM' }, 1],
    [{ status: null, error: new Error('ENOENT') }, 1],
    [new Error('spawn failed'), 1],
  ]) {
    let calls = 0
    const code = runSteps(
      steps,
      options(() => {
        calls++
        if (outcome instanceof Error) throw outcome
        return outcome
      }),
    )
    assert.equal(code, expected)
    assert.equal(calls, 1)
  }
})

test('test paths are explicitly expanded and formatting uses an existing, unique allowlist', () => {
  for (const name of ['test:tooling', 'test', 'm1:test']) {
    const [step] = plan(name)
    assert.equal(step.args[0], '--test')
    assert.ok(step.args.length > 1)
    assert.ok(
      step.args.slice(1).every((file) => !file.includes('*') && existsSync(join(root, file))),
    )
  }
  assert.equal(new Set(formatFiles).size, formatFiles.length)
  for (const file of formatFiles) {
    assert.ok(!isAbsolute(file) && !file.includes('..') && !file.includes('*'))
    assert.ok(existsSync(join(root, file)), file)
    assert.ok(!/evidence|^(out|release|node_modules|prototypes)\//.test(file))
  }
  assert.throws(() => plan('toString'), /UNKNOWN_CHECK/)
})

test('real child failure propagates without shell quoting or running the next step', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'jianzj tooling '))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const file = join(directory, 'only owned fixture.txt')
  const code = runSteps(
    [
      {
        name: 'fixture',
        args: [
          '-e',
          "require('node:fs').writeFileSync(process.argv[1], 'fixture'); process.exit(23)",
          file,
        ],
      },
      {
        name: 'must-not-run',
        args: ['-e', "require('node:fs').writeFileSync(process.argv[1], 'overwritten')", file],
      },
    ],
    options(spawnSync),
  )
  assert.equal(code, 23)
  assert.equal(readFileSync(file, 'utf8'), 'fixture')
})

test('unknown CLI target fails without invoking tools, even outside the project cwd', () => {
  const result = spawnSync(process.execPath, [join(root, 'scripts/check.mjs'), 'unknown'], {
    cwd: tmpdir(),
    encoding: 'utf8',
  })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /UNKNOWN_CHECK/)
})
