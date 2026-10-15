import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const here=dirname(fileURLToPath(import.meta.url))
const commands=[
 ['dev-normal','node','scripts/m0/run.mjs','dev','--mode=normal'],
 ['packaged-normal','node','scripts/m0/run.mjs','packaged','--mode=normal'],
 ['dev-full','npm','run','m0:run'],
 ['packaged-full','npm','run','m0:packaged'],
 ['dev-repeat','node','scripts/m0/run.mjs','dev','--mode=concurrent-exit','--repeat=2'],
 ['packaged-repeat','node','scripts/m0/run.mjs','packaged','--mode=concurrent-exit','--repeat=2']
]
for(const command of commands){const r=spawnSync(process.execPath,[join(here,'exec.mjs'),...command],{stdio:'inherit'});if(r.status!==0){process.exitCode=r.status??1;break}}
