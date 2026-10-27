import { expect, test, type Page } from '@playwright/test'

async function setup(page: Page, start = '/nodes') {
  const api = 'http://monitoring.test'
  const now = new Date().toISOString()
  const late = new Date(Date.now() - 20 * 60_000).toISOString()
  const old = new Date(Date.now() - 3 * 3600_000).toISOString()
  const ids = ['0011223344556601', '0011223344556602', '0011223344556603']
  const nodes = [
    { devEui: ids[0], name: 'NSN-000001', areaId: 'a', sectionId: 'stable', level: 86, transportStatus: 'live', lastReceivedAt: now, support: { code: 'reporting', expectedIntervalSec: 300, elapsedIntervals: 0 } },
    { devEui: ids[1], name: 'NSN-000002', areaId: 'a', sectionId: 'hot', level: 63, transportStatus: 'delayed', lastReceivedAt: late, support: { code: 'node_unavailable', expectedIntervalSec: 300, elapsedIntervals: 4 } },
    { devEui: ids[2], name: 'NSN-000003', areaId: 'a', sectionId: 'offline', level: 22, transportStatus: 'offline', lastReceivedAt: old, support: { code: 'gateway_unavailable', expectedIntervalSec: 300, elapsedIntervals: 36 } },
  ]
  const sections = [
    { id: 'stable', name: 'Stable bay', areaId: 'a', profileId: 'tomato' },
    { id: 'hot', name: 'Hot bay', areaId: 'a', profileId: 'tomato' },
    { id: 'offline', name: 'No current data', areaId: 'a', profileId: 'tomato' },
  ]
  const zones = sections.map((s, i) => ({ ...s, profile: 'tomato', score: [94, 32, null][i],
    conditionStatus: ['optimal', 'critical', 'unknown'][i], sensorCount: 1, batteryNodes: [nodes[i]],
    availableMetrics: ['airTemp', 'humidity', 'co2'], configuredMetrics: ['airTemp', 'humidity', 'co2'],
    mainCondition: { metricId: 'airTemp', value: [22, 32, null][i], target: [18, 26], unit: '°C' }, computedAt: now }))
  const latest = Object.fromEntries(sections.map((s, i) => [s.id, {
    lastObservedAt: [now, late, old][i], observedAt: [now, late, old][i], expectedUplinkIntervalSec: 300,
    reportingNodes: i ? 0 : 1, registeredNodes: 1,
    observations: {
      airTemp: { value: [22, 32, 19][i], lastObservedAt: [now, late, old][i], expectedIntervalSec: 300, unit: '°C' },
      humidity: { value: [65, 44, 71][i], lastObservedAt: [now, late, old][i], expectedIntervalSec: 300, unit: '%' },
      co2: { value: null, state: 'no-data', lastObservedAt: now, unit: 'ppm' },
    },
  }]))
  await page.route('**/runtime-config.js*', r => r.fulfill({ contentType: 'application/javascript', body: `window.NEUROCROP_CONFIG={apiBaseUrl:'${api}'};` }))
  await page.route(`${api}/**`, async route => {
    const url = new URL(route.request().url()), path = url.pathname
    let data: unknown = {}
    if (path === '/auth/me') data = { user: { id: 'ux-test', email: 'grower@example.test', name: 'Grower', role: 'owner', organizationId: 'test' } }
    if (path === '/areas') data = { areas: [{ id: 'a', name: 'Greenhouse 1', kind: 'Greenhouse' }] }
    if (path === '/sections') data = { sections }
    if (path === '/nodes') data = { nodes }
    if (path === '/dashboard') data = { sites: [{ id: 'a', name: 'Greenhouse 1', mapEnabled: false, zones }] }
    if (path === '/crop-profiles') data = { profiles: [{ id: 'tomato', name: 'Tomatoes', crop: 'Tomato', metrics: { airTemp: { optimal: [18, 26] }, humidity: { optimal: [60, 80] }, co2: { optimal: [600, 1000] } } }] }
    if (path === '/readings/latest-batch') data = { readings: latest }
    if (path === '/readings/latest') data = latest[url.searchParams.get('sectionId') || 'stable']
    if (path === '/actions/today') data = { actions: [{ id: 'hot:airTemp:high', areaId: 'a', sectionId: 'hot', sectionName: 'Hot bay', metricId: 'airTemp', metricLabel: 'Air temperature', state: 'critical', value: 32, target: [18, 26], unit: '°C', title: 'Temperature above target', reason: 'Hot bay is above its crop target.', recommendedAction: 'Check cooling and ventilation.', priorityScore: 90, observedAt: now }] }
    if (path.endsWith('/sensors')) data = { sensors: [] }
    if (path.endsWith('/uplinks')) data = { uplinks: [] }
    await route.fulfill({ json: data })
  })
  await page.goto(start)
  await page.locator('[data-product-choice="greenhouse"]').click()
}

test('Nodes prioritizes attention and exposes filters, instructions and sensor details', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await page.setViewportSize({ width: 1440, height: 1000 })
  await setup(page)
  await expect(page.locator('.nc-node-table tbody tr')).toHaveCount(3)
  await expect(page.locator('.nc-node-table tbody tr').first()).toContainText('NSN-000002')
  await page.screenshot({ path: '/tmp/neurocrop-nodes-refresh.png', animations: 'disabled' })
  await page.locator('.nc-structure-summary').getByRole('button', { name: /Needs attention/ }).click()
  await expect(page.locator('.nc-node-table tbody tr')).toHaveCount(1)
  await expect(page.locator('.nc-node-table tbody')).toContainText('Delayed')
  await page.locator('.nc-node-identity').click()
  await expect(page.locator('.nc-node-support')).toContainText('Check node power')
  await expect(page.locator('.node-detail-health h3')).toHaveText('Data is arriving late')
  expect(await page.locator('.nc-node-support').evaluate(el => el.nextElementSibling?.classList.contains('node-detail-overview'))).toBe(true)
  await expect(page.locator('.nc-node-support > details')).not.toHaveAttribute('open')
  await page.screenshot({ path: '/tmp/neurocrop-node-detail-refresh.png', animations: 'disabled' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(errors).toEqual([])
})

test('Readings preserves current, delayed and missing measurements in its original layout', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await page.setViewportSize({ width: 1440, height: 1000 })
  await setup(page, '/readings')
  await expect(page.locator('.nc-reading-cell[data-quality="stale"]').first()).toBeVisible()
  await expect(page.locator('.nc-reading-cell[data-quality="offline"]').first()).toBeVisible()
  await expect(page.locator('.nc-reading-cell[data-quality="no-data"]').first()).toContainText('No data')
  await expect(page.locator('.nc-reading-cell[data-quality="stale"]').first()).toContainText('32')
  await page.screenshot({ path: '/tmp/neurocrop-readings-restored.png', animations: 'disabled' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.locator('.nc-section-summary-row').first().scrollIntoViewIfNeeded()
  expect(errors).toEqual([])
})
