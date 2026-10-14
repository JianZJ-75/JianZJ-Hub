export type Operation = 'create' | 'write' | 'resize' | 'close' | 'inspect' | 'shutdown' | 'database'
export interface Request { requestId: string; operation: Operation; payload: Record<string, unknown> }
export interface Reply { requestId: string; ok: boolean; result?: unknown; error?: { code: string; message: string } }
export interface TerminalEvent { type: 'data' | 'exit' | 'fault'; sessionId: string; generation: number; data?: string; exitCode?: number; code?: string; message?: string; exitCodeSource?: 'process-handle'; seq: number }
export interface SessionInfo { sessionId: string; generation: number; pid: number; createdAt: string; cols: number; rows: number; state: string }
export interface M0Bridge {
  create(): Promise<SessionInfo>
  write(sessionId: string, data: string): Promise<unknown>
  resize(sessionId: string, cols: number, rows: number): Promise<unknown>
  close(sessionId: string): Promise<unknown>
  database(): Promise<unknown>
  onTerminal(listener: (event: TerminalEvent) => void): () => void
}
