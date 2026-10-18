// Unicode Block Elements are geometric cells, not font-shaped text. The DOM
// renderer otherwise falls back to proportional CJK corner glyphs with gaps.
const quadrants = { 0x2596: [2], 0x2597: [3], 0x2598: [0], 0x2599: [0,2,3], 0x259a: [0,3], 0x259b: [0,1,2], 0x259c: [0,1,3], 0x259d: [1], 0x259e: [1,2], 0x259f: [1,2,3] }
export function blockRects(char) {
  const n = char.codePointAt(0)
  if (n === 0x20) return []
  if (n === 0x2580) return [[0,0,1,.5]]
  if (n >= 0x2581 && n <= 0x2588) { const h=(n-0x2580)/8;return [[0,1-h,1,h]] }
  if (n >= 0x2589 && n <= 0x258f) return [[0,0,(0x2590-n)/8,1]]
  if (n === 0x2590) return [[.5,0,.5,1]]
  if (n === 0x2594) return [[0,0,1,.125]]
  if (n === 0x2595) return [[.875,0,.125,1]]
  return quadrants[n]?.map(q=>[q%2*.5,Math.floor(q/2)*.5,.5,.5])
}
export function paintBlockRows(element, cols, range) {
  const screen=element?.querySelector('.xterm-screen'), rows=element?.querySelector('.xterm-rows')
  if (!screen || !rows || cols < 1) return
  const width=screen.getBoundingClientRect().width/cols
  if (!(width > 0)) return
  for(let row=range.start;row<=range.end;row++) for(const run of rows.children[row]?.querySelectorAll(':scope > span') || []) {
    const text=run.textContent, chars=[...text]
    if(!/[▀-▟]/.test(text)||!chars.every(c=>blockRects(c)))continue
    const color=getComputedStyle(run).color
    if(run.dataset.blockRun===width+color)continue
    const fragment=document.createDocumentFragment()
    for(const char of chars){
      const cell=document.createElement('span');cell.textContent=char
      Object.assign(cell.style,{display:'inline-block',position:'relative',width:width+'px',letterSpacing:'0',color:'transparent',overflow:'hidden'})
      for(const [x,y,w,h]of blockRects(char)){
        const fill=document.createElement('i');Object.assign(fill.style,{position:'absolute',left:x*100+'%',top:y*100+'%',width:w*100+'%',height:h*100+'%',background:color,pointerEvents:'none'});cell.append(fill)
      }
      fragment.append(cell)
    }
    run.dataset.blockRun=width+color;run.style.letterSpacing='0';run.style.width=width*chars.length+'px';run.replaceChildren(fragment)
  }
}
