import { expect, test } from '@playwright/test'
import { authenticate } from './support/session'

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
