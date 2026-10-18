import {readFileSync,writeFileSync} from 'node:fs'
const s=readFileSync('scripts/m1/packaged-test.mjs','utf8'),i=s.indexOf('try {\n  const target = await launch');if(i<0)throw Error('PREFIX_MISSING');const prefix=s.slice(0,i).replace("join(root, '.m1-scratch', 'packaged-' + randomUUID())","join(root, '.m1-scratch', 'terminal-first-view-' + randomUUID())")
const body=String.raw`
try {
 await launch('first');await screenshot('startup')
 const before=await js('window.workstation.load()');assert.equal(before.workspaces.length,0);assert.equal(await js('!!document.querySelector(".drawer")'),false)
 await js("window.__out='';window.workstation.onTerminal(e=>{if(e.type==='data')window.__out=(window.__out+e.data).slice(-524288)});true")
 const sample="cls; Write-Output 'PowerShell  /  Terminal sample'; Write-Output ''; Write-Output 'English 0123456789  ABCDEFGHIJKLMNOPQRSTUVWXYZ'; Write-Output '中文对齐  全角字符  混合 ABC 123'; Write-Output ('0123456789'*8); Write-Output ''; [Console]::Write([char]27+'[32mSUCCESS'+[char]27+'[0m  '+[char]27+'[31mERROR'+[char]27+'[0m'); Write-Output ''; Write-Output 'PS > '; [Console]::Write([char]27+']1337;SAMPLE_READY'+[char]7); Start-Sleep -Seconds 90"
 const code="Invoke-Expression ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('"+Buffer.from(sample).toString('base64')+"')))"
 await send('Page.bringToFront');await js("document.querySelector('.terminal-pane textarea').focus()")
 for(const text of code)await send('Input.dispatchKeyEvent',{type:'char',text})
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13})
 await until(()=>js("window.__out.includes('SAMPLE_READY')"))
 const metrics=await js(CODETICK(()=>{const n=document.querySelector('.terminal-pane');let f=n[Object.keys(n).find(k=>k.startsWith('__reactFiber'))];while(f&&!f.memoizedProps?.pane)f=f.return;const p=f.memoizedProps.pane,t=p.term;const r=document.querySelector('.terminal-slot').getBoundingClientRect();return {slot:{x:r.x,y:r.y,width:r.width,height:r.height},viewport:{w:innerWidth,h:innerHeight,dpr:devicePixelRatio},font:t.options.fontFamily,fontSize:t.options.fontSize,cell:t._core._renderService.dimensions.css.cell,grid:{cols:t.cols,rows:t.rows},applied:p.dimensions,defaultTerminal:document.querySelector('.breadcrumb h2').textContent,drawer:!!document.querySelector('.drawer')}})()CODETICK)
 await screenshot('sample-light');const crop=await send('Page.captureScreenshot',{format:'png',clip:{...metrics.slot,scale:1}});writeFileSync(join(directory,'terminal-crop.png'),Buffer.from(crop.data,'base64'))
 const handles=job.pids().filter(pid=>pid!==mainHandle.pid).map(pid=>new ProcessHandle(pid,false));tracked.push(...handles)
 await js('window.workstation.quit()');const {invokeOwnDialog}=await import('../../scripts/m1/native-dialog.mjs');await invokeOwnDialog(mainHandle,'结束全部终端并退出');const codeExit=await waitExit(exitPromise);assert.equal(codeExit,0);await until(()=>job.pids(),p=>p.length===0)
 writeFileSync(join(directory,'view.json'),JSON.stringify({status:'pass',metrics,scope:'fresh home shell, no project, no restored process, same synthetic sample as WezTerm',remaining:job.pids()},null,2));writeFileSync(join(root,'.m1-scratch/terminal-first-reference/application-view.json'),JSON.stringify({directory,metrics},null,2));console.log(JSON.stringify({directory,metrics}))
} catch(error){console.error(error);process.exitCode=1}finally{socket?.close();for(const w of pending.values())clearTimeout(w.timer);pending.clear();if(job.pids().length)await job.terminate();for(const h of tracked)h.dispose();job.dispose();await controlJob.terminate();controlHandle.dispose();controlJob.dispose()}
`
writeFileSync('.m1-scratch/terminal-first-reference/application.mjs',prefix+body.replaceAll('CODETICK',String.fromCharCode(96)))
