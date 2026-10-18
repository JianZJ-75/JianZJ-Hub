import { check, root } from './preparation.mjs'
try { const receipt = check(); console.log(JSON.stringify({ status: 'pass', root, checkedFiles: receipt.files.length, prepared: receipt.prepared }, null, 2)) }
catch (error) { console.error(String(error.stack || error)); process.exitCode = 1 }
