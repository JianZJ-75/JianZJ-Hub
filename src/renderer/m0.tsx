import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import './m0.css'
import type { M0Bridge, SessionInfo } from '../shared/m0-protocol'
declare global { interface Window { m0: M0Bridge } }
function App() {
  const host = useRef<HTMLDivElement>(null), terminal = useRef<Terminal | null>(null), current = useRef<SessionInfo | null>(null)
  const [status, setStatus] = useState('M0 最小验证入口 — 非产品界面'), [session, setSession] = useState<SessionInfo | null>(null)
  useEffect(() => {
    const term = new Terminal({ fontSize: 14, fontFamily: 'Consolas, Microsoft YaHei, monospace', scrollback: 2000, theme: { background: '#fbfcfe', foreground: '#283345', cursor: '#4466b5' } })
    const fit = new FitAddon(); term.loadAddon(fit); term.open(host.current!); fit.fit(); terminal.current = term
    const input = term.onData(data => { if (current.current) void window.m0.write(current.current.sessionId, data).catch(error => setStatus(String(error))) })
    const unsubscribe = window.m0.onTerminal(event => { if (event.sessionId === current.current?.sessionId) { if (event.type === 'data') term.write(event.data || ''); else if (event.type === 'fault') setStatus(`会话失败：${event.code} ${event.message}`); else setStatus(`Shell 已结束：${event.exitCode}`) } })
    const observer = new ResizeObserver(() => { fit.fit(); if (current.current && term.cols > 1 && term.rows > 1) void window.m0.resize(current.current.sessionId, term.cols, term.rows).catch(error => setStatus(String(error))) }); observer.observe(host.current!)
    return () => { unsubscribe(); input.dispose(); observer.disconnect(); term.dispose() }
  }, [])
  async function create() {
    try { if (current.current) throw new Error('先关闭当前测试会话'); const info = await window.m0.create(); current.current = info; setSession(info); setStatus(`真实 PowerShell PID ${info.pid}`); terminal.current?.focus() }
    catch (error) { setStatus(String(error)) }
  }
  async function close() {
    if (!current.current) return
    try { const result = await window.m0.close(current.current.sessionId); current.current = null; setSession(null); setStatus(`会话结束：${JSON.stringify(result)}`) }
    catch (error) { setStatus(String(error)) }
  }
  return <main><h1>工作站 · M0 风险验证</h1><p>仅验证真实 PTY、原生模块和退出清理。不实现舒适版工作区，不读取剪贴板，不自动恢复会话。</p><nav><button id="create" disabled={!!session} onClick={create}>启动测试 PowerShell</button><button id="close" disabled={!session} onClick={close}>关闭当前会话</button><button id="database" onClick={() => { void window.m0.database().then(result => setStatus(JSON.stringify(result)), error => setStatus(String(error))) }}>验证中文搜索</button></nav><output id="status">{status}</output><div className="terminal" ref={host}></div></main>
}
createRoot(document.getElementById('root')!).render(<App />)
