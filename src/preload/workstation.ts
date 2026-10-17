import { contextBridge, ipcRenderer } from 'electron'
import type { Bridge } from '../shared/workstation-protocol'
async function call(operation: string, payload: any = {}) {
  const reply = await ipcRenderer.invoke('workstation:request', { operation, payload })
  if (!reply.ok) throw new Error(reply.error.message)
  return reply.result
}
function subscribe(channel: string, listener: (value: any) => void) {
  const receive = (_event: Electron.IpcRendererEvent, value: any) => listener(value)
  ipcRenderer.on(channel, receive); return () => ipcRenderer.removeListener(channel, receive)
}
const bridge: Bridge = {
  load: () => call('load'), selectDirectory: () => call('selectDirectory'), saveWorkspace: p => call('saveWorkspace', p), savePreferences: p => call('savePreferences', p),
  create: p => call('create', p), write: p => call('write', p), resize: p => call('resize', p), ack: p => call('ack', p), close: p => call('close', p),
  clipboardRead: () => call('clipboardRead'), clipboardWrite: text => call('clipboardWrite', { text }), quit: () => call('quit'),
  onTerminal: listener => subscribe('workstation:terminal', listener), onTheme: listener => subscribe('workstation:theme', listener)
}
contextBridge.exposeInMainWorld('workstation', Object.freeze(bridge))
