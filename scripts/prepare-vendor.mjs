import { copyFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const source = resolve('node_modules/echarts/dist/echarts.min.js')
const target = resolve('public/vendor/echarts.min.js')

await mkdir(dirname(target), { recursive: true })
await copyFile(source, target)
