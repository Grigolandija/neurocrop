import { test, expect } from '@playwright/test'

test('node support explains sensor faults and loads trace only on demand, including retry and translations', async ({ page }) => {
  const devEui = '0011223344556677', api = 'http://node-support.test'
  let traceRequests = 0, failTrace = true
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await page.route('**/runtime-config.js*', r => r.fulfill({ contentType: 'application/javascript', body: `window.NEUROCROP_CONFIG={apiBaseUrl:'${api}'};` }))
  await page.route(`${api}/**`, async route => {
    const path = new URL(route.request().url()).pathname
    let data: unknown = {}
    if (path === '/auth/me') data = { user: { id: 'support-user', email: 'test@example.test', name: 'Test', role: 'owner', organizationId: 'test' } }
    if (path === '/areas') data = { areas: [{ id: 'a', name: 'Šiltnamis' }] }
    if (path === '/sections') data = { sections: [{ id: 's', areaId: 'a', name: 'Zona' }] }
    if (path === '/nodes') data = { nodes: [{ id: 'NSN-000001', devEui, name: 'NSN-000001', areaId: 'a', sectionId: 's',
      lastReceivedAt: new Date().toISOString(), transportStatus: 'live', source: 'physical',
      support: { code: 'sensor_unavailable', expectedIntervalSec: 300, elapsedIntervals: 0 },
      health: { state: 'fault', detail: 'Expected sensor missing', reasons: [{ label: 'Expected sensor missing' }] } }] }
    if (path.endsWith('/sensors')) data = { sensors: [] }
    if (path.endsWith('/uplinks')) {
      traceRequests++
      if (failTrace) { failTrace = false; await route.fulfill({ status: 503, json: { error: { message: 'Fixture outage' } } }); return }
      data = { uplinks: [{ id: 'a'.repeat(64), received_at: new Date().toISOString(), measured_at: new Date().toISOString(),
        frame_counter: 12, firmware_version: '2.1.7', decoder_version: null, normalizer_version: 'telemetry-1', outcome: 'stored',
        evidence: { timestampSource: 'network', metrics: { temperature: { value: null, reason: 'not_new_measurement' }, humidity: { value: 60, reason: 'accepted' } } } }] }
    }
    await route.fulfill({ json: data })
  })
  await page.goto(`/nodes/${devEui}`)
  await page.locator('[data-product-choice="greenhouse"]').click()
  await expect(page.locator('.nc-node-support')).toContainText('Check the sensor connection')
  expect(traceRequests).toBe(0)
  await page.locator('.nc-node-support > details > summary').click()
  await expect(page.locator('.nc-node-support [role="alert"]')).toBeVisible()
  await page.locator('.nc-node-support').getByRole('button', { name: 'Try again' }).click()
  await expect(page.locator('.nc-node-uplink')).toHaveCount(1)
  await page.locator('.nc-node-uplink > summary').click()
  await expect(page.locator('.nc-node-uplink')).toContainText('Sensor did not provide a new measurement')
  await expect(page.locator('.nc-node-uplink')).toContainText('Not reported')
  await expect(page.locator('.nc-node-uplink')).toContainText('Valid new measurement')
  await page.locator('.nc-node-support').scrollIntoViewIfNeeded()
  await page.screenshot({ path: '/tmp/neurocrop-node-support-desktop.png', animations: 'disabled' })
  await page.getByRole('button', { name: 'LT', exact: true }).click()
  await expect(page.locator('.nc-node-support')).toContainText('Patikrinkite jutiklio jungtį')
  await expect(page.locator('.nc-node-uplink')).toContainText('Tinkamas naujas matavimas')
  await page.locator('.nc-node-support').scrollIntoViewIfNeeded()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  expect(traceRequests).toBe(2)
  expect(errors).toEqual([])
})
