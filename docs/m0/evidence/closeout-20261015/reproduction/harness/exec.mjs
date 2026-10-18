import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, createWriteStream, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const base=resolve(dirname(fileURLToPath(import.meta.url)),'..')
let args=process.argv.slice(2),cwd=join(base,'project')
if(args[0]==='--cwd'){cwd=args[1];args=args.slice(2)}
const [label,command,...argv]=args,dir=join(base,'evidence','commands',label)
mkdirSync(dir,{recursive:false})
const env={...process.env,npm_config_cache:join(base,'cache/npm'),npm_config_userconfig:join(base,'harness/empty.npmrc'),npm_config_globalconfig:join(base,'harness/empty-global.npmrc'),ELECTRON_BUILDER_CACHE:join(cwd,'.m0-scratch/cache/builder'),electron_config_cache:join(cwd,'.m0-scratch/cache/electron')}
for(const key of Object.keys(env))if(/^(NODE_PATH|NODE_OPTIONS|ELECTRON_(OVERRIDE_DIST_PATH|MIRROR|CUSTOM_DIR|CUSTOM_FILENAME|RUN_AS_NODE|INSTALL_PLATFORM|INSTALL_ARCH|SKIP_BINARY_DOWNLOAD)|npm_config_(build_from_source|arch|platform|target|runtime|disturl|electron.*)|electron_(mirror|use_remote_checksums))$/i.test(key))delete env[key]
const actual=command==='npm'?process.execPath:command
const actualArgs=command==='npm'?[join(dirname(process.execPath),'node_modules/npm/bin/npm-cli.js'),...argv]:argv
const record={command:[command,...argv],actual:[actual,...actualArgs],cwd,started:new Date().toISOString(),environment:{npm_config_cache:env.npm_config_cache,npm_config_userconfig:env.npm_config_userconfig,npm_config_globalconfig:env.npm_config_globalconfig,ELECTRON_BUILDER_CACHE:env.ELECTRON_BUILDER_CACHE,electron_config_cache:env.electron_config_cache}}
const out=createWriteStream(join(dir,'stdout.log.txt')),err=createWriteStream(join(dir,'stderr.log.txt'))
const child=spawn(actual,actualArgs,{cwd,env,stdio:['ignore','pipe','pipe']})
child.stdout.pipe(out);child.stderr.pipe(err)
child.once('error',error=>{record.spawnError=String(error)})
child.once('close',(code,signal)=>{record.exitCode=code;record.signal=signal;record.finished=new Date().toISOString();writeFileSync(join(dir,'command.json'),JSON.stringify(record,null,2));console.log(JSON.stringify({label,exitCode:code,signal,directory:dir}));process.exitCode=code??1})
