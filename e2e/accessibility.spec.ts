import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { authenticate, prepareRuntime } from './support/session'

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
  await prepareRuntime(page)
})

test('login has no serious accessibility violations', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('#loginForm')).toBeVisible()
  await expect(page.locator('#loginError')).toBeHidden()
  await expectNoSeriousViolations(page)
})

test('authenticated overview has no serious accessibility violations', async ({ page }) => {
  await authenticate(page)
  await expectNoSeriousViolations(page)
})
