import { statSync } from 'node:fs'
import { win32 } from 'node:path'
// User-approved application-only precedence. Never mutate process.env, profiles,
// execution policy or the typed input; never run a CLI while detecting its path.
export function shellEnvironment(source, platform = process.platform) {
  const env = { ...source }, pathKey = Object.keys(env).find(k => k.toLowerCase() === 'path') || 'Path'
  if (platform !== 'win32') return { env, claudeExecutable: null }
  const entries = String(env[pathKey] || '').split(';')
  for (const entry of entries) {
    const directory = entry.trim().replace(/^"(.*)"$/, '$1')
    if (!win32.isAbsolute(directory)) continue
    const executable = win32.join(directory, 'node_modules/@anthropic-ai/claude-code/bin/claude.exe')
    try {
      if (!statSync(executable).isFile()) continue
      const bin = win32.dirname(executable)
      env[pathKey] = [bin, ...entries.filter(p => p.replace(/^"(.*)"$/, '$1').toLowerCase() !== bin.toLowerCase())].join(';')
      return { env, claudeExecutable: executable }
    } catch { /* An absent or inaccessible installation leaves resolution alone. */ }
  }
  return { env, claudeExecutable: null }
}
