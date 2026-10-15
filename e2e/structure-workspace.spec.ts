import { expect, test, type Page } from '@playwright/test'

async function setup(page: Page) {
  const api = 'http://structure.test'
  const now = new Date().toISOString()
  const areas = [
    { id: 'north', name: 'North greenhouse', kind: 'Greenhouse', location: 'Kaunas', map_enabled: true, map_configured: true },
    { id: 'south', name: 'South greenhouse', kind: 'Greenhouse', location: 'Kaunas' },
    { id: 'trial', name: 'Trial greenhouse', kind: 'Greenhouse', location: 'Vilnius' },
  ]
  const sections = [
    { id: 'tomato', name: 'Tomato zone', areaId: 'north', profileId: 'tomato', reportingCount: 1, lastReceivedAt: now },
    { id: 'cucumber', name: 'Cucumber zone', areaId: 'south', profileId: 'cucumber', reportingCount: 0, lastReceivedAt: new Date(Date.now() - 86400000).toISOString() },
    { id: 'trial-zone', name: 'Trial zone', areaId: 'trial', profileId: 'missing', reportingCount: 0 },
  ]
  const nodes = [
    { devEui: '0011223344556677', areaId: 'north', sectionId: 'tomato', name: 'NSN-000001', lastReceivedAt: now, transportStatus: 'live' },
    { devEui: '0011223344556688', areaId: 'south', sectionId: 'cucumber', name: 'NSN-000002', transportStatus: 'offline' },
  ]
  await page.route('**/runtime-config.js*', r => r.fulfill({ contentType: 'application/javascript', body: `window.NEUROCROP_CONFIG={apiBaseUrl:'${api}'};` }))
  await page.route(`${api}/**`, async route => {
    const path = new URL(route.request().url()).pathname
    let data: unknown = {}
    if (path === '/auth/me') data = { user: { id: 'structure-user', email: 'test@example.test', name: 'Test', role: 'owner', organizationId: 'test' } }
    if (path === '/areas') data = { areas }
    if (path === '/sections') data = { sections }
    if (path === '/nodes') data = { nodes }
    if (path === '/dashboard') data = { sites: areas.map((a, i) => ({ ...a, zones: [{ ...sections[i], overall: { state: ['optimal', 'critical', 'warning'][i], score: [95, 32, 68][i] } }] })) }
    if (path === '/crop-profiles') data = { profiles: [{ id: 'tomato', name: 'Tomatoes', crop: 'Tomato', stage: 'Vegetative' }, { id: 'cucumber', name: 'Cucumbers', crop: 'Cucumber' }] }
    await route.fulfill({ json: data })
  })
  await page.goto('/areas')
  await page.locator('[data-product-choice="greenhouse"]').click()
  await expect(page.locator('.nc-area-row')).toHaveCount(3)
}

test('Areas and Sections use consistent controls and reveal relevant records without extra clicks', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await page.setViewportSize({ width: 1440, height: 1000 })
  await setup(page)
  await page.screenshot({ path: '/tmp/neurocrop-areas-redesign.png', animations: 'disabled' })
  await page.locator('.nc-structure-summary').getByRole('button', { name: /Need attention/ }).click()
  await expect(page.locator('.nc-area-row')).toHaveCount(2)
  await expect(page.locator('.nc-area-list')).toContainText('South greenhouse')
  await expect(page.locator('.nc-area-list')).toContainText('Trial greenhouse')
  await expect(page.locator('.nc-structure-summary').getByRole('button', { name: /Need attention/ })).toHaveAttribute('aria-pressed', 'true')
  await page.locator('.nc-structure-footer').getByRole('button', { name: 'Clear filters' }).click()
  await expect(page.locator('.nc-area-row')).toHaveCount(3)
  await page.locator('.nc-areas-search input').fill('missing')
  await expect(page.getByRole('heading', { name: 'No matching areas' })).toBeVisible()
  await page.locator('.nc-structure-footer').getByRole('button', { name: 'Clear filters' }).click()
  await page.getByRole('button', { name: 'Sections', exact: true }).click()
  await expect(page.locator('.nc-section-row')).toHaveCount(3)
  await expect(page.locator('.nc-section-name').first()).toBeVisible()
  await page.screenshot({ path: '/tmp/neurocrop-sections-redesign.png', animations: 'disabled' })
  await page.locator('.nc-structure-summary').getByRole('button', { name: /Require attention/ }).click()
  await expect(page.locator('.nc-section-row')).toHaveCount(1)
  await expect(page.locator('.nc-section-row')).toContainText('Cucumber zone')
  await page.locator('.nc-structure-footer').getByRole('button', { name: 'Clear filters' }).click()
  await expect(page.locator('.nc-section-row')).toHaveCount(3)
  await page.locator('.nc-section-name').first().click()
  await expect(page.locator('.nc-section-detail')).toBeVisible()
  await page.getByRole('button', { name: 'LT', exact: true }).click()
  await expect(page.locator('.nc-structure-summary')).toContainText('Paruošta')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.locator('.nc-section-row').first().scrollIntoViewIfNeeded()
  await expect(page.locator('.nc-section-profile').first()).toBeVisible()
  await expect(page.locator('.nc-section-nodes').first()).toBeVisible()
  await expect(page.locator('.nc-section-freshness').first()).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: '/tmp/neurocrop-sections-redesign-mobile.png', animations: 'disabled' })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.getByRole('button', { name: 'Erdvės', exact: true }).click()
  await expect(page.locator('.nc-area-row')).toHaveCount(3)
  for (const width of [768, 390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await expect(page.locator('.nc-area-name').first()).toBeVisible()
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: '/tmp/neurocrop-areas-redesign-mobile.png', animations: 'disabled' })
  expect(errors).toEqual([])
})
