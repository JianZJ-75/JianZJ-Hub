import fs from 'node:fs'
import {join} from 'node:path'
import {createHash} from 'node:crypto'
const source='D:/Code/JianZJ-Hub',base=process.argv[2],evidence=join(source,'docs/m0/evidence/closeout-20261015')
const hash=b=>createHash('sha256').update(b).digest('hex'),manifest=[]
for(const name of ['dev','packaged','worker','crash','concurrent']){
 const p=join(source,'.m0-scratch/acceptance-'+name+'.log'),b=fs.readFileSync(p),r=JSON.parse(b),dest=join(evidence,'independent-acceptance',name)
 fs.mkdirSync(dest,{recursive:true});fs.writeFileSync(join(dest,'acceptance.log.txt'),b);manifest.push({source:p,file:`independent-acceptance/${name}/acceptance.log.txt`,bytes:b.length,sha256:hash(b),historicalOuterExitCode:'not retained',appExitCode:r.exitCode,status:r.status})
 for(const entry of fs.readdirSync(r.directory,{withFileTypes:true})){if(!entry.isFile()||!(/\.json$|\.png$|^(stdout|stderr)\.log$/.test(entry.name)))continue; const p=join(r.directory,entry.name),b=fs.readFileSync(p),name2=entry.name.endsWith('.log')?entry.name+'.txt':entry.name;fs.writeFileSync(join(dest,name2),b);manifest.push({source:p,file:`independent-acceptance/${name}/${name2}`,bytes:b.length,sha256:hash(b)})}
}
fs.writeFileSync(join(evidence,'independent-acceptance/manifest.json'),JSON.stringify(manifest,null,2))
const upstream=join(base,'intake/upstream-metadata');fs.mkdirSync(upstream)
const urls={simpleRelease:'https://api.github.com/repos/wangfenjin/simple/releases/tags/v0.7.1',electronRelease:'https://api.github.com/repos/electron/electron/releases/tags/v44.7.2',simpleLicense:'https://api.github.com/repos/wangfenjin/simple/contents/LICENSE?ref=4ed008934495fc55ff4bf6620bba58311988b23e',cppjiebaLicense:'https://api.github.com/repos/yanyiwu/cppjieba/contents/LICENSE?ref=194c144d8b5ed1baf3190d07c5226e804454ab47'}
const summary={}
for(const [name,url]of Object.entries(urls)){const response=await fetch(url);if(!response.ok)throw Error(`${url}: ${response.status}`);const text=await response.text(),r=JSON.parse(text);fs.writeFileSync(join(upstream,name+'.json'),text)
 if(r.content){const b=Buffer.from(r.content,'base64'),blob=createHash('sha1').update(Buffer.from(`blob ${b.length}\0`)).update(b).digest('hex');if(blob!==r.sha)throw Error('GIT_BLOB_MISMATCH');summary[name]={url,commit:r.html_url,gitBlob:r.sha,sha256:hash(b),bytes:b.length,downloadUrl:r.download_url};fs.writeFileSync(join(upstream,name+'.txt'),b)}
 else{const a=r.assets.find(a=>a.name===(name==='simpleRelease'?'libsimple-windows-x64.zip':'electron-v44.7.2-win32-x64.zip'));summary[name]={url,assetId:a.id,size:a.size,digest:a.digest,downloadUrl:a.browser_download_url}}
}
fs.writeFileSync(join(upstream,'summary.json'),JSON.stringify({recorded:new Date().toISOString(),...summary},null,2));console.log(JSON.stringify(summary,null,2))
