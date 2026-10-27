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
  const farmAreas = areas.map((area,index)=>({id:area.id,name:area.name,kind:'room',height:3,polygon:[{xM:index*10,yM:0},{xM:index*10+8,yM:0},{xM:index*10+8,yM:5},{xM:index*10,yM:5}]}))
  const nodes = [
    { devEui: '0011223344556677', areaId: 'north', sectionId: 'tomato', name: 'NSN-000001', lastReceivedAt: now, transportStatus: 'live' },
    { devEui: '0011223344556688', areaId: 'south', sectionId: 'cucumber', name: 'NSN-000002', transportStatus: 'offline' },
  ]
  await page.route('**/runtime-config.js*', r => r.fulfill({ contentType: 'application/javascript', body: `window.NEUROCROP_CONFIG={apiBaseUrl:'${api}'};` }))
  await page.route(`${api}/**`, async route => {
    const url=new URL(route.request().url()),path=url.pathname
    let data: unknown = {}
    if (path === '/auth/me') data = { user: { id: 'structure-user', email: 'test@example.test', name: 'Test', role: 'owner', organizationId: 'test' } }
    if (path === '/areas') data = { areas }
    if (path === '/farm-plan') data = {draftScope:'test:structure-user',revision:1,updatedAt:now,plan:{version:2,name:'Test farm',dimensions:{widthM:50,lengthM:34},areas:farmAreas},areas,layouts:[],permissions:{canEdit:true}}
    if (path === '/sections') data = {sections:[...areas.map(area=>({id:`scope-${area.id}`,area_id:area.id,name:area.name,is_area_default:true,nodes:0})),...sections.map(group=>({...group,area_id:group.areaId,crop_profile:group.profileId}))].filter(group=>!url.searchParams.get('areaId') || group.area_id===url.searchParams.get('areaId'))}
    const area=areas.find(area=>path.startsWith(`/areas/${area.id}/`))
    if(area && path.endsWith('/cultivation'))data={areaId:area.id,defaultSectionId:`scope-${area.id}`,cropProfile:sections.find(group=>group.areaId===area.id)?.profileId}
    if(area && path.endsWith('/map'))data={area,mapEnabled:true,map:null,nodes:nodes.filter(node=>node.areaId===area.id),revision:0,updatedAt:null,permissions:{canEdit:true}}
    if (path === '/nodes') data = { nodes }
    if (path === '/dashboard') data = { sites: areas.map((a, i) => ({ ...a, zones: [{ ...sections[i], overall: { state: ['optimal', 'critical', 'warning'][i], score: [95, 32, 68][i] } }] })) }
    if (path === '/crop-profiles') data = { profiles: [{ id: 'tomato', name: 'Tomatoes', crop: 'Tomato', stage: 'Vegetative' }, { id: 'cucumber', name: 'Cucumbers', crop: 'Cucumber' }] }
    await route.fulfill({ json: data })
  })
  await page.goto('/areas')
  await page.locator('[data-product-choice="greenhouse"]').click()
  await expect(page.locator('.nc-area-row')).toHaveCount(3)
}

test('Areas retain responsive controls and old Sections links open optional cultivation groups in the Farm plan', async ({ page }) => {
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
  await expect(page.locator('[data-sidebar-action="zones"]')).toHaveCount(0)
  await page.goto('/sections?area=north')
  await expect(page).toHaveURL(/\/farm-plan\?cultivation=1&area=north$/)
  await expect(page.locator('.nfa-editor')).toBeVisible()
  const cultivation=page.getByRole('region',{name:'Cultivation',exact:true})
  await expect(cultivation).toBeVisible()
  await expect(cultivation.getByRole('combobox',{name:'Area crop profile',exact:true})).toHaveValue('tomato')
  await cultivation.locator('.nfa-growing-groups > summary').click()
  await expect(cultivation.getByLabel('Group',{exact:true})).toHaveValue('Tomato zone')
  await expect(cultivation.getByRole('combobox',{name:'Crop profile',exact:true}).first()).toHaveValue('tomato')
  await page.setViewportSize({width:1024,height:900})
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  await expect(cultivation.getByRole('combobox',{name:'Area crop profile',exact:true})).toBeVisible()
  await page.setViewportSize({width:1440,height:1000})
  await page.locator('[data-sidebar-action="sites"]:visible').click()
  await expect(page.locator('.nc-area-row')).toHaveCount(3)
  for (const width of [1440, 1024, 768]) {
    await page.setViewportSize({ width, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await expect(page.locator('.nc-area-name').first()).toBeVisible()
  }
  await page.setViewportSize({ width: 1024, height: 900 })
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: '/tmp/neurocrop-areas-redesign-compact.png', animations: 'disabled' })
  expect(errors).toEqual([])
})
