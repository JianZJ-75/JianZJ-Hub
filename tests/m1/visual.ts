import {app,BrowserWindow,dialog} from 'electron'
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {createHash} from 'node:crypto'
import assert from 'node:assert/strict'
import {startWorkstation} from '../../src/main/workstation/app'
const dir=resolve(process.env.JIANZJ_M1_EVIDENCE!),home=join(dir,'home'),prototype=resolve('prototypes/comfort-redesign/workstation-comfort.html');mkdirSync(home,{recursive:true});app.setPath('home',home);app.setPath('userData',join(dir,'userData'))
assert.equal(createHash('sha256').update(readFileSync(prototype)).digest('hex'),'1033c2dab321312f09ac220450d2fea7fbbf0f905ade18c450a5ed1281e6917a')
;(dialog as any).showMessageBox=async()=>({response:1})
app.whenReady().then(async()=>{
 const runtime=await startWorkstation(__dirname),win=runtime.win,js=(s:string)=>win.webContents.executeJavaScript(s,true),delay=(ms:number)=>new Promise(r=>setTimeout(r,ms));let proto:BrowserWindow|undefined
 const until=async(f:()=>any)=>{const end=Date.now()+20000;while(!await f()){if(Date.now()>end)throw Error('VISUAL_TIMEOUT');await delay(30)}}
 const capture=async(window:BrowserWindow,name:string)=>{window.show();app.focus({steal:true});window.focus();await window.webContents.executeJavaScript('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(true))))');writeFileSync(join(dir,name+'.png'),(await window.webContents.capturePage()).toPNG())}
 const metrics=`(()=>{const selectors=['.outer','.app','.sidebar','.header','.workbar','.terminal-stage','.drawer','.tools','.pane-head','.pane-foot'];return {viewport:{w:innerWidth,h:innerHeight,dpr:devicePixelRatio},nodes:Object.fromEntries(selectors.map(s=>{const n=document.querySelector(s),r=n.getBoundingClientRect(),c=getComputedStyle(n);return [s,{x:r.x,y:r.y,w:r.width,h:r.height,padding:c.padding,borderRadius:c.borderRadius,background:c.backgroundColor,fontSize:c.fontSize}]}))}})()`
 try{
  win.setContentSize(1440,900);await until(()=>js(`document.querySelector('.terminal-pane')?.dataset.state==='running'`));await js(`document.querySelector('[aria-label="外观与设置"]').click()`);await js(`(()=>{const n=document.querySelector('[aria-label="外观主题"]');n.value='light';n.dispatchEvent(new Event('change',{bubbles:true}))})()`);await until(()=>js(`document.documentElement.dataset.theme==='light'`));await js(`[...document.querySelectorAll('button')].find(n=>n.textContent.trim()==='完成').click()`)
  await capture(win,'application-startup')
  await js(`[...document.querySelectorAll('button')].find(n=>n.textContent.trim()==='向右分屏').click()`);await until(()=>js(`document.querySelectorAll('.terminal-pane[data-state=running]').length===2`));await js(`document.querySelector('[aria-label="今日待办"]').click()`);await delay(200)
  proto=new BrowserWindow({width:1440,height:900,useContentSize:true,webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true,partition:'prototype-selfcheck'}});proto.setMenu(null);await proto.loadFile(prototype)
  await proto.webContents.executeJavaScript(`theme='light';fontSize=14;density='comfortable';applyAppearance();document.querySelector('#addWorkspace').click();document.querySelector('#newWorkspaceName').value='终端';document.querySelector('#newWorkspacePath').value=${JSON.stringify(home)};document.querySelector('#workspaceLayout').value='right';document.querySelector('#newWorkspaceName').form.requestSubmit();document.querySelector('#toast').hidden=true;true`)
  const a=await js(metrics),b=await proto.webContents.executeJavaScript(metrics)
  for(const selector of Object.keys(a.nodes))for(const key of ['w','h','padding','borderRadius','background','fontSize'])assert.equal(a.nodes[selector][key],b.nodes[selector][key],selector+':'+key)
  await capture(win,'application-matched');await capture(proto,'prototype-matched')
  writeFileSync(join(dir,'visual.json'),JSON.stringify({status:'pass',conditions:{content:[1440,900],dpr:1,fontSize:14,theme:'light',layout:'new right split',drawer:'explicitly opened for matched state; closed on startup'},application:a,prototype:b,scope:'outer shell equality, no fake PTY output; real text/labels/fonts may differ'},null,2))
  proto.destroy();await runtime.pty.stop();await runtime.data.stop();app.exit(0)
 }catch(error){writeFileSync(join(dir,'visual.json'),JSON.stringify({status:'fail',error:String(error)},null,2));proto?.destroy();await Promise.allSettled([runtime.pty.reclaim(),runtime.data.reclaim()]);app.exit(1)}
})
