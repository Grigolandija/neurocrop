import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const read = (file) => fs.readFile(path.join(root, file), 'utf8')
const app = await read('src/App.tsx')
const dashboard = await read('src/pages/DashboardPage.tsx')
const login = await read('src/components/LoginScreen.tsx')
const shell = await read('src/components/DashboardShell.tsx')
const main = await read('src/main.tsx')
const apiClient = await read('src/services/api/client.ts')
const neurocropApi = await read('src/services/api/neurocropApi.ts')
const overview = await read('src/features/overview/OverviewWorkspace.tsx')
const trends = await read('src/features/trends/TrendsWorkspace.tsx')
const sections = await read('src/features/sections/SectionsWorkspace.tsx')
const nodes = await read('src/features/nodes/NodesWorkspace.tsx')
const store = await read('src/state/dashboardStore.ts')
const sourceFiles = (await fs.readdir(path.join(root, 'src'), { recursive: true }))
  .filter((file) => /\.(ts|tsx)$/.test(file))
const source = (await Promise.all(sourceFiles.map((file) => read(path.join('src', file))))).join('\n')

const failures = []
const assert = (condition, message) => { if (!condition) failures.push(message) }

assert(dashboard.includes('<DashboardShell'), 'DashboardPage must render the React DashboardShell.')
assert(app.includes('if (!user) return <LoginScreen'), 'The login screen must render before authenticated workspace loading.')
assert(app.includes('<Suspense fallback={<WorkspaceLoading />}>'), 'Workspace loading must be scoped to the authenticated dashboard.')
assert(!dashboard.includes('if (!bootstrapped)'), 'DashboardPage must not block the login screen while workspace modules preload.')
assert(!login.includes('prefetchWorkspaceData'), 'Login must transition before workspace data prefetching starts.')
assert(!dashboard.includes('?raw'), 'DashboardPage must not inject raw HTML.')
assert(!dashboard.includes('createPortal'), 'Dashboard workspaces must not use legacy DOM portals.')
assert(dashboard.includes("'/nodes': 'nodesManagementSection'"), 'The Nodes workspace host must preserve its scoped styling contract.')
assert(dashboard.includes('data-workspace-suspense'), 'Workspace readiness must track only unresolved lazy modules.')
assert(dashboard.includes('data-overview-heatmap-settled="true"'), 'The authenticated loader must wait for the Overview heatmap to finish rendering.')
assert(!dashboard.includes("host.querySelector('[aria-busy=\"true\"]')"), 'Nested data loaders must not block the authenticated workspace shell.')
assert(main.includes("'vite:preloadError'"), 'The application must recover when a deployment removes a stale lazy chunk.')
assert(apiClient.includes('await sessionHasEnded()'), 'A single protected endpoint must not sign out a still-valid session.')
assert(overview.includes('ReadingsClimateMap'), 'Overview must retain its live climate map.')
assert(!overview.includes('key={model.areaId}'), 'Area switching must not remount the full climate map.')
assert(trends.includes("location.pathname === '/history'"), 'A hidden Trends workspace must not overwrite the active Area.')
assert(shell.includes('useInterfaceLanguage'), 'DashboardShell must own the language control.')
assert(shell.includes('useNavigate'), 'DashboardShell must own navigation.')
assert(store.includes('useSyncExternalStore'), 'Shared dashboard state must expose a React external store.')
assert(sections.includes('[location.pathname, refreshToken]'), 'Sections must refresh when navigation follows Area creation.')
assert(nodes.includes('[location.pathname, refreshToken]'), 'Nodes must refresh its Section choices when the page is opened.')
assert(!store.includes('structureVersion'), 'Structural mutations must not re-render every mounted workspace through global state.')
assert(!source.includes('notifyWorkspaceStructureChanged'), 'Structural mutations must refresh locally or on navigation, not broadcast globally.')
assert(neurocropApi.includes('const structuralMutation'), 'Structural mutations must clear GET cache entries after the server commit.')
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
