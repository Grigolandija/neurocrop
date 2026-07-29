import { expect, test, type Page } from '@playwright/test'

const apiBaseUrl = process.env.E2E_API_URL || 'http://127.0.0.1:3100'
const password = process.env.E2E_PASSWORD || 'NeuroCrop-CI-Password-2026'

async function authenticate(page: Page) {
  const response = await page.request.post(`${apiBaseUrl}/auth/login`, {
    data: { email: 'tenant-a@ci.neurocrop.test', password },
  })
  expect(response.ok(), await response.text()).toBeTruthy()
  await page.route('**/runtime-config.js*', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: `window.NEUROCROP_CONFIG = { apiBaseUrl: ${JSON.stringify(apiBaseUrl)} };`,
  }))
}

test('initial dashboard keeps inactive workspaces and charting lazy', async ({ page }) => {
  await authenticate(page)
  await page.goto('/')
  await expect(page.locator('#dashboardShell')).toBeVisible()
  await expect(page.locator('[data-overview-heatmap-settled="true"]')).toBeVisible()

  const resources = await page.evaluate(() => performance.getEntriesByType('resource').map((entry) => entry.name))
  expect(resources.some((url) => /echarts-vendor-|TrendsWorkspace-|SettingsWorkspace-|AdminWorkspace-/.test(url))).toBe(false)
})

test('primary workspaces emit no uncaught page or console errors', async ({ page }) => {
  const failures: string[] = []
  page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') failures.push(`console: ${message.text()}`)
  })
  await authenticate(page)
  await page.goto('/')
  await expect(page.locator('#dashboardShell')).toBeVisible()
  for (const route of ['/areas', '/sections', '/nodes', '/readings', '/history', '/alerts', '/actions', '/settings']) {
    await page.goto(route)
    await expect(page.locator('[data-workspace-host]:not([hidden])')).toBeVisible()
  }
  expect(failures).toEqual([])
})
