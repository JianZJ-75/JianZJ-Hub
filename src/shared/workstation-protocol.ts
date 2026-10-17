export interface SessionRef { sessionId: string; generation: number }
export interface Workspace { id: string; name: string; cwd: string; layout: 'single' | 'right' | 'down' }
export interface Preferences { theme: 'system' | 'light' | 'dark'; fontSize: number; density: 'comfortable' | 'compact' }
export interface Bridge {
  load(): Promise<any>; selectDirectory(): Promise<string | null>; saveWorkspace(p: Workspace): Promise<void>
  savePreferences(p: Preferences): Promise<void>; create(p: any): Promise<any>
  write(p: SessionRef & { data: string }): Promise<void>; resize(p: SessionRef & { cols: number; rows: number }): Promise<void>
  ack(p: SessionRef & { seq: number }): Promise<void>; close(p: SessionRef): Promise<any>
  clipboardRead(): Promise<string>; clipboardWrite(text: string): Promise<void>; quit(): Promise<void>
  onTerminal(listener: (event: any) => void): () => void; onTheme(listener: (dark: boolean) => void): () => void
}
