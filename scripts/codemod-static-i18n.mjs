import fs from 'node:fs/promises'
import path from 'node:path'
import ts from 'typescript'

const sourceRoot = path.resolve('src')
const translatableAttributes = new Set(['placeholder', 'title', 'aria-label'])
const dictionarySource = await fs.readFile(path.join(sourceRoot, 'i18n.lt.ts'), 'utf8')
const additionalDictionarySource = await fs.readFile(path.join(sourceRoot, 'i18n.additional.lt.ts'), 'utf8')
const dictionary = {
  ...JSON.parse(dictionarySource.slice(
  dictionarySource.indexOf('Object.freeze(') + 'Object.freeze('.length,
  dictionarySource.lastIndexOf(')'),
  )),
  ...Function(`"use strict"; return (${
    additionalDictionarySource.slice(
      additionalDictionarySource.indexOf('Object.freeze(') + 'Object.freeze('.length,
      additionalDictionarySource.lastIndexOf(')'),
    )
  })`)(),
}

async function collect(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await collect(target))
    else if (entry.name.endsWith('.tsx')) files.push(target)
  }
  return files
}

function importPath(file) {
  let relative = path.relative(path.dirname(file), path.join(sourceRoot, 'i18n')).replaceAll(path.sep, '/')
  if (!relative.startsWith('.')) relative = `./${relative}`
  return relative
}

let changed = 0
for (const file of await collect(sourceRoot)) {
  const original = await fs.readFile(file, 'utf8')
  const sourceFile = ts.createSourceFile(file, original, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const replacements = []
  const localizeRenderableExpression = (expression) => {
    if (ts.isStringLiteral(expression) && dictionary[expression.text]) {
      replacements.push({
        start: expression.pos,
        end: expression.end,
        text: `tx(${JSON.stringify(expression.text)})`,
      })
      return
    }
    if (ts.isConditionalExpression(expression)) {
      localizeRenderableExpression(expression.whenTrue)
      localizeRenderableExpression(expression.whenFalse)
      return
    }
    if (ts.isParenthesizedExpression(expression)) {
      localizeRenderableExpression(expression.expression)
      return
    }
    if (
      ts.isBinaryExpression(expression)
      && (
        expression.operatorToken.kind === ts.SyntaxKind.BarBarToken
        || expression.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
      )
    ) {
      localizeRenderableExpression(expression.right)
    }
  }
  const visit = (node) => {
    if (ts.isJsxText(node)) {
      const raw = original.slice(node.pos, node.end)
      const value = raw.trim()
      if (value && dictionary[value]) {
        const leading = raw.slice(0, raw.indexOf(value))
        const trailing = raw.slice(raw.indexOf(value) + value.length)
        replacements.push({ start: node.pos, end: node.end, text: `${leading}{tx(${JSON.stringify(value)})}${trailing}` })
      }
    } else if (
      ts.isJsxAttribute(node)
      && translatableAttributes.has(node.name.text)
      && node.initializer
      && ts.isStringLiteral(node.initializer)
      && dictionary[node.initializer.text]
    ) {
      replacements.push({
        start: node.initializer.pos,
        end: node.initializer.end,
        text: `{tx(${JSON.stringify(node.initializer.text)})}`,
      })
    } else if (ts.isJsxExpression(node) && !ts.isJsxAttribute(node.parent) && node.expression) {
      localizeRenderableExpression(node.expression)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  if (!replacements.length) continue
  let source = original
  for (const replacement of replacements.sort((left, right) => right.start - left.start)) {
    source = `${source.slice(0, replacement.start)}${replacement.text}${source.slice(replacement.end)}`
  }
  if (source === original) continue
  if (!source.includes('translateInterfaceText as tx')) {
    source = `import { translateInterfaceText as tx } from '${importPath(file)}'\n${source}`
  }
  await fs.writeFile(file, source)
  changed += 1
  console.log(path.relative(process.cwd(), file))
}

console.log(`Localized static JSX in ${changed} files.`)
