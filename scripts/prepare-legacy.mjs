import { copyFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const publicDirectory = resolve(projectRoot, 'public')
const vendorDirectory = resolve(publicDirectory, 'vendor')

await mkdir(vendorDirectory, { recursive: true })
await Promise.all([
  copyFile(resolve(projectRoot, 'legacy/dashboard.html'), resolve(publicDirectory, 'dashboard.html')),
  copyFile(resolve(projectRoot, 'legacy/dashboard-store.js'), resolve(publicDirectory, 'dashboard-store.js')),
  copyFile(resolve(projectRoot, 'legacy/api.js'), resolve(publicDirectory, 'api.js')),
  copyFile(resolve(projectRoot, 'node_modules/echarts/dist/echarts.min.js'), resolve(vendorDirectory, 'echarts.min.js')),
])
