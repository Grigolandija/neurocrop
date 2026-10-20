import { test, expect, type Page } from '@playwright/test'

// Chromium's headless native Metal compositor can omit WebGPU canvas pixels
// from screenshots. SwiftShader exercises WebGPU and provides readable pixels.
test.use({ launchOptions: { args: ['--enable-unsafe-webgpu', '--use-angle=swiftshader'] } })

async function expectVolumeChangesPixels(page: Page) {
  const canvas=page.locator('.nc-living-canvas canvas')
  const mode=page.getByRole('group',{name:/Mikroklimato vaizdavimas|Climate visualization/})
  await mode.getByRole('button',{name:/^(Mikroklimatas|Microclimate)$/}).click()
  await page.waitForTimeout(250)
  const volume=(await canvas.screenshot()).toString('base64')
  await mode.getByRole('button',{name:/^(Matavimai|Measurements)$/}).click()
  await page.waitForTimeout(250)
  const floor=(await canvas.screenshot()).toString('base64')
  const changed=await page.evaluate(async images=>{
    const decode=async(data:string)=>{
      const img=new Image();img.src=`data:image/png;base64,${data}`;await img.decode()
      const c=document.createElement('canvas');c.width=img.width;c.height=img.height
      const ctx=c.getContext('2d')!;ctx.drawImage(img,0,0)
      return ctx.getImageData(0,0,c.width,c.height).data
    }
    const [a,b]=await Promise.all(images.map(decode));let different=0
    for(let i=0;i<a.length;i+=4)if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>15)different++
    return different/(a.length/4)
  },[volume,floor])
  expect(changed).toBeGreaterThan(.01)
}

test('3D demonstration renders, selects sensors and plays recorded intervals without requesting private data', async ({ page }) => {
  const errors: string[] = [], requests: string[] = []
  page.on('pageerror', e=>errors.push(e.message))
  page.on('request', r=>{ if (/\/areas|\/readings|\/nodes|\/auth\/me/.test(r.url())) requests.push(r.url()) })
  await page.addInitScript(()=>localStorage.setItem('neurocrop-interface-language-v1','lt'))
  await page.setViewportSize({width:1600,height:1050})
  await page.goto('/greenhouse-live/demo')
  await expect(page.locator('.nc-living-source')).toContainText('Demonstraciniai duomenys')
  await expect(page.locator('.nc-living-engine')).toHaveText(/WebGPU|WebGL/,{timeout:20000})
  await expect(page.locator('.nc-living-empty')).toHaveCount(0)
  await expect(page.locator('.nc-living-pin')).toHaveCount(6)
  await page.waitForTimeout(1700)
  const canvasImage=(await page.locator('.nc-living-canvas canvas').screenshot()).toString('base64')
  const visibleModel=await page.evaluate(async data=>{
    const img=new Image(); img.src=`data:image/png;base64,${data}`; await img.decode()
    const c=document.createElement('canvas'); c.width=img.width; c.height=img.height
    const ctx=c.getContext('2d')!; ctx.drawImage(img,0,0)
    const pixels=ctx.getImageData(0,0,c.width,c.height).data
    let count=0
    for(let i=0;i<pixels.length;i+=4) if(pixels[i]+pixels[i+1]+pixels[i+2]>160)count++
    return count/(c.width*c.height)
  },canvasImage)
  expect(visibleModel).toBeGreaterThan(.03)
  await expect(page.getByRole('button',{name:/^(Mikroklimatas|Microclimate)$/})).toHaveAttribute('aria-pressed','true')
  await expectVolumeChangesPixels(page)
  await expect(page.getByRole('button',{name:'Matavimai',exact:true})).toHaveAttribute('aria-pressed','true')
  await expect(page.locator('.nc-living-comparison')).toContainText('2,8 m − 1,2 m')
  await expect(page.getByRole('button',{name:'Aukščio pjūvis',exact:true})).toHaveCount(0)
  await expect(page.getByRole('combobox',{name:/Height above floor|Aukštis nuo grindų/})).toHaveCount(0)
  await page.getByRole('button',{name:'Mikroklimatas',exact:true}).click()
  await expect(page.locator('.nc-living-pin')).toHaveCount(6)
  await page.screenshot({path:'/tmp/neurocrop-living-xyz-volume.png',fullPage:true})
  await page.getByRole('button',{name:/NSN-DEMO-01:/}).click()
  await expect(page.locator('.nc-living-inspector-head')).toContainText('PASIRINKTAS SENSORIUS')
  await page.getByRole('button',{name:'Uždaryti sensorių'}).click()
  await page.locator('#living-time').fill('20')
  const before=await page.locator('.nc-living-timeline-label strong').innerText()
  await page.getByRole('button',{name:'Paleisti istoriją'}).click()
  await expect(page.locator('.nc-living-timeline-label strong')).not.toHaveText(before)
  await page.getByRole('button',{name:'Pristabdyti'}).click()
  await page.locator('#living-time').fill('64')
  await page.getByRole('button',{name:'Vaizdas iš viršaus',exact:true}).click()
  await page.getByRole('button',{name:'Pradinis vaizdas',exact:true}).click()
  await page.waitForTimeout(300)
  await page.screenshot({path:'/tmp/neurocrop-living-desktop.png',fullPage:true})
  await page.setViewportSize({width:390,height:844})
  await expect(page.locator('.nc-living-inspector')).toBeVisible()
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({path:'/tmp/neurocrop-living-mobile.png',fullPage:true})
  expect(requests).toEqual([])
  expect(errors).toEqual([])
})

test('WebGL fallback works when WebGPU is unavailable', async ({ page }) => {
  await page.addInitScript(()=>Object.defineProperty(navigator,'gpu',{value:undefined,configurable:true}))
  await page.goto('/greenhouse-live/demo')
  await expect(page.locator('.nc-living-engine')).toHaveText('WebGL',{timeout:20000})
  await expect(page.locator('.nc-living-empty')).toHaveCount(0)
  await expect(page.locator('.nc-living-pin').first()).toBeVisible()
  await page.waitForTimeout(1700)
  await expectVolumeChangesPixels(page)
})

test('unavailable graphics shows a useful error and a retry control', async ({ page }) => {
  await page.addInitScript(()=>{
    Object.defineProperty(navigator,'gpu',{value:undefined,configurable:true})
    const original=HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function(type: string, options?: unknown) {
      if (type==='webgl2') return null
      return original.call(this,type,options)
    } as typeof original
  })
  await page.goto('/greenhouse-live/demo')
  await expect(page.locator('.nc-living-empty')).toBeVisible()
  await expect(page.locator('.nc-living-empty button')).toBeVisible()
})

test('authenticated view uses only saved sensor positions and does not apply today’s layout to missing history', async ({ page }) => {
  const now=new Date().toISOString()
  const nodes=Array.from({length:4},(_,i)=>({ devEui:`000000000000000${i}`,status:'online',sensors:['Air temperature'],lastSeenAt:now,measurements:{airTemperatureC:22+i,measuredAt:now} }))
  const context={ area:{id:'actual',name:'Actual saved greenhouse'},mapEnabled:true,nodes,revision:1,updatedAt:now,sections:[],profiles:[],permissions:{canEdit:false},map:{
    schemaVersion:1,id:'actual-map',name:'Actual saved greenhouse',dimensions:{widthM:20,lengthM:12,heightM:4},shape:{type:'rectangle'},gridSizeM:.5,orientationDeg:0,wallThicknessM:.01,createdAt:now,updatedAt:now,
    layers:[{id:'sensors',visible:true,opacity:1}],
    heatmapSettings:{enabled:true,metric:'air-temperature',interpolationMethod:'idw',idwPower:2,cellSizeM:.25,nearestSensorCount:5,minimumSensorCount:2,maxInfluenceDistanceM:15,maxReadingAgeMinutes:30,opacity:.88,scaleMode:'auto',showConfidence:true},
    objects:nodes.slice(0,3).map((n,i)=>({id:`saved-${i}`,type:'sensor-node',name:`Actual sensor ${i}`,xM:2+i*6,yM:3+i*2,widthM:.4,lengthM:.4,rotationDeg:0,visible:true,layerId:'sensors',metadata:{sensor:n}})),
  }}
  const history={areaId:'actual',from:now,to:now,stepMinutes:15,expectedNodes:[],frames:[{observedAt:now,nodes:[]}],layouts:[]}
  const errors:string[]=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.addInitScript(()=>localStorage.setItem('neurocrop-interface-language-v1','lt'))
  await page.route('**/runtime-config.js*',r=>r.fulfill({contentType:'application/javascript',body:"window.NEUROCROP_CONFIG={apiBaseUrl:'http://living.test'};"}))
  await page.route('http://living.test/**',async r=>{
    const path=new URL(r.request().url()).pathname
    let data:unknown={}
    if(path==='/auth/me')data={user:{id:'living-test',email:'grower@example.test',name:'Grower',role:'owner',organizationId:'test'}}
    if(path==='/areas')data={areas:[{id:'actual',name:'Actual saved greenhouse',mapEnabled:true,mapConfigured:true}]}
    if(path==='/sections')data={sections:[{id:'section',areaId:'actual',name:'Section'}]}
    if(path==='/crop-profiles')data={profiles:[]}
    if(path==='/areas/actual/map')data=context
    if(path==='/areas/actual/map/history')data=history
    await r.fulfill({json:data})
  })
  await page.setViewportSize({width:1600,height:1050})
  await page.goto('/greenhouse-live?area=actual')
  await page.locator('[data-product-choice="greenhouse"]').click()
  await expect(page.locator('.nc-living-engine')).toHaveText(/WebGPU|WebGL/,{timeout:20000})
  await expect(page.locator('.nc-living-pin')).toHaveCount(3)
  await expect(page.locator('#dashboardShell')).toBeVisible()
  await expect(page.locator('#dashboardSidebar [data-sidebar-action="climate-3d"]')).toHaveAttribute('aria-current','page')
  await expect(page.getByRole('heading',{name:'3D mikroklimatas',exact:true})).toBeVisible()
  await expect(page.locator('.nc-living-prototype')).toHaveCount(0)
  await expect(page.getByRole('link',{name:'Mazgų aukščiai',exact:true})).toHaveAttribute('href','/nodes')
  await expect(page.locator('.nc-living-source')).toContainText('Jūsų duomenys')
  await expect(page.locator('.nc-living-notice')).toContainText('Aukštį įveskite Mazgai')
  await expect(page.getByRole('combobox',{name:/Height above floor|Aukštis nuo grindų/})).toHaveCount(0)
  await expect(page.locator('.nc-living-scene-caption')).toContainText('sensorių aukštis nenurodytas')
  await page.waitForTimeout(1500)
  await page.screenshot({path:'/tmp/neurocrop-living-saved-plan.png',fullPage:true})
  await page.locator('#dashboardSidebar [data-sidebar-action="sites"]').click()
  await expect(page.locator('.nc-area-row')).toHaveCount(1)
  await page.getByRole('button',{name:'3D mikroklimatas: Actual saved greenhouse',exact:true}).click()
  await expect(page).toHaveURL(/greenhouse-live\?area=actual/)
  await expect(page.locator('#dashboardSidebar [data-sidebar-action="climate-3d"]')).toHaveAttribute('aria-current','page')
  await expect(page.locator('.nc-living-pin')).toHaveCount(3)
  await page.getByRole('button',{name:'24 valandos',exact:true}).click()
  await expect(page.locator('.nc-living-empty')).toContainText('Šiam laikui nėra užfiksuoto plano')
  await expect(page.locator('.nc-living-pin')).toHaveCount(0)
  await page.getByRole('button',{name:'Dabar',exact:true}).click()
  await expect(page.locator('.nc-living-pin')).toHaveCount(3)
  await page.setViewportSize({width:390,height:844})
  await expect(page.locator('.nc-living-pin').first()).toBeVisible()
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  await page.screenshot({path:'/tmp/neurocrop-living-saved-plan-mobile.png',fullPage:true})
  expect(errors).toEqual([])
})
