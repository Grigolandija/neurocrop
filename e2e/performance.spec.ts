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

test('initial dashboard renders the active workspace without mounting inactive workspaces', async ({ page }) => {
  await authenticate(page)
  await page.goto('/')
  await expect(page.locator('#dashboardShell')).toBeVisible()
  await expect(page.locator('[data-workspace-host]')).toHaveCount(1)
  await expect(page.locator('[data-workspace-host]')).toHaveAttribute('data-workspace-route', '/')
  await expect(page.locator('[data-overview-heatmap-settled="true"]')).toBeVisible()
  await expect(page.locator('[data-workspace-route="/history"] .nc-trends-page')).toHaveCount(0)
  await expect(page.locator('[data-workspace-route="/settings"] .nc-settings-page')).toHaveCount(0)
  await expect(page.locator('[data-workspace-route="/areas"] .nc-areas-page')).toHaveCount(0)
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

test('prefetched route changes never flash the full workspace loader', async ({ page }) => {
  await authenticate(page)
  await page.goto('/')
  await expect(page.locator('#dashboardShell')).toBeVisible()
  await expect(page.locator('.app-route-loading')).toHaveCount(0)

  await page.evaluate(() => {
    const state = window as Window & { __routeLoadingFlashed?: boolean }
    state.__routeLoadingFlashed = false
    const observer = new MutationObserver(() => {
      if (document.querySelector('.app-route-loading')) state.__routeLoadingFlashed = true
    })
    observer.observe(document.body, { childList: true, subtree: true })
  })

  await page.locator('[data-sidebar-action="zones"]:visible').click()
  await expect(page).toHaveURL(/\/sections$/)
  await expect(page.locator('.nc-sections-page')).toBeVisible()
  expect(await page.evaluate(() => (window as Window & { __routeLoadingFlashed?: boolean }).__routeLoadingFlashed)).toBe(false)
})
