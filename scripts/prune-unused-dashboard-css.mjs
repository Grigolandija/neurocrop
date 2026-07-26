import fs from 'node:fs'
import path from 'node:path'
import postcss from 'postcss'

const root = process.cwd()
const cssPath = path.join(root, 'src/styles/approved-dashboard.css')
const write = process.argv.includes('--write')
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.html'])
const sourceRoots = ['src', 'public']

function collectFiles(directory, files = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) collectFiles(absolute, files)
    else if (sourceExtensions.has(path.extname(entry.name))) files.push(absolute)
  }
  return files
}

const sourceFiles = sourceRoots.flatMap((directory) => collectFiles(path.join(root, directory)))
const sourceText = sourceFiles.map((file) => fs.readFileSync(file, 'utf8')).join('\n')
const original = fs.readFileSync(cssPath, 'utf8')
const sheet = postcss.parse(original, { from: cssPath })
let removedRules = 0
let removedBytes = 0

sheet.walkRules((rule) => {
  const tokens = [...rule.selector.matchAll(/(?:^|[^\\])([.#])([_a-zA-Z][\w-]*)/g)]
    .map((match) => match[2])
  if (!tokens.length || tokens.some((token) => sourceText.includes(token))) return
  removedRules += 1
  removedBytes += rule.toString().length
  rule.remove()
})

// Remove media/support blocks left empty by the rule pass.
sheet.walkAtRules((rule) => {
  if (rule.nodes && rule.nodes.length === 0) rule.remove()
})

const result = sheet.toString()
if (write) fs.writeFileSync(cssPath, result)

console.log(JSON.stringify({
  sourceFiles: sourceFiles.length,
  removedRules,
  removedBytes,
  beforeBytes: Buffer.byteLength(original),
  afterBytes: Buffer.byteLength(result),
  wroteFile: write,
}, null, 2))
