import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import '@xterm/xterm/css/xterm.css'
import './comfort.css'
import './workstation.css'
import { Icon } from './icons'
import { AuxiliaryExample } from './auxiliary-example'
import { Terminals, type LivePane } from './terminals'
import { palettes, baseTokens, resolved } from './palette.mjs'
import { leaves, split, remove, ratio, minimum } from '../../core/layout/tree.mjs'
import type { Bridge, Workspace, Preferences } from '../../shared/workstation-protocol'
declare global { interface Window { workstation: Bridge } }
const manager = new Terminals(), bridge = window.workstation
const newId = (prefix: string) => prefix + '-' + crypto.randomUUID()
function Button({ icon, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: string }) { return <button type="button" {...props}>{icon && <Icon name={icon}/ >}{children}</button> }
function PaneSlot({ pane, index, active, zoom, onActive, onZoom, onRename, onClose }: any) {
  const slot = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    slot.current!.appendChild(pane.host)
    let frame = 0
    const fit = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => manager.fit(pane)) }
    const observer = new ResizeObserver(fit); observer.observe(slot.current!); fit()
    return () => { observer.disconnect(); cancelAnimationFrame(frame) }
  }, [pane])
  return <article className={'terminal-pane' + (active ? ' active' : '')} data-pane={pane.paneId} data-state={pane.state} onPointerDown={onActive}>
    <div className="pane-head"><Button className="pane-label" onClick={onActive} onDoubleClick={onRename}><i className={'state-dot ' + (pane.state === 'running' ? '' : 'unknown')}/><span>{pane.name}</span></Button><span className="pane-state">{pane.state === 'creating' ? '创建中' : pane.state === 'exited' ? '已结束 ' + pane.exitCode : pane.state === 'failed' ? '失败' : pane.state === 'closing' ? '关闭中' : ''}</span><span className="pane-number">{String(index + 1).padStart(2, '0')}</span><Button className="iconbtn small" icon={zoom ? 'restore' : 'focus'} title={zoom ? '还原分屏' : '放大当前窗格'} aria-label={zoom ? '还原分屏' : '放大当前窗格'} onClick={onZoom}/><Button className="iconbtn small" icon="close" title="关闭此终端" aria-label="关闭此终端" onClick={onClose} disabled={pane.state === 'creating' || pane.state === 'closing'}/></div>
    <div className="terminal-slot" ref={slot}/>{(pane.error || pane.resize.error) && <div className="pane-error" role="alert">{pane.error || pane.resize.error}</div>}
    <div className="pane-foot"><Icon name="folder"/><span className="folder-path" title={'当前 Shell 目录：' + pane.cwd}>{pane.cwd}</span><span className="spacer"/><span className="pane-size" data-size-state={pane.resize.error ? 'error' : pane.state === 'running' && pane.resize.pending ? 'pending' : 'settled'} title={pane.resize.error || (pane.resize.pending ? '正在将尺寸同步到 Shell' : 'xterm / Shell 已确认尺寸 ' + pane.dimensions)}>{pane.term.cols}×{pane.term.rows}{pane.state === 'running' && pane.resize.pending ? ' · 调整中' : ''}</span><span>{pane.shellLabel}</span></div>
  </article>
}
function Modal({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => { (root.current?.querySelector('input,textarea,select,button') as HTMLElement)?.focus() }, [])
  return <div className="overlay" onPointerDown={e => { if (e.target === e.currentTarget) close() }}><section className="dialog" role="dialog" aria-modal="true" aria-label={title} onKeyDown={e => {
    if (e.key !== 'Tab') return
    const nodes = [...root.current!.querySelectorAll<HTMLElement>('button:not(:disabled),input,textarea,select')].filter(n => n.getClientRects().length)
    const first = nodes[0], last = nodes[nodes.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus() } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
  }}><div className="dialog-head"><h2>{title}</h2><Button className="iconbtn" aria-label="关闭对话框" icon="close" onClick={close}/></div><div className="dialog-body" ref={root}>{children}</div></section></div>
}
function App() {
  const [config, setConfig] = useState<Workspace[]>([]), [current, setCurrent] = useState<string | null>(null), [trees, setTrees] = useState<Record<string, any>>({})
  const [active, setActive] = useState<string | null>(null), [zoom, setZoom] = useState<string | null>(null), [focusMode, setFocus] = useState(false)
  const [tool, setTool] = useState<string | null>(null), priorTool = useRef<string | null>(null)
  const [prefs, setPrefs] = useState<Preferences>({ theme: 'system', fontSize: 14, density: 'comfortable' }), [dark, setDark] = useState(false)
  const [modal, setModal] = useState<string | null>(null), [target, setTarget] = useState<string | null>(null), [message, setMessage] = useState(''), [loaded, setLoaded] = useState(false), [busy, setBusy] = useState(false)
  const [name, setName] = useState(''), [cwd, setCwd] = useState(''), [layout, setLayout] = useState<Workspace['layout']>('single'), [query, setQuery] = useState(''), [dataDir, setDataDir] = useState('')
  const preferenceRevision = useRef(0)
  const [, refresh] = useState(0), stage = useRef<HTMLDivElement>(null), lastActive = useRef<Record<string, string>>({}), returnPane = useRef<string | null>(null)
  const [stageSize, setStageSize] = useState({ width: 10000, height: 10000, viewport: 10000 })
  const [defaultTerminal, setDefaultTerminal] = useState<Workspace | null>(null), started = useRef(false)
  const workspace = defaultTerminal?.id === current ? defaultTerminal : config.find(w => w.id === current), tree = current ? trees[current] : null, activePane = manager.panes.get(active || ''), displayCwd = activePane?.cwd || workspace?.cwd || ''
  const cellMinimum = manager.minimum(active)
  const required = minimum(tree, cellMinimum.width, cellMinimum.height)
  const constrained = !!tree && !zoom && (stageSize.width < required.width || stageSize.height < required.height || stageSize.viewport <= 720 && leaves(tree).length > 1)
  useLayoutEffect(() => {
    const measure = () => { if (!stage.current) return; const r = stage.current.getBoundingClientRect(), viewport = window.innerWidth; setStageSize(old => old.width === r.width && old.height === r.height && old.viewport === viewport ? old : { width: r.width, height: r.height, viewport }) }
    const observer = new ResizeObserver(measure); if (stage.current) observer.observe(stage.current); window.addEventListener('resize', measure)
    return () => { observer.disconnect(); window.removeEventListener('resize', measure) }
  }, [])
  manager.change = () => refresh(v => v + 1)
  manager.focusChanged = id => { setActive(id); const p = manager.panes.get(id); if (p) lastActive.current[p.workspaceId] = id }
  const focus = (id = active) => requestAnimationFrame(() => { if (id) { const p = manager.panes.get(id); if (p?.host.getClientRects().length) p.term.focus() } })
  function closeModal() { setModal(null); focus(returnPane.current || active) }
  function openModal(type: string, paneId?: string) { returnPane.current = active; setTarget(paneId || null); setMessage(''); setModal(type); if (type === 'new') { setName(''); setCwd(''); setLayout('single') } if (type === 'rename') setName(manager.panes.get(paneId!)?.name || ''); if (type === 'search') setQuery('') }
  useEffect(() => {
    let live = true
    bridge.load().then(result => { if (!live) return; setConfig(result.workspaces); setPrefs(result.preferences); setDark(result.dark); setDataDir(result.dataDirectory); setDefaultTerminal(result.defaultTerminal); setLoaded(true) }).catch(error => setMessage(String(error)))
    const unsubscribe = bridge.onTheme(value => setDark(value))
    return () => { live = false; unsubscribe() }
  }, [])
  useLayoutEffect(() => {
    const root = document.documentElement, theme = resolved(prefs.theme, dark)
    root.dataset.theme = theme; root.style.colorScheme = theme
    for (const [key, value] of Object.entries({ ...baseTokens, ...palettes[theme] })) root.style.setProperty('--' + key, value)
    root.style.setProperty('--term-size', prefs.fontSize + 'px'); root.style.setProperty('--term-line', prefs.density === 'compact' ? '1.25' : '1.35'); root.style.setProperty('--row-space', prefs.density === 'compact' ? '10px' : '14px')
    manager.appearance(prefs, dark)
  }, [prefs, dark])
  useLayoutEffect(() => { const frame = requestAnimationFrame(() => manager.panes.forEach(p => manager.fit(p))); return () => cancelAnimationFrame(frame) }, [trees, current, tool, zoom, focusMode, prefs])
  useEffect(() => {
    if (!loaded || !defaultTerminal || started.current) return
    started.current = true
    void enter(defaultTerminal)
  }, [loaded, defaultTerminal])
  async function updatePreferences(next: Preferences) {
    const revision = ++preferenceRevision.current; setPrefs(next)
    try { await bridge.savePreferences(next) }
    catch (error) { setMessage(String(error)); const saved = await bridge.load().catch(() => null); if (saved && preferenceRevision.current === revision) setPrefs(saved.preferences) }
  }
  async function enter(w: Workspace) {
    if (busy) return
    setBusy(true); setMessage(''); setZoom(null)
    try {
      if (trees[w.id]) { setCurrent(w.id); const next = lastActive.current[w.id] || leaves(trees[w.id])[0]; setActive(next); focus(next); return }
      setCurrent(w.id)
      const a = manager.make(newId('pane'), w.id, w.id === defaultTerminal?.id ? 'Git Bash' : '项目终端', w.cwd)
      const panes = [a]
      let initial: any = { type: 'leaf', paneId: a.paneId }
      if (w.layout !== 'single') { const b = manager.make(newId('pane'), w.id, '辅助终端', w.cwd); panes.push(b); initial = split(initial, a.paneId, b.paneId, w.layout) }
      // Both hosts enter their final initial slots before measuring/spawning.
      setTrees(old => ({ ...old, [w.id]: initial })); setActive(a.paneId)
      const results = await Promise.allSettled(panes.map(pane => manager.start(pane)))
      for (let n = 0; n < results.length; n++) if (results[n].status === 'rejected' && !panes[n].sessionId) { initial = remove(initial, panes[n].paneId); manager.dispose(panes[n].paneId) }
      setTrees(old => ({ ...old, [w.id]: initial }))
      const next = leaves(initial)[0] || null; setActive(next); if (next) lastActive.current[w.id] = next
      focus(next)
      const failed = results.find(r => r.status === 'rejected'); if (failed?.status === 'rejected') throw failed.reason
    } catch (error) { setMessage(String(error)) } finally { setBusy(false) }
  }
  async function splitPane(axis: 'right' | 'down') {
    if (!workspace || busy) return
    if (!tree) { await enter(workspace); return }
    const id = active || leaves(tree)[0], rect = document.querySelector(`[data-pane="${id}"]`)?.getBoundingClientRect()
    const minWidth = cellMinimum.width, minHeight = cellMinimum.height
    if (zoom || constrained || !rect || (axis === 'right' ? rect.width < minWidth * 2 + 10 : rect.height < minHeight * 2 + 10)) { setMessage('当前窗格空间不足，请先还原放大视图、收起辅助区、调整分隔线或扩大窗口。'); return }
    setBusy(true)
    const next = manager.make(newId('pane'), workspace.id, '终端 ' + (leaves(tree).length + 1), workspace.cwd)
    const previous = tree
    setTrees(old => ({ ...old, [workspace.id]: split(old[workspace.id], id, next.paneId, axis) })); setActive(next.paneId)
    try { await manager.start(next); lastActive.current[workspace.id] = next.paneId; focus(next.paneId) }
    catch (error) { if (!next.sessionId) { manager.dispose(next.paneId); setTrees(old => ({ ...old, [workspace.id]: previous })); setActive(id) } setMessage(String(error)) }
    finally { setBusy(false) }
  }
  async function closePane() {
    const pane = manager.panes.get(target!); if (!pane || busy) return
    setBusy(true)
    try {
      if (pane.state === 'failed' && !pane.sessionId) manager.dispose(pane.paneId); else await manager.close(pane)
      const nextTree = remove(trees[pane.workspaceId], pane.paneId), next = active === pane.paneId ? leaves(nextTree)[0] || null : active
      setTrees(old => ({ ...old, [pane.workspaceId]: nextTree })); setActive(next); setZoom(null); setModal(null); focus(next)
    } catch (error) { setMessage(String(error)) } finally { setBusy(false) }
  }
  function toggleFocus() { setFocus(value => { if (!value) { priorTool.current = tool; setTool(null) } else setTool(priorTool.current); return !value }); focus() }
  function openTool(name: string) { returnPane.current = active; setFocus(false); setTool(old => old === name ? null : name); requestAnimationFrame(() => { const input = document.querySelector<HTMLElement>('.drawer textarea,.drawer input'); if (input) input.focus(); else focus() }) }
  const keys = (e: KeyboardEvent) => {
    if (e.isComposing || e.defaultPrevented) return false
    if (e.key === 'Escape') { if (modal) closeModal(); else if (zoom) { setZoom(null); focus() } else if (tool) { setTool(null); focus(returnPane.current || active) } else if (focusMode) toggleFocus(); else return false; e.preventDefault(); return true }
    if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'k') { e.preventDefault(); openModal('search'); return true }
    if (!modal && e.ctrlKey && e.shiftKey && ['d', 'e', 'n', 't'].includes(e.key.toLowerCase())) { e.preventDefault(); if (e.key.toLowerCase() === 'n') openTool('notes'); else void splitPane(e.key.toLowerCase() === 'd' ? 'right' : 'down'); return true }
    return false
  }
  manager.shortcut = keys
  useEffect(() => { const listener = (e: KeyboardEvent) => keys(e); document.addEventListener('keydown', listener); return () => document.removeEventListener('keydown', listener) })
  function renderTree(node: any): ReactNode {
    if (!node) return null
    if (node.type === 'leaf') {
      const pane = manager.panes.get(node.paneId); if (!pane) return null
      return <PaneSlot key={pane.paneId} index={leaves(tree).indexOf(pane.paneId)} pane={pane} active={active === pane.paneId} zoom={!!zoom} onActive={() => { setActive(pane.paneId); focus(pane.paneId) }} onRename={() => openModal('rename', pane.paneId)} onZoom={() => { setActive(pane.paneId); setZoom(zoom ? null : pane.paneId); focus(pane.paneId) }} onClose={() => openModal('close', pane.paneId)}/>
    }
    return <div className={'tree' + (node.axis === 'down' ? ' vertical' : '')} key={node.id} data-split={node.id}>
      <div className="tree-branch" style={{ flex: node.ratio + ' 1 0' }}>{renderTree(node.first)}</div>
      <div className="splitter" tabIndex={0} role="separator" aria-label="调整终端分屏比例" aria-orientation={node.axis === 'right' ? 'vertical' : 'horizontal'} aria-valuenow={Math.round(node.ratio * 100)} onPointerDown={e => {
        if (e.button !== 0) return; e.preventDefault(); const element = e.currentTarget, parent = element.parentElement!, rect = parent.getBoundingClientRect(); element.setPointerCapture(e.pointerId)
        const move = (ev: PointerEvent) => { const span = node.axis === 'right' ? rect.width : rect.height, value = node.axis === 'right' ? (ev.clientX - rect.left) / span : (ev.clientY - rect.top) / span; setTrees(old => ({ ...old, [current!]: ratio(old[current!], node.id, value, span, cellMinimum) })) }
        const end = () => { element.removeEventListener('pointermove', move); element.removeEventListener('pointerup', end); element.removeEventListener('pointercancel', end); focus() }
        element.addEventListener('pointermove', move); element.addEventListener('pointerup', end); element.addEventListener('pointercancel', end)
      }} onKeyDown={e => { if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return; e.preventDefault(); const rect = e.currentTarget.parentElement!.getBoundingClientRect(), delta = ['ArrowLeft', 'ArrowUp'].includes(e.key) ? -.03 : .03; setTrees(old => ({ ...old, [current!]: ratio(old[current!], node.id, node.ratio + delta, node.axis === 'right' ? rect.width : rect.height, cellMinimum) })) }}/>
      <div className="tree-branch" style={{ flex: (1 - node.ratio) + ' 1 0' }}>{renderTree(node.second)}</div>
    </div>
  }
  return <div className="outer"><div className={'app' + (focusMode ? ' focus-mode' : '')} id="app">
    <aside className="sidebar" aria-label="工作区导航"><div className="brand"><svg className="logo" viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="3" width="20" height="18" rx="5"/><path d="m7 8 4 4-4 4m7 0h3"/></svg><h1>工作站</h1></div><div className="sidegroup">{defaultTerminal && <Button className={'workspace' + (current === defaultTerminal.id ? ' active' : '')} icon="terminal" onClick={() => void enter(defaultTerminal)} disabled={busy}><span>终端</span><span className="count">{leaves(trees[defaultTerminal.id]).length}</span></Button>}<div className="section-label">项目<Button className="iconbtn small" icon="plus" aria-label="新建工作区" onClick={() => openModal('new')}/></div><nav>{config.map(w => <Button key={w.id} className={'workspace' + (current === w.id ? ' active' : '')} onClick={() => void enter(w)} disabled={busy}><span className="project-symbol">{w.name.slice(0, 1).toUpperCase()}</span><span>{w.name}</span><span className="count">{leaves(trees[w.id]).length}</span></Button>)}</nav><Button className="sideitem" icon="launcher" onClick={() => openModal('launcher')}>快捷启动</Button></div><div className="sidebottom"><Button className="sideitem" icon="help" onClick={() => openModal('help')}>使用说明</Button></div></aside>
    <main className="main"><header className="header"><div className="breadcrumb"><Icon name="folder"/><h2>{workspace?.name || '终端'}</h2><span className="path">{displayCwd}</span></div><span className="spacer"/><Button className="iconbtn narrow-launcher" icon="launcher" aria-label="快捷启动" onClick={() => openModal('launcher')}/><Button className="search-trigger" icon="search" onClick={() => openModal('search')}><span>搜索</span><kbd>Ctrl K</kbd></Button><Button className="btn subtle" icon={focusMode ? 'restore' : 'focus'} onClick={toggleFocus}>{focusMode ? '退出专注' : '专注'}</Button></header>
    <div className="workbar"><span className="workbar-label">{leaves(tree).length} 个终端{zoom ? ' · 单窗格视图' : ''}</span><span className="spacer"/><Button className="btn" icon="right" disabled={!workspace || busy} onClick={() => void splitPane('right')}>向右分屏</Button><Button className="btn" icon="down" disabled={!workspace || busy} onClick={() => void splitPane('down')}>向下分屏</Button><Button className="iconbtn" icon="plus" aria-label="新建终端" title="新建终端 · Ctrl Shift T" disabled={!loaded || busy} onClick={() => void splitPane('right')}/></div>
    <div className="workspace-content"><section className={'terminal-stage' + (constrained ? ' space-constrained' : '')} aria-label="终端窗格">{constrained && <div className="space-hint" role="status">窄窗口或空间不足，暂显示当前窗格；可切换下方终端、收起辅助区或扩大窗口以还原分屏。</div>}<nav className="mobile-tabs">{leaves(tree).map((id: string) => <Button key={id} className={id === active ? 'active' : ''} onClick={() => { setActive(id); focus(id) }}>{manager.panes.get(id)?.name}</Button>)}</nav><div className="stage" ref={stage} data-active-pane={active || ''}>{tree ? <div className={'tree root-tree' + (zoom ? ' zoomed' : '')} data-zoom={zoom || ''}>{renderTree(tree)}</div> : <div className="closed-surface"><div><Icon name="terminal"/><h2>{loaded ? busy ? '正在启动 Git Bash…' : '终端已关闭' : '正在启动…'}</h2><Button className="btn" icon="plus" onClick={() => { const target = workspace || defaultTerminal; if (target) void enter(target) }} disabled={!loaded || busy}>新建终端</Button></div></div>}</div></section>
    {!focusMode && tool && <aside className="drawer" aria-label="辅助工具"><div className="drawer-head"><div><h2>{{ tasks: '今日待办', notes: '速记收件箱', clipboard: '剪贴板', notifications: '通知中心' }[tool]}</h2><p>{{ tasks: '先完成眼前的事', notes: '先记下，稍后再整理', clipboard: '找回刚刚复制的内容', notifications: '提醒有出处，处理有去向' }[tool]}</p></div><Button className="iconbtn" icon="close" aria-label="收起辅助工具" onClick={() => { setTool(null); focus(returnPane.current || active) }}/></div><div className="drawer-body"><AuxiliaryExample tool={tool}/></div><div className="drawer-foot">示例占位 · 辅助业务未接入</div></aside>}
    <nav className="tools" aria-label="辅助工具栏">{['tasks', 'notes', 'clipboard', 'notifications'].map(t => <Button key={t} className={'tool-button' + (tool === t && !focusMode ? ' active' : '')} icon={t} aria-label={{ tasks: '今日待办', notes: '速记', clipboard: '剪贴板', notifications: '通知中心' }[t]} onClick={() => openTool(t)}/>)}<span className="spacer"/><Button className="tool-button bottom" icon="settings" aria-label="外观与设置" onClick={() => openModal('settings')}/></nav></div></main></div>
    <footer className="footer"><div><span className="prototype-label"><i className="tiny-dot"/>终端工作区 · 辅助演示</span><span className="desktop-foot">Git Bash · 本地会话</span></div><div><span className="desktop-foot">当前：{manager.panes.get(active || '')?.name || '无终端'}</span><Button onClick={() => void bridge.quit().catch(e => setMessage(String(e)))}>关闭工作站</Button></div></footer>
    {message && <div className="toast" role="alert"><span>{message}</span><Button aria-label="关闭提示" onClick={() => setMessage('')}>知道了</Button></div>}
    {modal && <Modal title={{ new: '新建项目工作区', rename: '重命名终端', close: '关闭此终端？', settings: '外观与使用习惯', launcher: '快捷启动', search: '查找工作区', help: '使用说明', shortcuts: '键盘操作' }[modal]!} close={closeModal}>
      {modal === 'new' && <form onSubmit={async e => { e.preventDefault(); if (busy) return; setBusy(true); try { const w: Workspace = { id: newId('workspace'), name: name.trim(), cwd: cwd.trim(), layout }; await bridge.saveWorkspace(w); setConfig(old => [...old, w]); setModal(null); setBusy(false); await enter(w) } catch (error) { setMessage(String(error)) } finally { setBusy(false) } }}><label className="field">项目名称<input value={name} maxLength={64} required onChange={e => setName(e.target.value)}/></label><label className="field">项目目录<div className="directory-picker"><input value={cwd} required onChange={e => setCwd(e.target.value)}/><Button className="btn" onClick={() => void bridge.selectDirectory().then(path => { if (path) setCwd(path) }).catch(e => setMessage(String(e)))}>选择目录</Button></div></label><label className="field">初始终端布局<select value={layout} onChange={e => setLayout(e.target.value as any)}><option value="single">单个终端</option><option value="right">左右双终端</option><option value="down">上下双终端</option></select></label><p className="hint">保存项目配置并打开真实 Git Bash；不创建目录，不执行额外启动命令。</p><div className="dialog-actions"><Button className="btn" onClick={closeModal}>取消</Button><button className="btn primary" type="submit" disabled={busy}>创建并打开工作区</button></div></form>}
      {modal === 'rename' && <form onSubmit={e => { e.preventDefault(); if (!name.trim()) return; const p = manager.panes.get(target!); if (p) p.name = name.trim(); closeModal(); refresh(v => v + 1) }}><label className="field">终端名称<input value={name} onChange={e => setName(e.target.value)} maxLength={36} required/></label><div className="dialog-actions"><Button className="btn" onClick={closeModal}>取消</Button><button type="submit" className="btn primary">保存名称</button></div></form>}
      {modal === 'close' && <><p>关闭“{manager.panes.get(target!)?.name}”将结束此受管理会话及其子进程，其他窗格继续运行。</p><p className="hint">确认清理成功后才移除窗格，不自动恢复。</p><div className="dialog-actions"><Button className="btn" onClick={closeModal}>保留终端</Button><Button className="btn danger" disabled={busy} onClick={() => void closePane()}>关闭此终端</Button></div></>}
      {modal === 'settings' && <>
        <div className="setting-row"><div><h3>外观</h3><p>浅色和深色都保持柔和对比。</p></div><select aria-label="外观主题" value={prefs.theme} onChange={e => void updatePreferences({ ...prefs, theme: e.target.value as any })}><option value="system">跟随系统</option><option value="dark">深色</option><option value="light">浅色</option></select></div>
        <div className="setting-row"><div><h3>终端字号</h3><p>按显示缩放和阅读习惯调整。</p></div><div className="font-control"><input aria-label="终端字号" type="range" min="12" max="18" step="1" value={prefs.fontSize} onChange={e => void updatePreferences({ ...prefs, fontSize: Number(e.target.value) })}/><span>{prefs.fontSize} px</span></div></div>
        <div className="setting-row"><div><h3>信息密度</h3><p>默认舒适，行距更宽松。</p></div><select aria-label="界面密度" value={prefs.density} onChange={e => void updatePreferences({ ...prefs, density: e.target.value as any })}><option value="comfortable">舒适</option><option value="compact">紧凑</option></select></div>
        <div className="preview-code">{'Git Bash  /  字体预览\n❯ echo 让终端更好读\n中英文混排 · 0123456789'}</div><p className="hint">主题、字号与密度自动保存。</p><div className="dialog-actions"><Button className="btn" onClick={() => openModal('shortcuts')}>键盘操作</Button><Button className="btn primary" onClick={closeModal}>完成</Button></div>
      </>}
      {(modal === 'launcher' || modal === 'search') && <><p className="hint">M1 仅打开已配置工作区；应用/网址/文件夹动作与跨模块统一搜索未接入。</p>{modal === 'search' && <input className="fullinput" aria-label="查找工作区" placeholder="按工作区名称查找" value={query} onChange={e => setQuery(e.target.value)}/ >}{config.filter(w => w.name.toLowerCase().includes(query.toLowerCase())).map(w => <Button key={w.id} className="launch-card" icon="terminal" onClick={() => { setModal(null); void enter(w) }}><div><strong>{w.name}</strong><p>{w.cwd}</p></div><span className="small-label">打开工作区</span></Button>)}<Button className="btn" icon="plus" onClick={() => openModal('new')}>新建工作区</Button></>}
      {modal === 'help' && <><p>启动时直接打开主目录中的全新 Git Bash，无需先选择项目。项目只用于可选的目录组织。关闭窗格或应用会结束对应会话；不恢复旧进程或重放命令。</p><p>辅助区只展示静态示例，尚未接入速记、待办、剪贴板历史和通知业务。示例输入不保存，不采集系统剪贴板历史。</p><p>已确认的 CLI 兼容仅作用于工作站新建 Shell：优先已安装的原生 Claude 可执行文件，不改执行策略、全局 PATH 或个人 profile，不创建 alias，也不改写命令。</p>{manager.panes.get(active || '')?.sessionId && <p className="help-path">{manager.panes.get(active || '')?.claudeExecutable ? '当前会话已优先：' + manager.panes.get(active || '')!.claudeExecutable : '当前会话未检测到原生 Claude；保留原命令环境，可显式使用 claude.cmd。'}</p>}<p>终端使用你的用户权限，不是命令安全沙箱。M1 不做托盘、自启或全局热键。</p><p className="hint help-path">工作区与偏好配置位置：{dataDir}</p><Button className="linkbtn" onClick={() => openModal('shortcuts')}>查看键盘操作</Button></>}
      {modal === 'shortcuts' && <><div className="shortcut-grid">{[['新建终端', 'Ctrl Shift T'], ['查找工作区', 'Ctrl K'], ['快速速记示例', 'Ctrl Shift N'], ['向右分屏', 'Ctrl Shift D'], ['向下分屏', 'Ctrl Shift E'], ['关闭浮层 / 回到终端', 'Esc'], ['窗格改名', '双击窗格名称'], ['选中文本后复制 / 无选区中断', 'Ctrl C'], ['粘贴到终端', 'Ctrl V / Ctrl Shift V']].map(([title, key]) => <span className="shortcut-pair" key={title}><span>{title}</span><kbd>{key}</kbd></span>)}</div><p className="hint">这里是应用内快捷键，不是系统全局热键。没有产品浮层时，Esc 和终端组合键交给 Shell；输入法组合输入不触发产品快捷操作。</p></>}
    </Modal>}
  </div>
}
createRoot(document.getElementById('root')!).render(<App/> )
