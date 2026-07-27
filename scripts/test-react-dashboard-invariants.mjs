import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const read = (file) => fs.readFile(path.join(root, file), 'utf8')
const dashboard = await read('src/pages/DashboardPage.tsx')
const shell = await read('src/components/DashboardShell.tsx')
const store = await read('src/state/dashboardStore.ts')
const sourceFiles = (await fs.readdir(path.join(root, 'src'), { recursive: true }))
  .filter((file) => /\.(ts|tsx)$/.test(file))
const source = (await Promise.all(sourceFiles.map((file) => read(path.join('src', file))))).join('\n')

const failures = []
const assert = (condition, message) => { if (!condition) failures.push(message) }

assert(dashboard.includes('<DashboardShell'), 'DashboardPage must render the React DashboardShell.')
assert(!dashboard.includes('?raw'), 'DashboardPage must not inject raw HTML.')
assert(!dashboard.includes('createPortal'), 'Dashboard workspaces must not use legacy DOM portals.')
assert(dashboard.includes("'/nodes': 'nodesManagementSection'"), 'The Nodes workspace host must preserve its scoped styling contract.')
assert(shell.includes('useInterfaceLanguage'), 'DashboardShell must own the language control.')
assert(shell.includes('useNavigate'), 'DashboardShell must own navigation.')
assert(store.includes('useSyncExternalStore'), 'Shared dashboard state must expose a React external store.')
assert(!source.includes("CustomEvent('neurocrop:"), 'React source must not use NeuroCrop CustomEvent messaging.')
assert(!source.includes('window.postMessage({'), 'React source must not use postMessage for internal navigation.')
assert(!source.includes('NeuroCropI18n'), 'React source must not depend on the legacy DOM translator.')
assert(!source.includes('approved-dashboard-runtime'), 'React source must not load the legacy dashboard runtime.')

const retired = [
  'src/approved-dashboard-markup.html',
  'public/approved-dashboard-runtime.js',
  'public/neurocrop-state-engine.js',
  'public/neurocrop-dashboard-store.js',
  'public/neurocrop-i18n-lt.js',
]
for (const file of retired) {
  assert(!(await fs.stat(path.join(root, file)).then(() => true).catch(() => false)), `${file} must remain removed.`)
}

if (failures.length) {
  failures.forEach((failure) => console.error(`FAIL: ${failure}`))
  process.exitCode = 1
} else {
  console.log('React dashboard architecture invariants passed.')
}
