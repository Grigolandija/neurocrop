import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const read = (file) => fs.readFile(path.join(root, file), 'utf8')
const app = await read('src/App.tsx')
const dashboard = await read('src/pages/DashboardPage.tsx')
const login = await read('src/components/LoginScreen.tsx')
const clerkLogin = await read('src/components/ClerkLoginScreen.tsx')
const clerkSessionBridge = await read('src/components/ClerkSessionBridge.tsx')
const pwaControls = await read('src/components/PwaControls.tsx')
const pwa = await read('src/pwa.ts')
const serviceWorker = await read('public/sw.js')
const manifest = await read('public/manifest.webmanifest')
const mobileExperience = await read('src/styles/mobile-experience.css')
const shell = await read('src/components/DashboardShell.tsx')
const main = await read('src/main.tsx')
const apiClient = await read('src/services/api/client.ts')
const neurocropApi = await read('src/services/api/neurocropApi.ts')
const overview = await read('src/features/overview/OverviewWorkspace.tsx')
const readingsClimateMap = await read('src/features/readings/ReadingsClimateMap.tsx')
const trends = await read('src/features/trends/TrendsWorkspace.tsx')
const sections = await read('src/features/sections/SectionsWorkspace.tsx')
const nodes = await read('src/features/nodes/NodesWorkspace.tsx')
const store = await read('src/state/dashboardStore.ts')
const workspaceAccess = await read('src/state/workspaceAccess.ts')
const sourceFiles = (await fs.readdir(path.join(root, 'src'), { recursive: true }))
  .filter((file) => /\.(ts|tsx)$/.test(file))
const source = (await Promise.all(sourceFiles.map((file) => read(path.join('src', file))))).join('\n')

const failures = []
const assert = (condition, message) => { if (!condition) failures.push(message) }

assert(dashboard.includes('<DashboardShell'), 'DashboardPage must render the React DashboardShell.')
assert(
  app.includes('<LoginScreen onAuthenticated={setUser} />') && app.includes('return <ClerkLoginScreen />'),
  'Both legacy and Clerk login screens must render before authenticated workspace loading.'
)
assert(
  app.includes('if (!isLoaded) return <WorkspaceLoading />'),
  'Clerk session discovery must show a neutral loading state instead of flashing the login screen.'
)
assert(
  !clerkSessionBridge.includes('WorkspaceLoading'),
  'ClerkSessionBridge must render the login route while Clerk discovers the session.'
)
assert(
  clerkLogin.includes('signIn.password({')
    && clerkLogin.includes('autoComplete="username"')
    && clerkLogin.includes('autoComplete="current-password"'),
  'Clerk sign-in must show email and password together and submit them as one password sign-in.'
)
assert(
  clerkLogin.includes('signIn.resetPasswordEmailCode.sendCode()')
    && clerkLogin.includes('signIn.resetPasswordEmailCode.verifyCode(')
    && clerkLogin.includes('signIn.resetPasswordEmailCode.submitPassword(')
    && clerkLogin.includes('<PasswordRecoveryForm'),
  'Clerk password recovery must use the direct email-code flow before asking for a new password.'
)
assert(
  !clerkLogin.includes('kitame žingsnyje pasirinkite „Forgot password?“')
    && !clerkLogin.includes('then choose Forgot password?'),
  'Password recovery must not send users back through the ordinary password sign-in flow.'
)
assert(app.includes('<Suspense fallback={<WorkspaceLoading />}>'), 'Workspace loading must be scoped to the authenticated dashboard.')
assert(!dashboard.includes('if (!bootstrapped)'), 'DashboardPage must not block the login screen while workspace modules preload.')
assert(!login.includes('prefetchWorkspaceData'), 'Login must transition before workspace data prefetching starts.')
assert(!dashboard.includes('?raw'), 'DashboardPage must not inject raw HTML.')
assert(!dashboard.includes('createPortal'), 'Dashboard workspaces must not use legacy DOM portals.')
assert(dashboard.includes("'/nodes': 'nodesManagementSection'"), 'The Nodes workspace host must preserve its scoped styling contract.')
assert(dashboard.includes('data-workspace-suspense'), 'Workspace readiness must track only unresolved lazy modules.')
assert(dashboard.includes('data-overview-heatmap-settled="true"'), 'The authenticated loader must wait for the Overview heatmap to finish rendering.')
assert(dashboard.includes('switch (route)'), 'Dashboard must render only the active workspace.')
assert(!dashboard.includes('hidden={!visible(route)}'), 'Inactive workspaces must not remain mounted behind the active page.')
assert(dashboard.includes('Promise.allSettled(workspaceModuleLoaders.map'), 'Inactive workspace modules must be preloaded without mounting their DOM trees.')
assert(!dashboard.includes("host.querySelector('[aria-busy=\"true\"]')"), 'Nested data loaders must not block the authenticated workspace shell.')
assert(main.includes("'vite:preloadError'"), 'The application must recover when a deployment removes a stale lazy chunk.')
assert(main.includes('initializePwa()'), 'The application must register its PWA lifecycle before rendering.')
assert(manifest.includes('"display": "standalone"'), 'The PWA manifest must launch as a standalone application.')
assert(serviceWorker.includes("self.addEventListener('push'"), 'The service worker must display background push notifications.')
assert(serviceWorker.includes("self.addEventListener('notificationclick'"), 'Push notifications must reopen the relevant application route.')
assert(pwa.includes('pushManager.subscribe'), 'Authenticated devices must be able to create a real web push subscription.')
assert(pwaControls.includes('needsManualIosInstall'), 'iOS must receive explicit Add to Home Screen guidance.')
assert(mobileExperience.includes('@media (max-width: 430px)')
  && mobileExperience.includes('@media (max-width: 390px)')
  && mobileExperience.includes('@media (max-width: 360px)'), 'Mobile layout must explicitly protect 430, 390 and 360 px widths.')
assert(mobileExperience.includes('body.gh-map-active .gh-app'), 'Area Map must own the complete mobile viewport.')
assert(mobileExperience.includes('.nc-admin-table-wrap tr'), 'Admin tables must collapse to mobile records.')
assert(apiClient.includes('await sessionHasEnded()'), 'A single protected endpoint must not sign out a still-valid session.')
assert(overview.includes('ReadingsClimateMap'), 'Overview must retain its live climate map.')
assert(overview.includes('activeAreaOption?.mapEnabled'), 'Overview must render the climate map only for Areas that explicitly enable it.')
assert(readingsClimateMap.includes('if (!context.map)'), 'Overview must not render a generated climate map before an Area Map is saved.')
assert(readingsClimateMap.includes('data-state="unconfigured"'), 'An Area without a saved map must render an explicit unconfigured state.')
assert(!overview.includes('key={model.areaId}'), 'Area switching must not remount the full climate map.')
assert(trends.includes("location.pathname === '/history'"), 'A hidden Trends workspace must not overwrite the active Area.')
assert(shell.includes('useInterfaceLanguage'), 'DashboardShell must own the language control.')
assert(shell.includes('useNavigate'), 'DashboardShell must own navigation.')
assert(app.includes('<WorkspaceAccessProvider'), 'Authenticated routes must share one workspace onboarding access provider.')
assert(app.includes('canAccessWorkspaceRoute(access.stage, pathname)'), 'Direct URLs must use the same workspace access rule as navigation.')
assert(shell.includes('canAccessWorkspaceRoute(workspaceAccess.stage'), 'Sidebar and mobile navigation must use the central workspace access rule.')
assert(workspaceAccess.includes("return stage === 'needs-section' && route === '/sections'"), 'Sections must unlock only after the first Area exists.')
assert(workspaceAccess.includes("route === '/settings' || route === '/areas'"), 'Areas and Settings must remain available throughout onboarding.')
assert(sections.includes('await workspaceAccess.refresh()'), 'Section mutations must unlock navigation without a browser refresh.')
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
