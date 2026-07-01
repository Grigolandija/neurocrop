import { copyFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = resolve(projectRoot, 'node_modules/echarts/dist/echarts.min.js')
const targetDirectory = resolve(projectRoot, 'public/vendor')
const target = resolve(targetDirectory, 'echarts.min.js')

await mkdir(targetDirectory, { recursive: true })
await copyFile(source, target)
