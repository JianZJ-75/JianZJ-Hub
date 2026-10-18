import { app, dialog } from 'electron'
import { mkdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { startWorkstation } from './workstation/app'
if (process.env.JIANZJ_M1_DATA) {
  const directory=resolve(process.env.JIANZJ_M1_DATA),home=join(directory,'isolated-home');mkdirSync(home,{recursive:true})
  app.setPath('userData',directory);app.setPath('home',home)
}
app.whenReady().then(() => startWorkstation(__dirname)).catch(error => { dialog.showErrorBox('工作站启动失败', String(error)); app.exit(1) })
