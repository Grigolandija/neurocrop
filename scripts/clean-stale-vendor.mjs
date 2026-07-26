import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'

await rm(resolve('public/vendor/echarts.min.js'), { force: true })
