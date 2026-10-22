import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ESLint } from 'eslint'
import * as prettier from 'prettier'
import { root } from '../../scripts/check.mjs'

const eslint = new ESLint({ cwd: root })
const evidence = ['docs/m0/audit-evidence', 'docs/m0/evidence', 'docs/m1/evidence']

test('JS correctness rules reject bugs while Node, CJS and browser scopes stay separate', async () => {
  const [bad] = await eslint.lintText('const item = 1; item = 2;\n', {
    filePath: 'scripts/fixture.mjs',
  })
  assert.ok(bad.messages.some((message) => message.ruleId === 'no-const-assign'))
  const [node] = await eslint.lintText('console.log(process.pid)\n', {
    filePath: 'scripts/fixture.mjs',
  })
  assert.equal(node.errorCount, 0)
  const [cjs] = await eslint.lintText('module.exports = require("node:fs")\n', {
    filePath: 'scripts/fixture.cjs',
  })
  assert.equal(cjs.errorCount, 0)
  const [browser] = await eslint.lintText('document.title = "fixture"; process.exit(0)\n', {
    filePath: 'src/renderer/fixture.mjs',
  })
  assert.ok(
    browser.messages.some(
      (message) => message.ruleId === 'no-undef' && /process/.test(message.message),
    ),
  )
})

test('TS/TSX parses without changing TypeScript and renderer cannot import Node capabilities', async () => {
  const [typed] = await eslint.lintText(
    'interface Item { value: number }; const item: Item = { value: 1 }; const element = <div>{item.value}</div>\n',
    {
      filePath: 'src/renderer/fixture.tsx',
    },
  )
  assert.equal(typed.errorCount, 0, JSON.stringify(typed.messages))
  const [generic] = await eslint.lintText('const identity = <T = unknown>(value: T): T => value', {
    filePath: 'tests/m1/fixture.ts',
  })
  assert.equal(generic.errorCount, 0, JSON.stringify(generic.messages))
  const [bad] = await eslint.lintText('const item: number = 1; item = 2\n', {
    filePath: 'src/fixture.ts',
  })
  assert.ok(bad.messages.some((message) => message.ruleId === 'no-const-assign'))
  for (const name of ['node:fs', 'fs', 'electron', 'node-pty']) {
    const [result] = await eslint.lintText(`import value from '${name}'\n`, {
      filePath: 'src/renderer/fixture.tsx',
    })
    assert.ok(
      result.messages.some((message) => message.ruleId === 'no-restricted-imports'),
      name,
    )
  }
  const [shared] = await eslint.lintText(
    "import { readFileSync } from 'node:fs'; console.log(readFileSync)\n",
    {
      filePath: 'src/shared/fixture.mjs',
    },
  )
  assert.equal(shared.errorCount, 0)
})

test('evidence, generated assets and old designs are excluded by both tools', async () => {
  for (const directory of [
    ...evidence,
    'out',
    'release',
    'dist',
    '.m0-scratch',
    '.m1-scratch',
    'node_modules',
    'prototypes',
    'docs/research',
  ]) {
    const file = join(root, directory, 'fixture.mjs')
    assert.equal(await eslint.isPathIgnored(file), true, directory)
    const info = await prettier.getFileInfo(file, { ignorePath: join(root, '.prettierignore') })
    assert.equal(info.ignored, true, directory)
  }
  const info = await prettier.getFileInfo(join(root, 'docs/CODE_STYLE.md'), {
    ignorePath: join(root, '.prettierignore'),
  })
  assert.equal(info.ignored, false)
})

test('EditorConfig unsets every source rewrite setting for each evidence directory', () => {
  const config = readFileSync(join(root, '.editorconfig'), 'utf8')
  for (const directory of evidence) {
    const section = config.split(`[${directory}/**]`)[1]?.split('\n[')[0]
    assert.ok(section, directory)
    for (const key of [
      'charset',
      'indent_style',
      'indent_size',
      'end_of_line',
      'insert_final_newline',
      'trim_trailing_whitespace',
    ]) {
      assert.match(section, new RegExp(`^${key} = unset$`, 'm'))
    }
  }
})

test('formatter check rejects an isolated unformatted file and never writes it', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'jianzj format '))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const file = join(directory, 'fixture.mjs')
  const source = 'const fixture={value:"test"};\r\n'
  writeFileSync(file, source)
  const args = [
    join(root, 'node_modules/prettier/bin/prettier.cjs'),
    '--config',
    join(root, '.prettierrc.json'),
    '--check',
    file,
  ]
  const bad = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8' })
  assert.equal(bad.status, 1, bad.stderr)
  assert.equal(readFileSync(file, 'utf8'), source)
  const config = await prettier.resolveConfig(join(root, '.prettierrc.json'))
  const formatted = await prettier.format(source, { ...config, filepath: file })
  assert.ok(!formatted.includes('\r'))
  writeFileSync(file, formatted)
  const good = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8' })
  assert.equal(good.status, 0, good.stderr)
})

test('lint CLI rejects invalid input with a nonzero status', () => {
  const result = spawnSync(
    process.execPath,
    [
      join(root, 'node_modules/eslint/bin/eslint.js'),
      '--stdin',
      '--stdin-filename',
      'scripts/fixture.mjs',
    ],
    { cwd: root, input: 'const fixture = 1; fixture = 2', encoding: 'utf8' },
  )
  assert.equal(result.status, 1, result.stderr)
  assert.match(result.stdout, /no-const-assign/)
})
