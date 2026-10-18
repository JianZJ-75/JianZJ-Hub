import { Icon } from './icons'
// Static examples preserve the approved composition, not auxiliary production data.
const tasks = ['体验右侧和下侧分屏', '记下一个想到就做的小改进', '检查提醒能否回到原窗格']
export function AuxiliaryExample({ tool }: { tool: string }) {
  if (tool === 'tasks') return <>
    <div className="add-form"><input placeholder="添加一件要做的事…" aria-label="演示待办输入" readOnly/><button type="button" className="btn" disabled title="演示占位，尚未接入"><Icon name="plus"/></button></div>
    <div className="block-title"><span>待完成 · 3</span></div>
    {tasks.map(text => <div className="task-row" key={text}><input className="task-check" type="checkbox" checked={false} disabled aria-label={text}/><div className="task-copy"><label>{text}</label><div className="task-meta">今天 · 示例</div></div></div>)}
    <div className="block-title"><span>已完成 · 1</span><button type="button" className="linkbtn" disabled>归档</button></div>
    <div className="task-row"><input className="task-check" type="checkbox" checked disabled aria-label="示例完成项"/><div className="task-copy done"><label>打开终端中心工作区</label><div className="task-meta">今天 · 示例</div></div></div>
    <div className="soft-callout"><Icon name="arrow"/><div>辅助工具按需打开<p>收起即可回到当前终端。</p></div></div>
  </>
  if (tool === 'notes') return <><div className="note-compose"><textarea placeholder="想到什么，先记下来…" aria-label="演示速记输入"/><div className="compose-foot"><span>示例输入，不保存</span><button className="btn primary" disabled>保存速记</button></div></div><div className="block-title">收件箱</div><article className="note-card"><div className="note-text">辅助工具应该能随手打开，也能很快收起来。不要把终端挤成一小块。</div><div className="note-actions"><span className="tag">体验 · 示例</span><span className="task-meta">刚刚</span></div></article></>
  if (tool === 'clipboard') return <><div className="filters"><button className="filter active" disabled>全部</button><button className="filter" disabled>文本</button><button className="filter" disabled>图片</button><button className="filter" disabled>文件</button></div><input className="fullinput" placeholder="搜索示例条目…" readOnly/>{['npm run dev', '终端为主，辅助工具按需出现。'].map(text => <article className="clip-card" key={text}><div className="clip-type"><Icon name="file"/>示例文本</div><div className="clip-text">{text}</div><button className="linkbtn" disabled>复制</button></article>)}</>
  return <article className="event-card"><div className="event-top"><span className="status unknown">示例提醒</span><span>刚刚</span></div><h3>会话提醒会出现在这里</h3><p>查看来源，再回到对应终端。</p><div className="event-bottom"><button className="btn" disabled><Icon name="arrow"/>回到终端</button></div></article>
}
