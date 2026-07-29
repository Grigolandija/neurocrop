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
  await page.goto('/')
  await expect(page.locator('#dashboardShell')).toBeVisible()
}

test('mobile navigation reaches core monitoring workspaces without overflow', async ({ page }) => {
  await authenticate(page)
  for (const route of ['/', '/areas', '/sections', '/nodes', '/readings', '/history', '/alerts']) {
    await page.goto(route)
    await expect(page.locator('[data-workspace-host]:not([hidden])')).toBeVisible()
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
  }
})

test('mobile account and navigation controls remain touch accessible', async ({ page }) => {
  await authenticate(page)
  await expect(page.locator('.mobile-dock')).toBeVisible()
  await page.locator('.mobile-dock-command').click()
  await expect(page.locator('#dashboardSidebar')).toHaveClass(/rail-open/)
  const trends = page.locator('#dashboardSidebar [data-sidebar-action="history"]')
  await expect(trends).toBeVisible()
  await trends.click()
  await expect(page).toHaveURL(/\/history$/)
  await expect(page.locator('.nc-trends-page')).toBeVisible()
})
