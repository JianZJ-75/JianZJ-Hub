import { statSync, writeFileSync, unlinkSync } from 'node:fs'
import { join, resolve, win32 } from 'node:path'
import { randomUUID } from 'node:crypto'
import { shellEnvironment } from './cli-environment.mjs'
import { utf8Locale } from './utf8-locale.mjs'
const file = (p: string) => { try { return statSync(p).isFile() } catch { return false } }
export function gitBash(source: NodeJS.ProcessEnv = process.env) {
  const paths = String(source.Path || source.PATH || '').split(';').map(p => p.replace(/^"(.*)"$/, '$1'))
  const roots = [join(source.ProgramFiles || 'C:/Program Files', 'Git'), ...paths.filter(p => win32.isAbsolute(p) && /[\\/](cmd|bin|mingw64[\\/]bin)[\\/]?$/i.test(p)).map(p => /mingw64[\\/]bin$/i.test(p) ? resolve(p, '../..') : resolve(p, '..'))]
  for (const root of roots) { const executable = join(root, 'bin/bash.exe'); if (file(executable) && file(join(root, 'usr/bin/cygpath.exe'))) return { id: 'git-bash', label: 'Git Bash', executable, root } }
  throw new Error('GIT_BASH_NOT_FOUND: 未找到已有 Git for Windows Bash；不会静默改用 PowerShell 或下载安装。')
}
export function shellLaunch(id: unknown, cwd: string, historyDir: string, source: NodeJS.ProcessEnv = process.env) {
  const { env, claudeExecutable } = shellEnvironment(source), marker = 'WS_READY_' + randomUUID()
  delete env.ELECTRON_RUN_AS_NODE
  env.TERM = 'xterm-256color'; env.COLORTERM = 'truecolor'; env.TERM_PROGRAM = 'JianZJ-Hub'; env.TERM_PROGRAM_VERSION = '0.1.0'
  if (id === undefined || id === 'git-bash') {
    const shell = gitBash(source), pathKey = Object.keys(env).find(k => k.toLowerCase() === 'path') || 'Path'
    env[pathKey] = [env[pathKey], join(shell.root, 'usr/bin'), join(shell.root, 'mingw64/bin')].filter(Boolean).join(';')
    // Ensure multibyte (CJK) input is decoded by readline, and never override a
    // UTF-8 locale the environment already establishes.
    const locale = utf8Locale(env)
    if (locale) env.LC_ALL = locale
    // Ignore inherited startup injection; read no personal rc/profile or history.
    delete env.BASH_ENV; delete env.ENV; delete env.PROMPT_COMMAND
    const rcfile = join(historyDir, 'bash-' + randomUUID() + '.rc')
    writeFileSync(rcfile, "HISTFILE=/dev/null\nHISTSIZE=2000\nHISTCONTROL=ignoredups\nPROMPT_COMMAND='printf \"\\033]7;file://%s\\007\" \"$PWD\"'\nPS1='\\u:\\w\\$ '\nprintf '\\033]1337;" + marker + "\\007'\n", { flag: 'wx' })
    return { ...shell, args: ['--noprofile', '--rcfile', rcfile, '-i'], env, marker, claudeExecutable, dispose() { try { unlinkSync(rcfile) } catch {} } }
  }
  if (id !== 'powershell') throw new Error('INVALID_SHELL_PROFILE')
  const executable = join(source.SystemRoot || 'C:/Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe')
  const history = join(historyDir, 'history-' + randomUUID() + '.txt').replaceAll("'", "''")
  const startup = `$ErrorActionPreference='Stop'; Import-Module PSReadLine; Set-PSReadLineOption -HistorySaveStyle SaveNothing -HistorySavePath '${history}'; [Console]::Write([char]27+']1337;${marker}'+[char]7); $ErrorActionPreference='Continue'`
  return { id: 'powershell', label: 'PowerShell（回归）', executable, args: ['-NoLogo', '-NoProfile', '-NoExit', '-Command', startup], env, marker, claudeExecutable, dispose() {} }
}
