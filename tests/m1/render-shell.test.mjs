import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,readdirSync} from 'node:fs'
import {join} from 'node:path'
import {blockRects} from '../../src/renderer/workstation/block-glyphs.mjs'
import {gitBash,shellLaunch} from '../../src/adapters/windows/workstation/shell.ts'
test('Unicode block elements cover exact cell geometry and leave shades/text to font renderer',()=>{
 assert.deepEqual(blockRects('█'),[[0,0,1,1]]);assert.deepEqual(blockRects('▀'),[[0,0,1,.5]]);assert.deepEqual(blockRects('▐'),[[.5,0,.5,1]])
 assert.deepEqual(blockRects('▝'),[[.5,0,.5,.5]]);assert.equal(blockRects('▛').length,3);assert.deepEqual(blockRects(' '),[]);assert.equal(blockRects('A'),undefined);assert.equal(blockRects('░'),undefined)
 for(let n=0x2580;n<=0x259f;n++){for(const rect of blockRects(String.fromCodePoint(n))||[]){assert.ok(rect.every(Number.isFinite));const[x,y,w,h]=rect;assert.ok(x>=0&&y>=0&&w>0&&h>0&&x+w<=1&&y+h<=1)}}
})
test('Shell profiles discover fixed Git for Windows, never arbitrary bash from WSL or a user command',{skip:process.platform!=='win32'},()=>{
 const dir=mkdtempSync(join(process.cwd(),'.m1-scratch','shell-profile-test-'))
 try{
  const git=join(dir,'Git');mkdirSync(join(git,'bin'),{recursive:true});mkdirSync(join(git,'usr/bin'),{recursive:true});writeFileSync(join(git,'bin/bash.exe'),'test-only');writeFileSync(join(git,'usr/bin/cygpath.exe'),'test-only')
  const source={ProgramFiles:dir,Path:'C:/Windows/System32',BASH_ENV:'private-rc',ENV:'private-env',PROMPT_COMMAND:'untrusted-startup'},copy={...source}
  const detected=gitBash(source);assert.equal(detected.executable,join(git,'bin/bash.exe'));const launch=shellLaunch('git-bash',dir,dir,source)
  assert.deepEqual(source,copy);assert.equal(launch.label,'Git Bash');assert.ok(launch.args.includes('--noprofile'));assert.equal(launch.env.BASH_ENV,undefined);assert.equal(launch.env.ENV,undefined);assert.equal(launch.env.TERM_PROGRAM,'JianZJ-Hub');assert.notEqual(launch.env.TERM_PROGRAM,'WezTerm');launch.dispose();assert.ok(!readdirSync(dir).some(n=>n.endsWith('.rc')))
  assert.throws(()=>shellLaunch('cmd /c anything',dir,dir,source),/INVALID_SHELL_PROFILE/)
  assert.throws(()=>gitBash({ProgramFiles:join(dir,'missing'),Path:'C:/Windows/System32'}),/GIT_BASH_NOT_FOUND/)
 }finally{rmSync(dir,{recursive:true,force:true})}
})
test('Git Bash launch forces a UTF-8 locale when none is set, but never overrides an explicit one',{skip:process.platform!=='win32'},()=>{
 const dir=mkdtempSync(join(process.cwd(),'.m1-scratch','shell-locale-test-'))
 try{
  const git=join(dir,'Git');mkdirSync(join(git,'bin'),{recursive:true});mkdirSync(join(git,'usr/bin'),{recursive:true});writeFileSync(join(git,'bin/bash.exe'),'test-only');writeFileSync(join(git,'usr/bin/cygpath.exe'),'test-only')
  // Locale-free (packaged): readline would octal-escape CJK as \344\275\240, so we must supply one.
  const launch=shellLaunch('git-bash',dir,dir,{ProgramFiles:dir,Path:'C:/Windows/System32'})
  assert.equal(launch.env.LC_ALL,'C.UTF-8');launch.dispose()
  // An explicit UTF-8 LANG is respected; the effective locale is already UTF-8.
  const explicit=shellLaunch('git-bash',dir,dir,{ProgramFiles:dir,Path:'C:/Windows/System32',LANG:'zh_CN.UTF-8'})
  assert.equal(explicit.env.LC_ALL,undefined);assert.equal(explicit.env.LANG,'zh_CN.UTF-8');explicit.dispose()
 }finally{rmSync(dir,{recursive:true,force:true})}
})
