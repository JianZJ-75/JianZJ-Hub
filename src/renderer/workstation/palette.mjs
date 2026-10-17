// Color values migrated from the SHA-256 verified comfort prototype.
export const palettes = {
  "light": {
    "bg": "#e9edf2",
    "surface": "#f5f7fa",
    "raised": "#fff",
    "hover": "#e9eef6",
    "terminal": "#fbfcfe",
    "head": "#f1f4f8",
    "line": "#dce2eb",
    "line-strong": "#becad9",
    "text": "#283345",
    "muted": "#606f83",
    "faint": "#748095",
    "accent": "#4466b5",
    "accent-soft": "#e5edfb",
    "green": "#397255",
    "amber": "#906320",
    "red": "#a54b54",
    "violet": "#795dab",
    "overlay": "#18203066",
    "shadow": "#192b431f",
    "on-accent": "#fff",
    "selection": "#88a5d936"
  },
  "dark": {
    "bg": "#16191f",
    "surface": "#1e222a",
    "raised": "#252a34",
    "hover": "#303744",
    "terminal": "#1b1f27",
    "head": "#222731",
    "line": "#303641",
    "line-strong": "#495569",
    "text": "#dce2ec",
    "muted": "#a1adbf",
    "faint": "#8996aa",
    "accent": "#9cb7f4",
    "accent-soft": "#2c3850",
    "green": "#9bc5ad",
    "amber": "#dec190",
    "red": "#e3a0a6",
    "violet": "#bcabdd",
    "overlay": "#090c138f",
    "shadow": "#070b1455",
    "on-accent": "#17233b",
    "selection": "#88a5d936"
  }
}
export const baseTokens = {
  "display": "\"Segoe UI Variable Display\",\"Segoe UI\",\"PingFang SC\",\"Microsoft YaHei\",sans-serif",
  "body": "\"Segoe UI Variable Text\",\"Segoe UI\",\"PingFang SC\",\"Microsoft YaHei\",sans-serif",
  "mono": "\"Cascadia Code\",\"Cascadia Mono\",\"SFMono-Regular\",Menlo,Consolas,\"Microsoft YaHei\",monospace",
  "term-size": "14px",
  "term-line": "1.85",
  "row-space": "14px"
}
export function resolved(mode, dark) { return mode === 'system' ? dark ? 'dark' : 'light' : mode === 'dark' ? 'dark' : 'light' }
export function terminalTheme(p) { return { background: p.terminal, foreground: p.text, cursor: p.accent, cursorAccent: p.terminal, selectionBackground: p.selection, black: p.muted, red: p.red, green: p.green, yellow: p.amber, blue: p.accent, magenta: p.violet, cyan: p.accent, white: p.text, brightBlack: p.faint, brightRed: p.red, brightGreen: p.green, brightYellow: p.amber, brightBlue: p.accent, brightMagenta: p.violet, brightCyan: p.accent, brightWhite: p.text } }
