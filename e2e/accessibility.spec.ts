import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const apiBaseUrl = process.env.E2E_API_URL || 'http://127.0.0.1:3100'
const password = process.env.E2E_PASSWORD || 'NeuroCrop-CI-Password-2026'

async function expectNoSeriousViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  const violations = results.violations.filter((item) => ['serious', 'critical'].includes(item.impact || ''))
  const summary = violations.flatMap((item) => item.nodes.map((node) =>
    `${item.id}: ${node.target.join(' ')} :: ${node.html}`
  )).join('\n')
  expect(violations, summary).toEqual([])
}

test.beforeEach(async ({ page }) => {
  await page.route('**/runtime-config.js*', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: `window.NEUROCROP_CONFIG = { apiBaseUrl: ${JSON.stringify(apiBaseUrl)} };`
  }))
})

test('login has no serious accessibility violations', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('#loginForm')).toBeVisible()
  await expect(page.locator('#loginError')).toBeHidden()
  await expectNoSeriousViolations(page)
})

test('authenticated overview has no serious accessibility violations', async ({ page }) => {
  const response = await page.request.post(`${apiBaseUrl}/auth/login`, {
    data: { email: 'tenant-a@ci.neurocrop.test', password }
  })
  expect(response.ok(), await response.text()).toBeTruthy()
  await page.goto('/')
  await expect(page.locator('#dashboardShell')).toBeVisible()
  await expectNoSeriousViolations(page)
})
