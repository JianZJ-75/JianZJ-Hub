import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
export default defineConfig({
  main: { build: { outDir: 'out/m1/main', rollupOptions: { input: {
    ...(process.env.M1_TEST_BUILD ? { probe: resolve('tests/m1/probe.ts'), desktop: resolve('tests/m1/desktop.ts'), stress: resolve('tests/m1/stress.ts'), fault: resolve('tests/m1/fault.ts'), tui: resolve('tests/m1/tui.ts'), bash: resolve('tests/m1/bash.ts'), visual: resolve('tests/m1/visual.ts'), paste: resolve('tests/m1/paste.ts') } : {}),
    index: resolve('src/main/m1.ts'), 'pty-service': resolve('src/services/pty/workstation/broker.ts'),
    'pty-worker': resolve('src/services/pty/workstation/worker.ts'), 'conout-reader': resolve('src/adapters/windows/workstation/conout-reader.ts'),
    'data-service': resolve('src/services/data/workstation.ts'), 'job-adapter': resolve('src/adapters/windows/job-object.ts')
  } } } },
  preload: { build: { outDir: 'out/m1/preload', rollupOptions: { input: resolve('src/preload/workstation.ts') } } },
  renderer: { root: 'src/renderer/workstation', plugins: [react()], build: { outDir: resolve('out/m1/renderer'), rollupOptions: { input: resolve('src/renderer/workstation/index.html') } } }
})
