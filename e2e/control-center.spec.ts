import { expect, test, type Page } from '@playwright/test'

const apiBaseUrl = process.env.E2E_API_URL || 'http://127.0.0.1:3100'
const password = process.env.E2E_PASSWORD || 'NeuroCrop-CI-Password-2026'

async function prepare(page: Page) {
  await page.route('**/runtime-config.js*', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: `window.NEUROCROP_CONFIG = { apiBaseUrl: ${JSON.stringify(apiBaseUrl)} };`,
  }))
}

async function authenticate(page: Page, email = 'tenant-a@ci.neurocrop.test') {
  const response = await page.request.post(`${apiBaseUrl}/auth/login`, { data: { email, password } })
  expect(response.ok(), await response.text()).toBeTruthy()
  await prepare(page)
  await page.goto('/')
  await expect(page.locator('#dashboardShell')).toBeVisible()
  await expect(page.locator('.app-route-loading')).toHaveCount(0)
}

function navigation(page: Page, action: string) {
  return page.locator(`[data-sidebar-action="${action}"]:visible`)
}

test('wrong password shows an inline login error', async ({ page }) => {
  await prepare(page)
  await page.goto('/')
  await page.locator('#loginEmail').fill('tenant-a@ci.neurocrop.test')
  await page.locator('#loginPassword').fill('Definitely-wrong-password')
  await page.locator('#loginSubmit').click()
  await expect(page.locator('#loginError')).toBeVisible()
  await expect(page.locator('#dashboardShell')).toHaveCount(0)
})

test('password recovery requests only the account email', async ({ page }) => {
  await prepare(page)
  await page.goto('/forgot-password')
  await expect(page.getByRole('heading', { name: 'Forgot your password?' })).toBeVisible()
  await expect(page.locator('input[type="password"]')).toHaveCount(0)
  await page.getByLabel('Email address').fill('tenant-a@ci.neurocrop.test')
  await page.getByRole('button', { name: 'Send reset link' }).click()
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()
  await expect(page.getByRole('status')).toContainText('valid for 60 minutes')
  await expect(page.locator('input[type="password"]')).toHaveCount(0)
})

test('workspace navigation unlocks in Area and Section stages', async ({ page }) => {
  await authenticate(page, 'tenant-empty@ci.neurocrop.test')
  await expect(page).toHaveURL(/\/areas$/)
  await expect(navigation(page, 'sites')).toBeEnabled()
  await expect(navigation(page, 'settings')).toBeEnabled()
  await expect(navigation(page, 'zones')).toBeDisabled()
  await expect(navigation(page, 'overview')).toBeDisabled()
  await page.goto('/nodes')
  await expect(page).toHaveURL(/\/areas$/)

  const response = await page.request.post(`${apiBaseUrl}/auth/login`, {
    data: { email: 'tenant-large@ci.neurocrop.test', password },
  })
  expect(response.ok(), await response.text()).toBeTruthy()
  await page.goto('/')
  await expect(page).toHaveURL(/\/sections$/)
  await expect(navigation(page, 'sites')).toBeEnabled()
  await expect(navigation(page, 'zones')).toBeEnabled()
  await expect(navigation(page, 'settings')).toBeEnabled()
  await expect(navigation(page, 'nodes')).toBeDisabled()
  await expect(navigation(page, 'overview')).toBeDisabled()
})

test('React shell keeps every primary workspace mounted during navigation', async ({ page }) => {
  await authenticate(page)
  await expect(page.locator('#headerAccountEmail')).toHaveText('tenant-a@ci.neurocrop.test')
  await expect(page.locator('[data-workspace-host]')).toHaveCount(12)
  await expect(page.locator('[data-workspace-host]:not([hidden])')).toHaveCount(1)
  await expect(page.locator('[data-nc-react-workspace="overview"]')).toBeVisible()

  const routes = [
    ['sites', '/areas', '.nc-areas-page'],
    ['zones', '/sections', '.nc-sections-page'],
    ['nodes', '/nodes', '.node-fleet-page'],
    ['readings', '/readings', '.nc-readings-workspace'],
    ['history', '/history', '.nc-trends-page'],
    ['alerts', '/alerts', '.nc-alerts-page'],
    ['actions', '/actions', '.nc-actions-page'],
    ['crop-profiles', '/crop-profiles', '[data-react-crop-profiles]'],
    ['simulator', '/simulator', '.nc-simulator'],
    ['settings', '/settings', '.nc-settings-page'],
    ['organization', '/organization', '.nc-organization-page'],
  ] as const

  for (const [action, route, workspace] of routes) {
    await navigation(page, action).click()
    await expect(page).toHaveURL(new RegExp(`${route.replace('/', '\\/')}$`))
    await expect(page.locator('[data-workspace-host]')).toHaveCount(12)
    await expect(page.locator('[data-workspace-host]:not([hidden])')).toHaveCount(1)
    await expect(page.locator('[data-workspace-host]:not([hidden])').locator(workspace)).toBeVisible()
    await expect(page.locator('.app-route-loading')).toHaveCount(0)
  }
})

test('Overview turns crop risk into a prioritized, verifiable task', async ({ page }) => {
  const response = await page.request.post(`${apiBaseUrl}/auth/login`, {
    data: { email: 'tenant-a@ci.neurocrop.test', password },
  })
  expect(response.ok(), await response.text()).toBeTruthy()
  await prepare(page)
  await page.route('**/actions/today', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      generatedAt: new Date().toISOString(),
      actions: [{
        id: 'section-ci-a:airTemp:high',
        riskKind: 'target-deviation',
        areaId: 'area-ci-a',
        areaName: 'CI Area A',
        sectionId: 'section-ci-a',
        sectionName: 'CI Section A',
        metricId: 'airTemp',
        metricLabel: 'Air temperature',
        state: 'critical',
        value: 31,
        unit: '°C',
        target: [18, 26],
        title: 'Reduce air temperature',
        reason: 'Air temperature is above the crop target.',
        recommendedAction: 'Inspect ventilation and cooling.',
        likelyCause: 'Insufficient ventilation or cooling',
        observedAt: new Date().toISOString(),
        firstDetectedAt: new Date(Date.now() - 95 * 60_000).toISOString(),
        durationMinutes: 95,
        trend: 'worsening',
        priorityScore: 88,
        reportingNodes: 5,
        affectedNodes: 3,
      }],
    }),
  }))
  await page.route('**/actions/overview-summary', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      today: { improvementsConfirmed: 2, awaitingVerification: 1, unchanged: 0, worsened: 0 },
      recentResults: [],
    }),
  }))
  await page.route('**/actions/today/*/feedback', (route) => route.fulfill({
    status: 201,
    contentType: 'application/json',
    body: JSON.stringify({ feedback: { status: 'in_progress' } }),
  }))

  await page.goto('/')
  await expect(page.locator('.nc-risk-facts')).toContainText('Worsening')
  await expect(page.locator('.nc-risk-facts')).toContainText('3 / 5 nodes')
  await expect(page.locator('.nc-result-loop')).toContainText('2 improved')
  await page.getByRole('button', { name: 'Start highest-priority task' }).click()
  await expect(page.getByRole('dialog', { name: /Review 1 affected Section/ })).toBeVisible()
  await page.getByRole('button', { name: 'Start check' }).click()
  await expect(page.locator('.nc-action-item')).toHaveAttribute('data-status', 'in-progress')
})

test('account menus open beside the button that was clicked', async ({ page }) => {
  await authenticate(page)
  await page.locator('.sidebar-user-wrap .user-tile').click()
  await expect(page.locator('.sidebar-account-menu')).toBeVisible()
  await expect(page.locator('.header-account-menu')).toBeHidden()

  await page.locator('.header-account-button').click()
  await expect(page.locator('.header-account-menu')).toBeVisible()
  await expect(page.locator('.sidebar-account-menu')).toBeHidden()
})

test('LT/EN belongs to React state, persists, and no legacy runtime is loaded', async ({ page }) => {
  await authenticate(page)
  await page.locator('[data-language-option="lt"]:visible').click()
  await expect(navigation(page, 'overview')).toContainText('Apžvalga')
  await expect(page.locator('html')).toHaveAttribute('lang', 'lt')
  await expect(page.locator('script[src*="approved-dashboard-runtime"], script[src*="neurocrop-i18n-lt"]')).toHaveCount(0)

  const localizedRoutes = [
    ['sites', '.nc-areas-page', 'Erdvės'],
    ['zones', '.nc-sections-page', 'Sekcijos'],
    ['nodes', '.node-fleet-page', 'Sensorių mazgai'],
    ['readings', '.nc-readings-workspace', 'Visi dabartiniai rodmenys vienoje vietoje'],
    ['alerts', '.nc-alerts-page', 'Perspėjimai'],
    ['actions', '.nc-actions-page', 'Veiksmai'],
    ['crop-profiles', '[data-react-crop-profiles]', 'Kultūrų profiliai'],
    ['settings', '.nc-settings-page', 'Nustatymai'],
  ] as const
  for (const [action, workspace, expectedText] of localizedRoutes) {
    await navigation(page, action).click()
    await expect(page.locator('[data-workspace-host]:not([hidden])').locator(workspace)).toContainText(expectedText)
  }

  await page.reload()
  await expect(page.locator('#dashboardShell')).toBeVisible()
  await expect(navigation(page, 'overview')).toContainText('Apžvalga')
  await page.locator('[data-language-option="en"]:visible').click()
  await expect(navigation(page, 'overview')).toContainText('Overview')
  await navigation(page, 'nodes').click()
  await expect(page.locator('.node-fleet-page')).toContainText('Sensor nodes')
})

test('Nodes opens registered hardware and its detail without a refresh', async ({ page }) => {
  await authenticate(page)
  await navigation(page, 'nodes').click()
  const fleet = page.locator('#nodesManagementSection .node-fleet-page')
  await expect(fleet).toBeVisible()
  await expect(fleet).toHaveCSS('display', 'grid')
  const row = page.locator('.nc-node-table tbody tr').first()
  await expect(row).toBeVisible()
  await row.locator('.nc-node-identity').click()
  await expect(page).toHaveURL(/\/nodes\/[^/]+$/)
  await expect(page.locator('.node-detail-page')).toBeVisible()
  await page.getByRole('button', { name: 'Edit node' }).click()
  await expect(page.getByRole('dialog', { name: 'Edit node' })).toBeVisible()
})

test('Readings and Trends use API-backed measurement data', async ({ page }) => {
  await authenticate(page)
  await navigation(page, 'readings').click()
  await expect(page.locator('.nc-readings-workspace')).toBeVisible()
  await expect(page.locator('.nc-readings-row:not(.nc-readings-row-head)')).toHaveCount(1)
  await expect(page.locator('.nc-reading-section')).toContainText('CI Section A')

  await navigation(page, 'history').click()
  await expect(page.locator('.nc-trends-page')).toBeVisible()
  await expect(page.locator('.nc-trends-context select')).toHaveCount(2)
  await expect(page.locator('.nc-trends-chart-card')).toBeVisible()
  await page.getByRole('button', { name: '7d', exact: true }).click()
  await page.reload()
  await expect(page.locator('.nc-trends-page')).toBeVisible()
  await expect(page.getByRole('button', { name: '7d', exact: true })).toHaveClass(/active/)
})

test('crop profile editor always exposes editable target ranges', async ({ page }) => {
  await authenticate(page)
  await navigation(page, 'crop-profiles').click()
  await page.locator('.crop-profile-switcher-option').first().click()
  await expect(page.getByRole('heading', { name: 'Operating envelope' })).toBeVisible()
  await expect(page.locator('.range-editor-list .range-editor').first()).toBeVisible()
  await expect(page.getByLabel('Optimal minimum').first()).toBeEditable()
  await expect(page.getByLabel('Optimal maximum').first()).toBeEditable()
})

test('crop profile editor exposes every canonical metric group', async ({ page }) => {
  await authenticate(page)
  await navigation(page, 'crop-profiles').click()
  await page.locator('.crop-profile-switcher-option').first().click()

  await expect(page.locator('.crop-profile-metric-name')).toContainText([
    'Air temperature',
    'Relative humidity',
    'CO₂',
    'VPD',
    'Leaf temperature',
  ])

  await page.locator('.profile-editor-navigation').getByRole('button', { name: /Root zone/ }).click()
  await expect(page.locator('.crop-profile-metric-name')).toContainText([
    'Substrate temperature',
    'Substrate moisture',
    'Nutrient EC',
    'Nutrient pH',
    'Substrate EC',
    'Water temperature',
  ])

  await page.locator('.profile-editor-navigation').getByRole('button', { name: /Lighting/ }).click()
  await expect(page.locator('.crop-profile-metric-name')).toContainText(['Illuminance'])
})

test('new customer can register and receives confirmation', async ({ page }) => {
  await prepare(page)
  await page.goto('/register')
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  await page.getByLabel('Email address').fill(`e2e-${suffix}@example.invalid`)
  await page.getByLabel('Your name').fill('E2E Customer')
  await page.getByLabel('Organization name').fill(`E2E Organization ${suffix}`)
  await page.getByLabel('Password').fill('NeuroCrop-E2E-Password-2026')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('status')).toContainText('Account created')
})

test('desktop pages do not overflow horizontally', async ({ page }) => {
  await authenticate(page)
  for (const action of ['overview', 'sites', 'zones', 'nodes', 'readings', 'history', 'alerts', 'settings']) {
    await navigation(page, action).click()
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
  }
})

test('mobile shell is touchable and exposes the complete navigation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await authenticate(page)
  await expect(page.locator('.mobile-dock')).toBeVisible()
  await page.locator('.mobile-dock-command').click()
  await expect(page.locator('#dashboardSidebar')).toHaveClass(/rail-open/)
  await page.locator('#dashboardSidebar').getByRole('button', { name: /trends/i }).click()
  await expect(page).toHaveURL(/\/history$/)
  await expect(page.locator('.nc-trends-page')).toBeVisible()
})
