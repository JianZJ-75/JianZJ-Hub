import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const root = fileURLToPath(new URL('../', import.meta.url))

// Explicit adoption list: never replace this with prettier --write/check .
export const formatFiles = [
  'CONTRIBUTING.md',
  'docs/CODE_STYLE.md',
  'package.json',
  '.prettierrc.json',
  'eslint.config.mjs',
  'scripts/check.mjs',
  'tests/tooling/check.test.mjs',
  'tests/tooling/policy.test.mjs',
]

function testFiles(directory) {
  const files = readdirSync(resolve(root, directory))
    .filter((name) => name.endsWith('.test.mjs'))
    .sort()
    .map((name) => `${directory}/${name}`)
  if (!files.length) throw new Error(`NO_TEST_FILES: ${directory}`)
  return files
}

export function plan(target = 'check') {
  const tasks = {
    lint: () => [
      'node_modules/eslint/bin/eslint.js',
      'src',
      'scripts',
      'tests',
      'eslint.config.mjs',
      'electron.vite.config.ts',
      'electron.vite.m1.config.ts',
      '--max-warnings=0',
    ],
    'format:check': () => ['node_modules/prettier/bin/prettier.cjs', '--check', ...formatFiles],
    'test:tooling': () => ['--test', ...testFiles('tests/tooling')],
    typecheck: () => ['node_modules/typescript/bin/tsc', '--noEmit'],
    test: () => ['--test', ...testFiles('tests/m0')],
    'm1:test': () => ['--test', ...testFiles('tests/m1')],
  }
  const names = target === 'check' ? Object.keys(tasks) : [target]
  return names.map((name) => {
    if (!Object.hasOwn(tasks, name)) throw new Error(`UNKNOWN_CHECK: ${name}`)
    return { name, args: tasks[name]() }
  })
}

export function runSteps(
  steps,
  { spawn = spawnSync, stdout = process.stdout, stderr = process.stderr } = {},
) {
  for (const { name, args } of steps) {
    stdout.write(`\n> ${name}\n`)
    let result
    try {
      result = spawn(process.execPath, args, { cwd: root, stdio: 'inherit', shell: false })
    } catch (error) {
      stderr.write(`${name}: ${error.message}\n`)
      return 1
    }
    if (result.error || result.status !== 0) {
      stderr.write(
        `${name}: ${result.error?.message || `exit=${result.status}, signal=${result.signal || 'none'}`}\n`,
      )
      return Number.isInteger(result.status) && result.status > 0 && result.status < 256
        ? result.status
        : 1
    }
  }
  return 0
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length > 3) throw new Error('Expected at most one check name')
    process.exitCode = runSteps(plan(process.argv[2]))
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
