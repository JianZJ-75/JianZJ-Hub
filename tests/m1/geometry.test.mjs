import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { lineGeometry, minimumPane, ResizeQueue } from '../../src/renderer/workstation/geometry.mjs'
mkdirSync(join(process.cwd(), '.m1-scratch'), { recursive: true })
import { shellEnvironment } from '../../src/adapters/windows/workstation/cli-environment.mjs'
for (const dpr of [1,1.25,1.5,2]) test(`CSS target line height maps to xterm device grid at DPR ${dpr} without changing font size`,()=>{
  for(const fontSize of [12,14,18])for(const density of ['comfortable','compact']){
    const charHeight=Math.ceil(fontSize*17/14*dpr),g=lineGeometry(fontSize,density,dpr,charHeight)
    assert.equal(Math.floor(charHeight*g.lineHeight),g.deviceHeight)
    assert.ok(Math.abs(g.cssHeight-g.targetCssHeight)<=.5/dpr+.001)
    if(fontSize===14&&density==='comfortable'&&dpr===1){assert.equal(g.deviceHeight,19);assert.ok(Math.abs(g.targetCssHeight-18.9)<1e-10);assert.notEqual(g.lineHeight,1.85)}
  }
})
test('zero/unavailable glyph metrics do not produce a fake geometry',()=>{for(const v of [0,NaN,undefined])assert.equal(lineGeometry(14,'comfortable',1,v),undefined);assert.ok(minimumPane(14,'comfortable').height>minimumPane(14,'compact').height)})
const turn=()=>new Promise(r=>setImmediate(r))
test('resize applies serially, coalesces intermediate sizes and never displays an old reply as the newest size',async()=>{
  const sent=[],resolve=[],q=new ResizeQueue(size=>{sent.push(size);return new Promise(r=>resolve.push(r))})
  q.initialize({cols:80,rows:24});q.request({cols:46,rows:20});q.request({cols:57,rows:20});q.request({cols:104,rows:24})
  assert.equal(sent.length,1);assert.equal(q.pending,true);assert.deepEqual(q.applied,{cols:80,rows:24})
  resolve.shift()();await turn();assert.deepEqual(q.applied,{cols:46,rows:20});assert.deepEqual(sent[1],{cols:104,rows:24});assert.equal(q.pending,true)
  resolve.shift()();await turn();assert.deepEqual(q.applied,q.desired);assert.equal(q.pending,false);q.request({cols:104,rows:24});assert.equal(sent.length,2)
})
test('resize failure stays unconfirmed and disposal ignores late replies',async()=>{
  const q=new ResizeQueue(async()=>{throw Error('INJECTED_RESIZE_FAILED')});q.initialize({cols:80,rows:24});q.request({cols:46,rows:20});await turn();assert.equal(q.applied.cols,80);assert.match(q.error,/INJECTED/)
  let done;const next=new ResizeQueue(()=>new Promise(r=>done=r));next.initialize({cols:80,rows:24});next.request({cols:46,rows:20});next.dispose();done();await turn();assert.equal(next.applied.cols,80)
})
test('application Shell PATH prefers only an existing native Claude install and preserves environment/key case',{skip:process.platform!=='win32'},()=>{
  const dir=mkdtempSync(join(process.cwd(),'.m1-scratch','cli-env-test-'))
  try{
    const npm=join(dir,'npm'),bin=join(npm,'node_modules/@anthropic-ai/claude-code/bin');mkdirSync(bin,{recursive:true});writeFileSync(join(bin,'claude.exe'),'MZ-test-fixture-not-executable')
    const source={Path:`"${npm}";C:\\Windows\\System32`,OTHER:'non-sensitive-test'},before={...source},result=shellEnvironment(source)
    assert.deepEqual(source,before);assert.equal(result.env.Path.split(';')[0],bin);assert.equal(result.env.PATH,undefined);assert.equal(result.env.OTHER,source.OTHER);assert.equal(result.claudeExecutable,join(bin,'claude.exe'))
    const again=shellEnvironment(result.env);assert.equal(again.env.Path.split(';').filter(s=>s===bin).length,1)
    assert.deepEqual(shellEnvironment({Path:dir}).env,{Path:dir});assert.equal(shellEnvironment(source,'linux').claudeExecutable,null)
    assert.equal(result.env.PSExecutionPolicyPreference,undefined)
  }finally{rmSync(dir,{recursive:true,force:true})}
})
