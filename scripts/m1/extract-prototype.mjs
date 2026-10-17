import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
const source = readFileSync('prototypes/comfort-redesign/workstation-comfort.html', 'utf8')
if (createHash('sha256').update(source).digest('hex') !== '1033c2dab321312f09ac220450d2fea7fbbf0f905ade18c450a5ed1281e6917a') throw new Error('PROTOTYPE_HASH_MISMATCH')
const css = source.split('<style>')[1].split('</style>')[0]
const parse = selector => Object.fromEntries([...css.match(selector)[1].matchAll(/--([\w-]+):([^;{}]+)/g)].map(m => [m[1], m[2]]))
const light = parse(/:root\{([^}]+)\}/), dark = { ...light, ...parse(/:root\[data-theme="dark"\]\{([^}]+)\}/) }
const colorKeys = Object.keys(light).filter(k => /^#[0-9a-f]+$/i.test(light[k]))
const pick = p => Object.fromEntries(colorKeys.map(k => [k, p[k]]))
const base = Object.fromEntries(Object.entries(light).filter(([k]) => !colorKeys.includes(k)))
writeFileSync('src/renderer/workstation/palette.mjs', `// Color values migrated from the SHA-256 verified comfort prototype.\nexport const palettes = ${JSON.stringify({ light: pick(light), dark: pick(dark) }, null, 2)}\nexport const baseTokens = ${JSON.stringify(base, null, 2)}\nexport function resolved(mode, dark) { return mode === 'system' ? dark ? 'dark' : 'light' : mode === 'dark' ? 'dark' : 'light' }\nexport function terminalTheme(p) { return { background: p.terminal, foreground: p.text, cursor: p.accent, cursorAccent: p.terminal, selectionBackground: p.selection, black: p.muted, red: p.red, green: p.green, yellow: p.amber, blue: p.accent, magenta: p.violet, cyan: p.accent, white: p.text, brightBlack: p.faint, brightRed: p.red, brightGreen: p.green, brightYellow: p.amber, brightBlue: p.accent, brightMagenta: p.violet, brightCyan: p.accent, brightWhite: p.text } }\n`)
writeFileSync('src/renderer/workstation/comfort.css', css.split('\n').filter(l => !l.startsWith(':root') && !l.startsWith('@media(prefers-color-scheme:dark)')).join('\n'))
const iconSection = source.split('const iconPaths={')[1].split('};')[0]
const icons = Object.fromEntries([...iconSection.matchAll(/(\w+):'([^']*)'/g)].map(m => [m[1], m[2]]))
writeFileSync('src/renderer/workstation/icons.tsx', `const paths: Record<string,string> = ${JSON.stringify(icons)}\nexport function Icon({name}: {name: string}) { return <svg viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{__html:paths[name] || paths.terminal}}/> }\n`)
console.log('Verified prototype CSS, palette and constant icons migrated; original unchanged.')
