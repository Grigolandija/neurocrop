import { expect, type Page } from '@playwright/test'

export const apiBaseUrl = process.env.E2E_API_URL || 'http://127.0.0.1:3100'
export const password = process.env.E2E_PASSWORD || 'NeuroCrop-CI-Password-2026'

export async function prepareRuntime(page: Page) {
  await page.route('**/runtime-config.js*', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: `window.NEUROCROP_CONFIG = { apiBaseUrl: ${JSON.stringify(apiBaseUrl)} };`,
  }))
}

export async function selectGreenhouse(page: Page) {
  const productSelection = page.locator('.product-entry-screen')
  await expect(productSelection).toBeVisible()
  await expect(page.locator('#dashboardShell')).toHaveCount(0)
  await page.locator('[data-product-choice="greenhouse"]').click()
  await expect(page.locator('#dashboardShell')).toBeVisible()
  await expect(page.locator('.app-route-loading')).toHaveCount(0)
}

export async function authenticate(page: Page, email = 'tenant-a@ci.neurocrop.test') {
  const response = await page.request.post(`${apiBaseUrl}/auth/login`, { data: { email, password } })
  expect(response.ok(), await response.text()).toBeTruthy()
  await prepareRuntime(page)
  await page.goto('/')
  await selectGreenhouse(page)
}
