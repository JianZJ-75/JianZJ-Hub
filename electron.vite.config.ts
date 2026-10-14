import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
export default defineConfig({
  main: { build: { rollupOptions: { input: { index: resolve('src/main/index.ts'), 'pty-service': resolve('src/services/pty/m0.ts'), 'pty-session': resolve('src/services/pty/session.m0.ts'), 'data-service': resolve('src/services/data/m0.ts'), 'job-adapter': resolve('src/adapters/windows/job-object.ts') } } } },
  preload: { build: { rollupOptions: { input: resolve('src/preload/index.ts') } } },
  renderer: { plugins: [react()], build: { rollupOptions: { input: resolve('src/renderer/index.html') } } }
})
