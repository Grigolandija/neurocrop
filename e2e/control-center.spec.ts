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
  await expect(page.locator('#loginSubmit')).toBeEnabled()
  await page.locator('#loginEmail').fill(email)
  await page.locator('#loginPassword').fill(password)
  await page.locator('#loginForm').getByRole('button', { name: /sign in/i }).click()
  await expect(page.locator('#dashboardShell')).toBeVisible()
}

async function authenticate(page: Page, email: string) {
  const response = await page.request.post(`${apiBaseUrl}/auth/login`, {
    data: { email, password }
  })
  expect(response.ok(), await response.text()).toBeTruthy()
  await prepare(page)
  await page.goto('/')
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

test('new customer can register and receives a pending workspace confirmation', async ({ page }) => {
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

test('measurement CSV can be downloaded from Trends', async ({ page }) => {
  await authenticate(page, 'tenant-a@ci.neurocrop.test')
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
  await authenticate(page, 'tenant-empty@ci.neurocrop.test')
  await expect(page.getByRole('heading', { name: /create your first growing area/i })).toBeVisible()
  await expect(navigationAction(page, 'zones')).toBeDisabled()
  await expect(page.locator('#historySection')).toBeHidden()
})

test('large workspace keeps 100+ Areas accessible', async ({ page }) => {
  await authenticate(page, 'tenant-large@ci.neurocrop.test')
  await page.locator('#siteTrigger').click()
  await expect(page.locator('[data-site-option]')).toHaveCount(101)
  await expect(page.locator('[data-site-option]').filter({ hasText: 'Scale Area 101' })).toBeVisible()
})

test('primary desktop pages fit the viewport without horizontal overflow', async ({ page }) => {
  await authenticate(page, 'tenant-a@ci.neurocrop.test')
  const overflows: Array<{ action: string; viewport: number; content: number; offenders: string[] }> = []
  for (const action of ['overview', 'sites', 'zones', 'nodes', 'readings', 'history', 'settings']) {
    await navigationAction(page, action).click()
    await page.waitForTimeout(100)
    const dimensions = await page.evaluate(() => {
      const viewport = window.innerWidth
      const offenders = Array.from(document.querySelectorAll<HTMLElement>('body *'))
        .map((element) => ({ element, rect: element.getBoundingClientRect() }))
        .filter(({ rect }) => rect.width > 0 && rect.right > viewport + 1)
        .sort((a, b) => b.rect.right - a.rect.right)
        .slice(0, 8)
        .map(({ element, rect }) => `${element.tagName.toLowerCase()}#${element.id}.${element.className || ''} right=${Math.round(rect.right)} width=${Math.round(rect.width)}`)
      return { viewport, content: document.documentElement.scrollWidth, offenders }
    })
    if (dimensions.content > dimensions.viewport + 1) overflows.push({ action, ...dimensions })
  }
  expect(overflows).toEqual([])
})

test('destructive Area removal requires explicit confirmation', async ({ page }) => {
  await authenticate(page, 'tenant-a@ci.neurocrop.test')
  await navigationAction(page, 'sites').click()
  await page.locator('[data-location-edit]').first().click()
  await expect(page.locator('#managementModalOverlay')).toBeVisible()
  await page.locator('[data-modal-location-delete]').click()
  await expect(page.locator('.management-modal-error')).toContainText('Confirm')
})
