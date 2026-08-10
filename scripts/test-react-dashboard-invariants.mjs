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
const serviceWorker = await read('public/sw.js')
const index = await read('index.html')
const mobileExperience = await read('src/styles/mobile-experience.css')
const appShellStyles = await read('src/styles/app-shell.css')
const sidebarStyles = await read('src/styles/redesign-sidebar.css')
const overviewStyles = await read('src/styles/overview-workspace.css')
const shell = await read('src/components/DashboardShell.tsx')
const main = await read('src/main.tsx')
const apiClient = await read('src/services/api/client.ts')
const neurocropApi = await read('src/services/api/neurocropApi.ts')
const overview = await read('src/features/overview/OverviewWorkspace.tsx')
const readingsClimateMap = await read('src/features/readings/ReadingsClimateMap.tsx')
const trends = await read('src/features/trends/TrendsWorkspace.tsx')
const sections = await read('src/features/sections/SectionsWorkspace.tsx')
const nodes = await read('src/features/nodes/NodesWorkspace.tsx')
const settings = await read('src/features/settings/SettingsWorkspace.tsx')
const soonBadge = await read('src/components/SoonBadge.tsx')
const store = await read('src/state/dashboardStore.ts')
const workspaceAccess = await read('src/state/workspaceAccess.ts')
const metricRegistry = await read('src/domain/metricRegistry.ts')
const metricRegistryJson = await read('backend/metric-registry.json')
const sourceFiles = (await fs.readdir(path.join(root, 'src'), { recursive: true }))
  .filter((file) => /\.(ts|tsx)$/.test(file))
const source = (await Promise.all(sourceFiles.map((file) => read(path.join('src', file))))).join('\n')

const failures = []
const assert = (condition, message) => { if (!condition) failures.push(message) }

assert(metricRegistry.includes("import registryJson from '../../backend/metric-registry.json'"), 'Frontend must consume the canonical backend metric registry.')
assert(metricRegistryJson.includes('"version": 1'), 'Canonical metric registry must declare a supported schema version.')
assert(!appShellStyles.includes('304px'), 'Wide desktop must keep the standard compact application shell.')
assert(!sidebarStyles.includes('@media (min-width: 1800px)'), 'Wide desktop must not enlarge sidebar controls.')
assert(!overviewStyles.includes('margin-left: 304px'), 'Overview must keep the standard desktop content offset.')

assert(dashboard.includes('<DashboardShell'), 'DashboardPage must render the React DashboardShell.')
assert(
  app.includes('<ProductEntryScreen onSelect={chooseProduct} />')
    && app.includes('<LoginScreen onAuthenticated={setUser} onChangeProduct={clearProduct} />')
    && app.includes('<ClerkLoginScreen onChangeProduct={clearProduct} />'),
  'Product selection must route both legacy and Clerk users into the Greenhouse login before authenticated workspace loading.'
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
assert(dashboard.includes('const workspace = workspaces.find'), 'Dashboard must select only the active workspace for rendering.')
assert(dashboard.includes('{workspace.content}'), 'Dashboard must render the selected workspace instead of mounting every route.')
assert(
  dashboard.includes("import('../features/areas/AreasWorkspace')")
    && dashboard.includes('createPreloadableWorkspace(loadAreasWorkspace)'),
  'Workspace modules must remain route-split and synchronously render after navigation preloading.'
)
assert(dashboard.includes('coreWorkspaceModuleLoaders'), 'Common operational workspace modules must be warmed after authentication.')
assert(dashboard.includes('onPrefetchRoute={preloadWorkspaceRoute}'), 'Navigation intent must preload the destination workspace.')
assert(dashboard.includes('prefetchWorkspaceData'), 'Authenticated dashboard must warm shared workspace data.')
assert(!shell.includes('document.body.dataset.primaryPage'), 'The shell must not apply destination-page CSS before the deferred workspace is visible.')
assert(dashboard.includes('document.body.dataset.primaryPage = deferredPathname'), 'Global page-scoped CSS must follow the workspace that is actually visible.')
assert(dashboard.includes('data-workspace-suspense'), 'A route-scoped loading state must cover a workspace chunk that is not warm yet.')
assert(dashboard.includes('completeRoutePerformance(workspace.route)'), 'Route performance must complete after the active workspace paints.')
assert(main.includes("'vite:preloadError'"), 'The application must recover when a deployment removes a stale lazy chunk.')
assert(main.includes('registration.unregister()'), 'The website must retire service workers left by the PWA experiment.')
assert(main.includes("key.startsWith('neurocrop-')"), 'The website must clear caches left by the PWA experiment.')
assert(serviceWorker.includes('self.registration.unregister()'), 'The retirement service worker must unregister itself.')
assert(!index.includes('manifest.webmanifest'), 'The normal website must not advertise PWA installation.')
assert(!shell.includes('PwaControls'), 'The website header must not expose install or notification controls.')
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
assert(shell.includes("useState<'header' | 'sidebar' | null>(null)"), 'Header and sidebar account menus must track their own anchor.')
assert(shell.includes('id="sidebarAccountMenu" className="sidebar-account-menu"'), 'The sidebar account button must open a menu anchored inside the sidebar.')
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
assert(soonBadge.includes('>Soon</span>'), 'Unavailable features must use the shared gray Soon badge.')
assert(
  settings.includes('{label}<SoonBadge />')
    && settings.includes('{tx("Warning persistence")}<SoonBadge />')
    && settings.includes('{tx("Quiet hours start")}<SoonBadge />')
    && settings.includes('{tx("Quiet hours end")}<SoonBadge />')
    && settings.includes('{tx("Critical alerts override quiet hours")}<SoonBadge />')
    && settings.includes('{tx("Session management is being deployed")}<SoonBadge />'),
  'Notification delivery and escalation controls must remain visibly marked Soon until operational delivery exists.'
)

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
