import { expect, test, type Page } from '@playwright/test'

async function setup(page: Page, canRecord = true) {
  const now = new Date().toISOString(), api = 'http://temperature-workflow.test'
  const action = { id: 's:airTemp:high', scenario: 'area-temperature-v1', verificationMode: 'area-temperature', verificationNodeIds: ['n1', 'n2'], areaId: 'a', areaName: 'Propagation room', sectionId: 's', sectionName: 'Propagation room', metricId: 'airTemp', value: 31, target: [18, 24], observedAt: now, durationMinutes: 20, affectedNodes: 2, reportingNodes: 2, registeredNodes: 2, affectedNodeNames: ['North', 'South'] }
  let status = 'open', outcomeState = 'awaiting_data', error = false, showCurrent = true
  let executionDetails: unknown = null
  const writes: Record<string, unknown>[] = []
  await page.addInitScript(() => localStorage.setItem('neurocrop-interface-language-v1', 'en'))
  await page.route('**/runtime-config.js*', route => route.fulfill({ contentType: 'application/javascript', body: `window.NEUROCROP_CONFIG={apiBaseUrl:'${api}'};` }))
  await page.route(`${api}/**`, async route => {
    const path = new URL(route.request().url()).pathname
    let data: unknown = {}
    if (path === '/auth/me') data = { user: { id: 'grower', email: 'test@example.test', name: 'Grower', role: canRecord ? 'owner' : 'viewer', organizationId: 'test' } }
    if (path === '/areas') data = { areas: [{ id: 'a', name: 'Propagation room' }] }
    if (path === '/sections') data = { sections: [{ id: 's', areaId: 'a', name: 'Propagation room', profileId: 'crop' }] }
    if (path === '/nodes') data = { nodes: [] }
    if (path === '/crop-profiles') data = { profiles: [{ id: 'crop', name: 'Tomatoes', metrics: { airTemp: { optimal: [18, 24] } } }] }
    if (path === '/dashboard') data = { sites: [{ id: 'a', name: 'Propagation room', mapEnabled: false, zones: [{ id: 's', name: 'Propagation room', profile: 'crop', profileId: 'crop', score: 80, sensorCount: 2, availableMetrics: ['airTemp'], configuredMetrics: ['airTemp'], mainCondition: { metricId: 'airTemp', value: 31, target: [18, 24], unit: '°C' }, computedAt: now }] }] }
    if (path === '/actions/today') data = { actions: [] }
    if (path === '/actions/overview-summary') data = { today: {}, recentResults: [] }
    if (path === '/actions/temperature') {
      if (error) return route.fulfill({ status: 503, json: { error: { message: 'Temporary outage' } } })
      data = { currentUserId: 'grower', canRecord, items: [{ id: status === 'open' ? 'open:temperature' : 'saved-feedback', status, action, current: showCurrent ? action : null, createdBy: 'grower', createdByName: 'Grower', createdAt: now, executionDetails, outcome: status === 'completed' ? { state: outcomeState, currentValue: outcomeState === 'awaiting_data' ? null : 23, sampleCount: outcomeState === 'awaiting_data' ? 0 : 3, requiredSampleCount: 3, eligibleAt: now, windowEndsAt: now, observedAt: now, samples: outcomeState === 'awaiting_data' ? [] : [{ value: 25, observedAt: now }, { value: 24, observedAt: now }, { value: 23, observedAt: now }] } : null }] }
    }
    if (path.endsWith('/feedback')) {
      const body = route.request().postDataJSON()
      writes.push(body)
      expect(body.action).toMatchObject(action)
      status = body.status
      executionDetails = body.executionDetails || null
      return route.fulfill({ status: 201, json: { feedback: { id: 'saved-feedback', status } } })
    }
    await route.fulfill({ json: data })
  })
  await page.goto('/')
  await page.locator('[data-product-choice="greenhouse"]').click()
  return { writes, recover() { outcomeState = 'target_reached'; showCurrent = false }, loseData() { outcomeState = 'insufficient_data' }, failRefresh(value: boolean) { error = value } }
}

test('Area heat warning, recorded work and sensor result remain available after reload', async ({ page }) => {
  const fixture = await setup(page)
  const panel = page.getByRole('region', { name: 'Area temperature workflow' })
  await expect(panel).toContainText('Temperature above target')
  await panel.getByRole('button', { name: 'Review', exact: true }).click()
  await expect(panel).toContainText('20 min.')
  await expect(panel).toContainText('2/2 sensors')
  await panel.getByRole('button', { name: 'Start check', exact: true }).click()
  await expect(panel).toContainText('Work in progress')
  await panel.getByRole('button', { name: 'Record work and monitor', exact: true }).click()
  expect(fixture.writes).toHaveLength(1)
  await panel.getByRole('combobox', { name: 'Performed action', exact: true }).selectOption('vents_opened')
  await panel.getByLabel('Actual change or finding', { exact: true }).fill('Opened the side vents')
  await panel.getByRole('button', { name: 'Record work and monitor', exact: true }).click()
  await expect(panel).toContainText('Monitoring the result')
  expect(fixture.writes.map(item => item.status)).toEqual(['in_progress', 'completed'])
  await page.reload()
  await expect(panel).toContainText('Monitoring the result')
  await panel.getByRole('button', { name: 'Review', exact: true }).click()
  await expect(panel).toContainText('Opened the side vents')
  fixture.recover()
  await panel.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(panel).toContainText('Temperature returned to target')
  await expect(panel.getByRole('img', { name: 'Highest temperature after work' })).toBeVisible()
  fixture.loseData()
  await panel.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(panel).toContainText('Not enough data to verify')
  fixture.failRefresh(true)
  await panel.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(panel.getByRole('alert')).toContainText('could not be refreshed')
  await expect(panel).toContainText('Opened the side vents')
})

test('viewer can review Area heat evidence but cannot record work', async ({ page }) => {
  await setup(page, false)
  const panel = page.getByRole('region', { name: 'Area temperature workflow' })
  await panel.getByRole('button', { name: 'Review', exact: true }).click()
  await expect(panel.getByRole('button', { name: 'Start check' })).toHaveCount(0)
  await expect(panel).toContainText('Team members with editing permission can record work.')
})
