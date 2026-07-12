import { expect, test, type Page } from '@playwright/test'

const apiBaseUrl = process.env.E2E_API_URL || 'http://127.0.0.1:3100'
const password = process.env.E2E_PASSWORD || 'NeuroCrop-CI-Password-2026'

async function prepare(page: Page) {
  await page.route('**/runtime-config.js*', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: `window.NEUROCROP_CONFIG = { apiBaseUrl: ${JSON.stringify(apiBaseUrl)} };`
  }))
}

async function login(page: Page, email: string) {
  await prepare(page)
  await page.goto('/')
  await page.locator('#loginEmail').fill(email)
  await page.locator('#loginPassword').fill(password)
  await page.locator('#loginForm').getByRole('button', { name: /sign in/i }).click()
  await expect(page.locator('#dashboardShell')).toBeVisible()
}

function navigationAction(page: Page, action: string) {
  return page.locator(`[data-sidebar-action="${action}"]:visible`)
}

test('tenant dashboard selects a real Area and Section and supports navigation', async ({ page }) => {
  await login(page, 'tenant-a@ci.neurocrop.test')
  await expect(page.locator('#headerAccountEmail')).toHaveText('tenant-a@ci.neurocrop.test')
  await expect(navigationAction(page, 'overview')).toHaveAttribute('data-active', 'true')
  await expect(page.locator('#headerContextSelectors')).not.toContainText('All sections')

  await navigationAction(page, 'sites').click()
  await expect(page).toHaveURL(/\/areas$/)
  await navigationAction(page, 'nodes').click()
  await expect(page).toHaveURL(/\/nodes$/)
  await navigationAction(page, 'history').click()
  await expect(page).toHaveURL(/\/history$/)
})

test('measurement CSV can be downloaded from Trends', async ({ page }) => {
  await login(page, 'tenant-a@ci.neurocrop.test')
  await navigationAction(page, 'history').click()
  await expect(page.locator('#trendHistoryExportButton')).toBeVisible()
  await page.locator('#trendHistoryExportButton').click()
  await expect(page.locator('[data-csv-export-form]')).toBeVisible()

  const downloadPromise = page.waitForEvent('download')
  await page.locator('[data-csv-export-form]').getByRole('button', { name: 'Download CSV' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/^neurocrop-.*\.csv$/)
})

test('empty organization shows onboarding without stale charts', async ({ page }) => {
  await login(page, 'tenant-empty@ci.neurocrop.test')
  await expect(page.getByRole('heading', { name: /create your first growing area/i })).toBeVisible()
  await expect(navigationAction(page, 'zones')).toBeDisabled()
  await expect(page.locator('#historySection')).toBeHidden()
})

test('large workspace keeps 100+ Areas accessible', async ({ page }) => {
  await login(page, 'tenant-large@ci.neurocrop.test')
  await navigationAction(page, 'sites').click()
  await expect(page.locator('.management-list-row')).toHaveCount(120)
  await expect(page.getByText('Scale Area 120', { exact: true })).toBeVisible()
})
