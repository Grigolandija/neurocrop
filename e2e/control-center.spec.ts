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
  await expect(page.locator('[data-site-option]')).toHaveCount(1)
}

async function authenticate(page: Page, email: string, expectedAreaCount: number | 'empty' = 1) {
  const response = await page.request.post(`${apiBaseUrl}/auth/login`, {
    data: { email, password }
  })
  expect(response.ok(), await response.text()).toBeTruthy()
  await prepare(page)
  await page.goto('/')
  await expect(page.locator('#dashboardShell')).toBeVisible()
  if (expectedAreaCount === 'empty') {
    await expect(page.getByRole('heading', { name: /create your first area/i })).toBeVisible()
  } else {
    await expect(page.locator('[data-site-option]')).toHaveCount(expectedAreaCount)
  }
}

function navigationAction(page: Page, action: string) {
  return page.locator(`[data-sidebar-action="${action}"]:visible`)
}

test('wrong password shows a clear inline login error', async ({ page }) => {
  await prepare(page)
  await page.goto('/')
  await page.locator('#loginEmail').fill('tenant-a@ci.neurocrop.test')
  await page.locator('#loginPassword').fill('Definitely-wrong-password')
  await page.locator('#loginForm').getByRole('button', { name: /sign in/i }).click()
  await expect(page.locator('#loginError')).toBeVisible()
  await expect(page.locator('#loginError')).toContainText('Check your email and password')
  await expect(page.locator('#dashboardShell')).toBeHidden()
})

test('tenant dashboard selects a real Area and Section and supports navigation', async ({ page }) => {
  await login(page, 'tenant-a@ci.neurocrop.test')
  await expect(page.locator('#headerAccountEmail')).toHaveText('tenant-a@ci.neurocrop.test')
  await expect(navigationAction(page, 'overview')).toHaveAttribute('data-active', 'true')
  await expect(navigationAction(page, 'overview')).toContainText('Overview')
  await expect(navigationAction(page, 'readings')).toContainText('Readings')
  await expect(navigationAction(page, 'alerts')).toContainText('Alerts')
  await expect(page.locator('.triage-priority-card')).toContainText('Farm priority')
  await expect(page.locator('.triage-score-card')).toContainText('Selected section score')
  await expect(page.locator('#headerContextSelectors')).not.toContainText('All sections')

  await navigationAction(page, 'sites').click()
  await expect(page).toHaveURL(/\/areas$/)
  await navigationAction(page, 'nodes').click()
  await expect(page).toHaveURL(/\/nodes$/)
  await navigationAction(page, 'history').click()
  await expect(page).toHaveURL(/\/history$/)
})

test('Live readings opens an Area-wide Section measurement matrix', async ({ page }) => {
  await authenticate(page, 'tenant-a@ci.neurocrop.test')
  await navigationAction(page, 'readings').click()

  await expect(page).toHaveURL(/\/readings$/)
  await expect(page.locator('body')).toHaveAttribute('data-view-scope', 'site')
  await expect(page.locator('#zoneContextValue')).toHaveText('All sections')
  await expect(page.locator('#siteMetricsViewToggle')).toBeHidden()
  await expect(page.locator('#metricsGrid')).toHaveAttribute('data-display', 'area-readings-board')
  await expect(page.locator('[data-workbench-lens="essential"]')).toHaveAttribute('data-active', 'true')
  await expect(page.locator('[data-workbench-lens="all"]')).toContainText('All parameters')
  await expect(page.locator('.area-live-section-row')).toHaveCount(1)
  await expect(page.locator('.area-live-section-copy strong')).toHaveText('CI Section A')
  await expect(page.locator('.area-live-section-copy small')).toHaveCount(0)
  await expect(page.locator('.area-live-score')).not.toContainText('GS')
  await expect(page.locator('.area-live-value small')).toHaveCount(0)
  await expect(page.locator('.area-live-matrix-head')).toContainText('Air temperature')
  await expect(page.locator('.area-live-matrix-head')).toContainText('Relative humidity')

  const visibleMetricColumns = await page.locator('.area-live-matrix-head > span').count() - 3
  expect(visibleMetricColumns).toBeLessThanOrEqual(6)

  await page.locator('[data-area-reading-section]').click()
  await expect(page.locator('body')).toHaveAttribute('data-view-scope', 'zone')
  await expect(page.locator('#zoneContextValue')).toHaveText('CI Section A')
})

test('successful API traffic restores the connection indicator without a refresh', async ({ page }) => {
  await authenticate(page, 'tenant-a@ci.neurocrop.test')
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('neurocrop:api-connection', {
      detail: { connected: false },
    }))
  })
  await expect(page.locator('#headerConnectionLabel')).toHaveText('Connection lost')

  await page.evaluate(async () => {
    await (window as typeof window & { NeuroCropApi: { getDashboard: () => Promise<unknown> } }).NeuroCropApi.getDashboard()
  })
  await expect(page.locator('#headerConnectionLabel')).toHaveText('Online')
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

test('empty organization always uses the canonical Areas onboarding', async ({ page }) => {
  await authenticate(page, 'tenant-empty@ci.neurocrop.test', 'empty')
  await expect(page).toHaveURL(/\/areas$/)
  await expect(page.getByRole('heading', { name: /create your first area/i })).toBeVisible()
  await expect(navigationAction(page, 'sites')).toHaveAttribute('data-active', 'true')
  await expect(navigationAction(page, 'zones')).toBeDisabled()
  await expect(page.locator('#historySection')).toBeHidden()
  await expect(page.locator('#zoneImpactSection')).toBeHidden()
  await expect(page.locator('#advancedToolsPanel')).toBeHidden()

  await navigationAction(page, 'overview').click()
  await expect(page).toHaveURL(/\/areas$/)
  await expect(page.getByRole('heading', { name: /create your first area/i })).toBeVisible()
  await expect(navigationAction(page, 'sites')).toHaveAttribute('data-active', 'true')

  await navigationAction(page, 'nodes').click()
  await expect(page).toHaveURL(/\/areas$/)
  await expect(page.getByRole('heading', { name: /create your first area/i })).toBeVisible()
  await expect(page.locator('#advancedToolsPanel')).toBeHidden()
})

test('large workspace keeps 100+ Areas accessible', async ({ page }) => {
  await authenticate(page, 'tenant-large@ci.neurocrop.test', 101)
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

test('primary desktop pages keep operational text readable', async ({ page }) => {
  await authenticate(page, 'tenant-a@ci.neurocrop.test')
  const headerType = await page.evaluate(() => {
    const read = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector)
      if (!element) return null
      const style = window.getComputedStyle(element)
      return {
        size: Number.parseFloat(style.fontSize),
        weight: Number.parseInt(style.fontWeight, 10),
      }
    }
    return {
      label: read('#dashboardHeader .context-card-label'),
      value: read('#dashboardHeader .context-card-value'),
      account: read('#headerAccountEmail'),
    }
  })

  expect(headerType.label).not.toBeNull()
  expect(headerType.value).not.toBeNull()
  expect(headerType.account).not.toBeNull()
  expect(headerType.label!.weight).toBeLessThanOrEqual(600)
  expect(headerType.value!.weight).toBeLessThanOrEqual(650)
  expect(headerType.account!.weight).toBeLessThanOrEqual(650)
  expect(headerType.value!.size).toBeGreaterThan(headerType.label!.size)

  const unreadable: Array<{ action: string; items: string[] }> = []

  for (const action of ['overview', 'sites', 'zones', 'nodes', 'readings', 'history', 'settings']) {
    await navigationAction(page, action).click()
    await page.waitForTimeout(100)
    const items = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('body *'))
      .filter((element) => {
        if (['SCRIPT', 'STYLE', 'I', 'SVG', 'PATH', 'OPTION'].includes(element.tagName)) return false
        if (element.closest('[hidden], [aria-hidden="true"], .sr-only')) return false
        const hasDirectText = Array.from(element.childNodes).some((node) =>
          node.nodeType === Node.TEXT_NODE && Boolean(node.textContent?.trim()))
        if (!hasDirectText) return false
        const rect = element.getBoundingClientRect()
        const style = window.getComputedStyle(element)
        return rect.width > 0
          && rect.height > 0
          && style.visibility !== 'hidden'
          && style.display !== 'none'
          && Number.parseFloat(style.fontSize) < 10.9
      })
      .slice(0, 20)
      .map((element) => {
        const style = window.getComputedStyle(element)
        const identity = element.id ? `#${element.id}` : `.${String(element.className).trim().split(/\s+/).slice(0, 2).join('.')}`
        return `${element.tagName.toLowerCase()}${identity} ${style.fontSize} “${element.textContent?.trim().slice(0, 45)}”`
      }))
    if (items.length > 0) unreadable.push({ action, items })
  }

  expect(unreadable).toEqual([])
})

test('destructive Area removal requires explicit confirmation', async ({ page }) => {
  await authenticate(page, 'tenant-a@ci.neurocrop.test')
  await navigationAction(page, 'sites').click()
  await page.locator('[data-location-edit]').first().click()
  await expect(page.locator('#managementModalOverlay')).toBeVisible()
  await page.locator('[data-modal-location-delete]').click()
  await expect(page.locator('.management-modal-error')).toContainText('Confirm')
})
