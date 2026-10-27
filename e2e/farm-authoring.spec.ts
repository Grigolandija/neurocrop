import { expect, test, type Page } from '@playwright/test'
import { apiBaseUrl, authenticate } from './support/session'
import { graphicsOptions } from './support/graphics'
import type { FarmPlanDocument } from '../src/features/farm-plan/farmPlanData'
import type { GreenhouseMap } from '../src/features/greenhouse-map/model'

test.use(graphicsOptions)

type SavedFarm = { plan: FarmPlanDocument; revision: number; layouts: { areaId: string; map: GreenhouseMap }[] }
const devEui = '00000000000000c1'

async function get<T>(page: Page, path: string): Promise<T> {
  const response = await page.request.get(`${apiBaseUrl}${path}`)
  expect(response.ok(), await response.text()).toBe(true)
  return response.json() as Promise<T>
}

async function enterNumber(page: Page, label: string, value: string) {
  const field = page.getByLabel(label, { exact: true })
  await field.fill(value)
  await field.press('Enter')
  await expect(field).toHaveValue(value)
}

test('a grower creates Areas, saves equipment and Node height, reloads, and opens the same layout in Overview', async ({ page }) => {
  test.setTimeout(120000)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => {
    localStorage.setItem('neurocrop-interface-language-v1', 'en')
    Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true })
  })
  await authenticate(page, 'tenant-authoring@ci.neurocrop.test')
  const initial = await get<SavedFarm>(page, '/farm-plan')
  // This tenant belongs only to this scenario, including retries. Never alter
  // tenant A/B fixtures used by the other integration and browser tests.
  for (const area of initial.plan.areas || []) {
    const response = await page.request.delete(`${apiBaseUrl}/areas/${area.id}?keepSections=true`)
    expect(response.ok(), await response.text()).toBe(true)
  }
  await page.goto('/farm-plan')
  const editor = page.locator('.nfa-editor')
  const save = editor.locator('.nc-farm-save')
  const properties = page.getByRole('region', { name: 'Area properties', exact: true })
  const object = page.getByRole('region', { name: 'Object properties', exact: true })
  const created: string[] = []
  try {
    await editor.getByTitle('Add Area', { exact: true }).click()
    await properties.getByRole('tab', { name: 'Settings', exact: true }).click()
    await properties.getByLabel('Name', { exact: true }).fill('Propagation room')
    await properties.getByLabel('Name', { exact: true }).press('Enter')
    await properties.getByRole('tab', { name: 'Dimensions', exact: true }).click()
    await enterNumber(page, 'Height, m', '4')
    await save.click()
    await expect(save).toHaveText('Saved')
    let farm = await get<SavedFarm>(page, '/farm-plan')
    expect(farm.plan.areas).toHaveLength(1)
    const areaId = farm.plan.areas[0].id
    created.push(areaId)
    expect(farm.plan.areas[0]).toMatchObject({ name: 'Propagation room', height: 4 })

    await editor.getByRole('button', { name: 'Equipment', exact: true }).click()
    await page.getByRole('group', { name: 'Add an object', exact: true }).getByRole('button', { name: 'Growing table', exact: true }).click()
    await editor.getByRole('button', { name: 'Properties', exact: true }).click()
    await object.getByLabel('Width m', { exact: true }).fill('2')
    await object.getByLabel('Width m', { exact: true }).press('Enter')
    await object.getByLabel('Length m', { exact: true }).fill('1')
    await object.getByLabel('Length m', { exact: true }).press('Enter')
    await object.getByRole('tab', { name: 'Position', exact: true }).click()
    await object.getByLabel('Rotation °', { exact: true }).fill('90')
    await object.getByLabel('Rotation °', { exact: true }).press('Enter')
    await editor.getByRole('button', { name: 'Copy', exact: true }).click()
    await editor.getByRole('button', { name: 'Paste', exact: true }).click()
    await expect(editor.locator('.nfa-gear [data-type="growing-table"]')).toHaveCount(2)
    await editor.getByRole('button', { name: 'Delete from drawing', exact: true }).click()
    await expect(editor.locator('.nfa-gear [data-type="growing-table"]')).toHaveCount(1)

    await editor.getByRole('button', { name: 'Equipment', exact: true }).click()
    await page.getByRole('group', { name: 'Add an object', exact: true }).getByRole('button', { name: 'Lamp', exact: true }).click()
    await editor.getByRole('button', { name: 'Properties', exact: true }).click()
    await object.getByRole('tab', { name: 'Mounting', exact: true }).click()
    await object.getByRole('combobox').selectOption('ceiling')
    await object.getByLabel('Ceiling clearance m', { exact: true }).fill('0.3')
    await object.getByLabel('Ceiling clearance m', { exact: true }).press('Enter')

    await editor.getByRole('button', { name: 'Nodes', exact: true }).click()
    await editor.getByRole('combobox', { name: 'Node filter', exact: true }).selectOption('unassigned')
    await editor.getByRole('button', { name: 'CI Authoring Node — Assign to this Area', exact: true }).click()
    await editor.getByRole('button', { name: 'Assign and place', exact: true }).click()
    await object.getByLabel('Height above floor, m', { exact: true }).fill('1.75')
    await object.getByRole('button', { name: 'Save height', exact: true }).click()
    await expect(object.getByLabel('Height above floor, m', { exact: true })).toHaveValue('1.75')
    await save.click()
    await expect(save).toHaveText('Saved')
    farm = await get<SavedFarm>(page, '/farm-plan')
    const layout = farm.layouts.find(layout => layout.areaId === areaId)!.map
    expect(layout.objects.find(item => item.type === 'growing-table')).toMatchObject({ widthM: 2, lengthM: 1, rotationDeg: 90 })
    expect(layout.objects.find(item => item.type === 'lamp')?.metadata.equipmentPlacement).toMatchObject({ mount: 'ceiling', offsetM: .3 })
    expect(layout.objects.find(item => item.type === 'sensor-node')?.metadata.sensor?.devEui).toBe(devEui)
    const nodes = await get<{ nodes: { devEui: string; installationHeightCm: number }[] }>(page, '/nodes')
    expect(nodes.nodes.find(node => node.devEui === devEui)?.installationHeightCm).toBe(175)

    await editor.getByTitle('Add Area', { exact: true }).click()
    await save.click()
    await expect(save).toHaveText('Saved')
    farm = await get<SavedFarm>(page, '/farm-plan')
    created.push(...farm.plan.areas.filter(area => area.id !== areaId).map(area => area.id))
    expect(farm.plan.areas).toHaveLength(2)
    await page.reload()
    await editor.getByRole('combobox', { name: 'Selected Area', exact: true }).selectOption(areaId)
    await expect(editor.locator('[data-type="growing-table"]')).toHaveCount(1)
    await expect(editor.locator('[data-type="lamp"]')).toHaveCount(1)
    await expect(editor.locator('[data-type="sensor-node"]')).toHaveCount(1)

    await page.goto('/')
    const scene = page.locator('.nc-farm-scene')
    await expect(scene.locator('canvas')).toBeVisible()
    await page.getByRole('combobox', { name: 'Choose an Area to inspect', exact: true }).selectOption(areaId)
    await expect(scene).toHaveAttribute('data-isolated-area', areaId)
    await expect(page.locator('.nc-farm-area-summary')).toContainText('Propagation room')
    await page.getByRole('button', { name: 'Open 2D map', exact: true }).click()
    const detail = page.locator('.nc-farm-detail-map')
    await expect(detail.getByRole('button', { name: '2D', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(detail.locator('.gh-canvas-shell')).toBeVisible()
    const loaded = await get<{ map: GreenhouseMap }>(page, `/areas/${areaId}/map`)
    expect(loaded.map.objects.map(item => [item.id, item.xM, item.yM, item.rotationDeg])).toEqual(layout.objects.map(item => [item.id, item.xM, item.yM, item.rotationDeg]))
    await detail.getByRole('button', { name: '3D', exact: true }).click()
    await expect(detail.locator('.nc-living-stage')).toHaveAttribute('data-renderer', 'WebGL')
    await expect(detail.locator('.nc-living-pin')).toHaveCount(1)
    await expect(detail.locator('.nc-living-pin')).toHaveAttribute('data-height-unknown', 'false')
    await expect(detail.locator('.nc-living-empty')).toHaveCount(0)
    await detail.getByRole('button', { name: 'Back to Area overview', exact: true }).click()
    await page.getByRole('button', { name: 'Back to whole farm', exact: true }).click()
    await expect(scene).not.toHaveAttribute('data-isolated-area', areaId)
    expect(errors).toEqual([])
  } finally {
    const latest = await get<SavedFarm>(page, '/farm-plan')
    for (const id of new Set([...created, ...(latest.plan.areas || []).map(area => area.id)])) {
      const response = await page.request.delete(`${apiBaseUrl}/areas/${id}?keepSections=true`)
      expect([200, 404]).toContain(response.status())
    }
  }
})
