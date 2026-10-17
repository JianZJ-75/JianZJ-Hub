import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
const root = resolve('.'), require = createRequire(import.meta.url), manifest = JSON.parse(readFileSync('.m1-scratch/latest-package.json'))
const zip = join(manifest.output, 'Workstation-M1-win32-x64.zip')
if (existsSync(zip)) throw new Error('ARCHIVE_ALREADY_EXISTS')
writeFileSync(join(manifest.output, 'START-HERE.txt'), '工作站 M1（Windows x64，未签名目录包）\r\n请完整解压 win-unpacked 目录，运行其中的 Workstation.exe。不要只复制 EXE。\r\n创建工作区时选择已有目录。窗口关闭即退出并结束受管理会话；不做托盘、不恢复进程。\r\n速记/待办/剪贴板/通知为明确标注的演示占位，未接入生产业务。\r\n人工输入法、复制粘贴、长日志与全屏程序体验仍待验收。\r\n')
const command = join(root,'node_modules/electron-winstaller/vendor/7z-x64.exe'), args = ['a','-tzip','-mx=5','-mmt=2',zip,'win-unpacked','START-HERE.txt']
const result = spawnSync(command,args,{cwd:manifest.output,encoding:'utf8',maxBuffer:8*1024*1024})
writeFileSync(join(manifest.output,'zip.stdout.log'),result.stdout||'');writeFileSync(join(manifest.output,'zip.stderr.log'),result.stderr||'')
if(result.error||result.status!==0)throw result.error||new Error('ZIP_FAILED:'+result.status)
manifest.zip={file:zip,bytes:statSync(zip).size,sha256:createHash('sha256').update(readFileSync(zip)).digest('hex')}
writeFileSync(join(manifest.output,'manifest.json'),JSON.stringify(manifest,null,2));writeFileSync(join(root,'.m1-scratch/latest-package.json'),JSON.stringify(manifest,null,2))
console.log(JSON.stringify(manifest.zip,null,2))
