import fs from 'node:fs'
import path from 'node:path'
import postcss from 'postcss'

const root = process.cwd()
const write = process.argv.includes('--write')
const check = process.argv.includes('--check')
const allStyles = process.argv.includes('--all')
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.html'])
const sourceRoots = ['src', 'public']

function collectFiles(directory, extensions = sourceExtensions, files = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) collectFiles(absolute, extensions, files)
    else if (extensions.has(path.extname(entry.name))) files.push(absolute)
  }
  return files
}

const sourceFiles = sourceRoots.flatMap((directory) => collectFiles(path.join(root, directory)))
const sourceText = sourceFiles.map((file) => fs.readFileSync(file, 'utf8')).join('\n')
const cssPaths = allStyles
  ? collectFiles(path.join(root, 'src'), new Set(['.css']))
  : [path.join(root, 'src/styles/approved-dashboard.css')]
let removedRules = 0
let removedBytes = 0
let beforeBytes = 0
let afterBytes = 0
const changedFiles = []

for (const cssPath of cssPaths) {
  const original = fs.readFileSync(cssPath, 'utf8')
  const sheet = postcss.parse(original, { from: cssPath })
  let fileRemovedRules = 0

  sheet.walkRules((rule) => {
    const tokens = [...rule.selector.matchAll(/(?:^|[^\\])([.#])([_a-zA-Z][\w-]*)/g)]
      .map((match) => match[2])
    if (!tokens.length || tokens.some((token) => sourceText.includes(token))) return
    removedRules += 1
    fileRemovedRules += 1
    removedBytes += rule.toString().length
    rule.remove()
  })

  // Remove media/support blocks left empty by the rule pass.
  sheet.walkAtRules((rule) => {
    if (rule.nodes && rule.nodes.length === 0) rule.remove()
  })

  const result = sheet.toString()
  beforeBytes += Buffer.byteLength(original)
  afterBytes += Buffer.byteLength(result)
  if (fileRemovedRules) {
    changedFiles.push({ file: path.relative(root, cssPath), removedRules: fileRemovedRules })
    if (write) fs.writeFileSync(cssPath, result)
  }
}

console.log(JSON.stringify({
  sourceFiles: sourceFiles.length,
  cssFiles: cssPaths.length,
  changedFiles,
  removedRules,
  removedBytes,
  beforeBytes,
  afterBytes,
  wroteFile: write,
}, null, 2))

if (check && removedRules > 0) {
  const scope = allStyles ? 'CSS rules' : 'approved-dashboard.css rules'
  const allFlag = allStyles ? ' --all' : ''
  throw new Error(`${removedRules} unused ${scope} found. Run: node scripts/prune-unused-dashboard-css.mjs --write${allFlag}`)
}
