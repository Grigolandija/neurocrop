import { gzipSync } from 'node:zlib'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')
const assets = path.join(dist, 'assets')
const index = await readFile(path.join(dist, 'index.html'), 'utf8')
const files = await readdir(assets)

const gzipKb = (content) => gzipSync(content).byteLength / 1024
const assetContent = async (name) => await readFile(path.join(assets, name))
const entrySources = [...index.matchAll(/<script[^>]+src="\/assets\/([^"]+\.js)"/g)].map((match) => match[1])
const initialJs = new Set()

async function collectStaticImports(name) {
  if (initialJs.has(name)) return
  initialJs.add(name)
  const source = String(await assetContent(name))
  const imports = [...source.matchAll(/(?:from|import)\s*["']\.\/([^"']+\.js)["']/g)].map((match) => match[1])
  for (const dependency of imports) await collectStaticImports(dependency)
}

for (const entry of entrySources) await collectStaticImports(entry)

const initialCss = [...index.matchAll(/<link[^>]+href="\/assets\/([^"]+\.css)"/g)].map((match) => match[1])
const initialJsGzipKb = (await Promise.all([...initialJs].map(async (name) => gzipKb(await assetContent(name))))).reduce((sum, size) => sum + size, 0)
const initialCssGzipKb = (await Promise.all(initialCss.map(async (name) => gzipKb(await assetContent(name))))).reduce((sum, size) => sum + size, 0)
const chunks = await Promise.all(files.filter((name) => name.endsWith('.js')).map(async (name) => ({ name, gzipKb: gzipKb(await assetContent(name)) })))
const largestNonChartChunk = chunks.filter((chunk) => !chunk.name.startsWith('echarts-vendor-')).sort((a, b) => b.gzipKb - a.gzipKb)[0]

const limits = {
  initialJsGzipKb: 175,
  initialCssGzipKb: 80,
  largestNonChartChunkGzipKb: 115,
}
const failures = []
if (initialJsGzipKb > limits.initialJsGzipKb) failures.push(`initial JS ${initialJsGzipKb.toFixed(1)} kB > ${limits.initialJsGzipKb} kB`)
if (initialCssGzipKb > limits.initialCssGzipKb) failures.push(`initial CSS ${initialCssGzipKb.toFixed(1)} kB > ${limits.initialCssGzipKb} kB`)
if (largestNonChartChunk?.gzipKb > limits.largestNonChartChunkGzipKb) failures.push(`${largestNonChartChunk.name} ${largestNonChartChunk.gzipKb.toFixed(1)} kB > ${limits.largestNonChartChunkGzipKb} kB`)

console.log(`[bundle] initial JS: ${initialJsGzipKb.toFixed(1)} kB gzip (${[...initialJs].join(', ')})`)
console.log(`[bundle] initial CSS: ${initialCssGzipKb.toFixed(1)} kB gzip (${initialCss.join(', ')})`)
console.log(`[bundle] largest non-chart chunk: ${largestNonChartChunk?.name || 'none'} ${largestNonChartChunk?.gzipKb.toFixed(1) || '0.0'} kB gzip`)
if (failures.length) throw new Error(`Bundle budget exceeded: ${failures.join('; ')}`)
