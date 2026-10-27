import { expect, test, type Page } from '@playwright/test'

async function setup(page: Page) {
  const requests: string[] = []
  await page.addInitScript(() => localStorage.setItem('neurocrop-interface-language-v1', 'en'))
  await page.route('**/runtime-config.js*', route => route.fulfill({
    contentType: 'application/javascript',
    body: "window.NEUROCROP_CONFIG = { apiBaseUrl: 'https://retired-mobile.test' };",
  }))
  await page.route('https://retired-mobile.test/**', route => {
    requests.push(route.request().url())
    return route.fulfill({ json: { user: null } })
  })
  return requests
}

test('mobile product routes show the desktop notice without mounting authentication or workspaces', async ({ page }) => {
  const requests = await setup(page)
  for (const route of ['/', '/farm-plan', '/areas', '/sections', '/nodes/example', '/readings', '/history', '/alerts', '/register', '/reset-password', '/greenhouse-live/demo']) {
    await page.goto(route)
    await expect(page.getByRole('heading', { name: 'Use NeuroCrop on your computer' })).toBeVisible()
    await expect(page.locator('.nc-desktop-notice')).toContainText('The mobile version is no longer supported.')
    await expect(page.locator('#dashboardShell, #loginForm, .product-entry-screen, canvas, .mobile-dock')).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  expect(requests).toEqual([])
})

test('mobile notice supports Lithuanian, landscape phones and public funding information', async ({ page }) => {
  const requests = await setup(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'LT', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Naudokite NeuroCrop kompiuteryje' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'lt')
  await page.setViewportSize({ width: 844, height: 390 })
  await expect(page.locator('.nc-desktop-notice')).toBeVisible()
  await page.setViewportSize({ width: 320, height: 568 })
  await expect(page.getByRole('button', { name: 'LT', exact: true })).toHaveAttribute('aria-pressed', 'true')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('link', { name: 'ES finansuojamas projektas' }).click()
  await expect(page).toHaveURL(/\/es-finansuojamas-projektas$/)
  await expect(page.locator('.nc-desktop-notice')).toHaveCount(0)
  await expect(page.locator('main')).toBeVisible()
  expect(requests).toEqual([])
})
