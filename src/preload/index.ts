import { contextBridge, ipcRenderer } from 'electron'
import type { M0Bridge, TerminalEvent } from '../shared/m0-protocol'
const bridge: M0Bridge = {
  create: () => ipcRenderer.invoke('m0:create'),
  write: (sessionId, data) => ipcRenderer.invoke('m0:write', { sessionId, data }),
  resize: (sessionId, cols, rows) => ipcRenderer.invoke('m0:resize', { sessionId, cols, rows }),
  close: sessionId => ipcRenderer.invoke('m0:close', { sessionId }),
  database: () => ipcRenderer.invoke('m0:database'),
  onTerminal(listener) {
    const receive = (_event: Electron.IpcRendererEvent, payload: TerminalEvent) => listener(payload)
    ipcRenderer.on('m0:terminal', receive)
    return () => ipcRenderer.removeListener('m0:terminal', receive)
  }
}
contextBridge.exposeInMainWorld('m0', bridge)
