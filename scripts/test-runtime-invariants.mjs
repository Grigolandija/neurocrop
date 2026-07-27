import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (file) => fs.readFile(path.join(root, file), 'utf8')
const source = Object.fromEntries(await Promise.all([
  'public/approved-dashboard-runtime.js',
  'public/neurocrop-dashboard-store.js',
  'public/neurocrop-i18n-lt.js',
  'public/.htaccess',
  'src/App.tsx',
  'src/pages/DashboardPage.tsx',
  'src/approved-dashboard-markup.html',
  'src/services/api/client.ts',
  'src/services/api/neurocropApi.ts',
  'src/features/overview/OverviewWorkspace.tsx',
  'src/features/areas/AreasWorkspace.tsx',
  'src/features/sections/SectionsWorkspace.tsx',
  'src/features/nodes/NodesWorkspace.tsx',
  'src/features/readings/ReadingsWorkspace.tsx',
  'src/features/readings/ReadingsClimateMap.tsx',
  'src/features/greenhouse-map/services/areaMapRepository.ts',
  'src/features/trends/TrendsWorkspace.tsx',
  'src/features/trends/sharedTrendChart.ts',
  'src/features/alerts/AlertsWorkspace.tsx',
  'src/features/actions/ActionsWorkspace.tsx',
  'src/features/settings/CropProfilesWorkspace.tsx',
  'src/features/settings/SettingsWorkspace.tsx',
  'src/features/settings/OrganizationWorkspace.tsx',
  'src/features/settings/AdminWorkspace.tsx',
  'src/features/settings/AdminIntegrationsWorkspace.tsx',
].map(async (file) => [file, await read(file)])))

const runtime = source['public/approved-dashboard-runtime.js']
const dashboard = source['src/pages/DashboardPage.tsx']
const markup = source['src/approved-dashboard-markup.html']
const apiClient = source['src/services/api/client.ts']
const api = source['src/services/api/neurocropApi.ts']
let failures = 0

function assert(condition, message) {
  if (condition) return
  failures += 1
  console.error(`FAIL ${message}`)
}

const workspaces = [
  ['overview', 'OverviewWorkspace', 'overviewWorkspaceMount'],
  ['areas', 'AreasWorkspace', 'areasWorkspaceMount'],
  ['sections', 'SectionsWorkspace', 'sectionsWorkspaceMount'],
  ['nodes', 'NodesWorkspace', 'nodesManagementSection'],
  ['readings', 'ReadingsWorkspace', 'readingsWorkspaceMount'],
  ['trends', 'TrendsWorkspace', 'trendsWorkspaceMount'],
  ['alerts', 'AlertsWorkspace', 'alertsManagementSection'],
  ['actions', 'ActionsWorkspace', 'actionsWorkspaceMount'],
  ['crop profiles', 'CropProfilesWorkspace', 'cropProfilesWorkspaceMount'],
  ['settings', 'SettingsWorkspace', 'settingsWorkspaceMount'],
  ['organisation', 'OrganizationWorkspace', 'organizationWorkspaceMount'],
  ['admin', 'AdminWorkspace', 'adminWorkspaceMount'],
  ['admin integrations', 'AdminIntegrationsWorkspace', 'adminIntegrationsMount'],
  ['simulator', 'SimulatorWorkspace', 'simulatorWorkspaceMount'],
]

for (const [label, component, mount] of workspaces) {
  assert(
    dashboard.includes(`const load${component} = () => import(`)
      && dashboard.includes(`const ${component} = lazy(load${component})`)
      && markup.includes(`id="${mount}"`),
    `${label} must remain a lazy React workspace with a stable mount`,
  )
}

assert(
  dashboard.includes('allWorkspacePreloaders')
    && dashboard.includes('Promise.all(allWorkspacePreloaders.map')
    && dashboard.includes('await prefetchWorkspaceData()')
    && dashboard.includes('if (!dashboardReady)')
    && !dashboard.includes('requestIdleCallback'),
  'every workspace module and shared API payload must finish loading before the dashboard is shown',
)
assert(
  dashboard.includes('const [allWorkspacesReady, setAllWorkspacesReady]')
    && dashboard.includes('mount.childElementCount > 0')
    && dashboard.includes("!mount.querySelector('[aria-busy=\"true\"]')")
    && dashboard.includes('hidden={!allWorkspacesReady}')
    && !dashboard.includes("location.pathname === '/readings' && readingsMount")
    && !dashboard.includes("location.pathname === '/areas' && areasMount"),
  'every React workspace must stay mounted and finish its initial data load before the dashboard becomes visible',
)
assert(
  dashboard.includes("attributeFilter: ['hidden', 'style']")
    && dashboard.includes("element.style.setProperty('display', 'none', 'important')"),
  'React route ownership must resist delayed legacy visibility changes',
)
assert(
  source['src/App.tsx'].includes("lazy(() => import('./pages/DashboardPage'))")
    && source['src/App.tsx'].includes('<Suspense fallback='),
  'the authenticated application shell must remain code-split',
)
assert(
  dashboard.includes("import '../styles/approved-dashboard.css'")
    && source['src/features/nodes/NodesWorkspace.tsx'].includes("import '../../styles/nodes-page.css'")
    && source['src/features/settings/CropProfilesWorkspace.tsx'].includes("import '../../styles/redesign-profiles.css'"),
  'large feature styles must stay with their route chunks',
)

const featureContracts = [
  ['areas', ['getDashboard()', 'getAreas()', 'getSections()', 'getNodes()', 'createArea(', 'updateArea(', 'deleteArea(']],
  ['sections', ['getAreas()', 'getSections()', 'getNodes()', 'getCropProfiles()', 'createSection(', 'updateSection(', 'deleteSection(']],
  ['nodes', ['getAreas()', 'getSections()', 'getNodes()', 'getNodeSensors(', 'updateNode(', 'deleteNode(']],
  ['readings', ['getLatestReadings(', 'getHistory({', 'exportCsv()', 'renderTrendChart']],
  ['trends', ['getAreas()', 'getSections()', 'getNodes()', 'getHistory({', 'renderTrendChart', 'Compare Sections']],
  ['alerts', ["getAlerts('all')", 'acknowledgeAlert(', 'snoozeAlert(']],
  ['actions', ['getTodayActions()', 'getActionHistory(', 'submitTodayActionFeedback(']],
  ['overview', ['getDashboard()', 'getTodayActions()', 'getCropProfiles()', 'getLatestReadings(']],
]
const featureFiles = {
  areas: 'src/features/areas/AreasWorkspace.tsx',
  sections: 'src/features/sections/SectionsWorkspace.tsx',
  nodes: 'src/features/nodes/NodesWorkspace.tsx',
  readings: 'src/features/readings/ReadingsWorkspace.tsx',
  trends: 'src/features/trends/TrendsWorkspace.tsx',
  alerts: 'src/features/alerts/AlertsWorkspace.tsx',
  actions: 'src/features/actions/ActionsWorkspace.tsx',
  overview: 'src/features/overview/OverviewWorkspace.tsx',
}
for (const [feature, tokens] of featureContracts) {
  const contents = source[featureFiles[feature]]
  for (const token of tokens) {
    assert(contents.includes(token), `${feature} must retain its live ${token} workflow`)
  }
}

assert(
  source['src/features/trends/TrendsWorkspace.tsx'].includes('selectedNodes.map')
    && source['src/features/trends/TrendsWorkspace.tsx'].includes('devEui: node.devEui')
    && source['src/features/trends/TrendsWorkspace.tsx'].includes('Section median'),
  'node comparison must request independent node histories and retain the section median',
)
assert(
  source['src/services/api/neurocropApi.ts'].includes('getGreenhouseMapHistory:')
    && source['src/features/greenhouse-map/services/areaMapRepository.ts'].includes('loadHistory(areaId: string)')
    && source['src/features/readings/ReadingsClimateMap.tsx'].includes('24-hour history')
    && source['src/features/readings/ReadingsClimateMap.tsx'].includes('type="range"')
    && source['src/features/readings/ReadingsClimateMap.tsx'].includes('togglePlayback')
    && source['src/features/readings/ReadingsClimateMap.tsx'].includes('historyLayout?.map || context.map')
    && source['src/features/greenhouse-map/services/areaMapRepository.ts'].includes('layouts: Array.isArray(payload.layouts)'),
  'the read-only climate map must retain its 24-hour historical playback controls',
)
assert(
  source['src/features/trends/sharedTrendChart.ts'].includes('calculateTimeAwareEwma')
    && source['src/features/trends/sharedTrendChart.ts'].includes('getTrendAxisDomain')
    && source['src/features/trends/sharedTrendChart.ts'].includes('metricColorTokens'),
  'trend charts must retain time-aware smoothing, readable axes and metric colors',
)

assert(
  apiClient.includes("credentials: 'include'")
    && apiClient.includes('requestSignal(options.signal, 15_000)')
    && apiClient.includes('notifyUnauthorized()')
    && apiClient.includes('readResponseBody(response: Response)'),
  'API transport must retain authentication, cancellation, timeout and structured error handling',
)
for (const method of [
  'getDashboard:', 'getAreas:', 'getSections:', 'getNodes:', 'getAlerts:', 'getHistory:',
  'getLatestReadings:', 'getCropProfiles:', 'getTodayActions:', 'getActionHistory:',
]) {
  assert(api.includes(method), `API facade must expose ${method.slice(0, -1)}`)
}

for (const header of [
  'Strict-Transport-Security',
  'X-Content-Type-Options',
  'X-Frame-Options',
  'Referrer-Policy',
  'Permissions-Policy',
]) {
  assert(source['public/.htaccess'].includes(`Header always set ${header}`), `${header} must remain configured`)
}
assert(
  markup.includes('class="skip-to-content"')
    && markup.includes('id="dashboardMain"')
    && markup.includes('aria-live="assertive"')
    && markup.includes('autocomplete="current-password"'),
  'the shell must retain keyboard, announcement and autofill accessibility',
)
assert(
  source['public/neurocrop-i18n-lt.js'].includes('window.NeuroCropLithuanianText')
    && dashboard.includes('ensureLithuanianTranslations()')
    && runtime.includes('window.NeuroCropLoadLithuanianTranslations()'),
  'Lithuanian translations must remain available on first load and language change',
)
assert(
  dashboard.includes('ensureOptionalDashboardStore')
    && dashboard.includes('neurocropApi.isConnected() || window.NeuroCropStore')
    && source['public/neurocrop-dashboard-store.js'].includes('window.NeuroCropStore = {')
    && !runtime.includes('window.NeuroCropStore = {'),
  'the local demo store must stay outside the production API runtime',
)
assert(Buffer.byteLength(runtime) < 300_000, 'the transitional dashboard runtime must stay below 300 KB')

if (failures) process.exit(1)
console.log('Runtime architecture invariants passed.')
