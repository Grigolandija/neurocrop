import { test, expect, type Page } from '@playwright/test'

import { graphicsOptions } from './support/graphics'

test.use(graphicsOptions)

async function expectVolumeChangesPixels(page: Page) {
  // This must be a context option: an ignored test option lets the camera intro
  // change the baseline while the software renderer is taking its first frame.
  expect(await page.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true)
  const canvas=page.locator('.nc-living-canvas canvas')
  const mode=page.getByRole('group',{name:/Mikroklimato vaizdavimas|Climate visualization/})
  const capture=async()=>{
    await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))))
    await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))))
    return canvas.screenshot({animations:'disabled',style:'.nc-living-pin, .nc-living-scene-caption, .nc-living-legend, .nc-living-point-key, .nc-living-view-controls { visibility: hidden !important; }'})
  }
  const compare=async(before:Buffer,after:Buffer)=>page.evaluate(async images=>{
    const decode=async(data:string)=>{
      const img=new Image();img.src=`data:image/png;base64,${data}`;await img.decode()
      const c=document.createElement('canvas');c.width=img.width;c.height=img.height
      const ctx=c.getContext('2d')!;ctx.drawImage(img,0,0)
      return {pixels:ctx.getImageData(0,0,c.width,c.height).data,width:c.width,height:c.height}
    }
    const [a,b]=await Promise.all(images.map(decode))
    let modelPixels=0,changed=0,totalError=0
    // The most frequent color is the empty scene background. A corner pixel
    // can include an antialiased rounded border at fractional CSS coordinates.
    const colors=new Map<number,number>();let dominant=0,largest=0
    for(let i=0;i<a.pixels.length;i+=16){
      const rgb=(a.pixels[i]<<16)|(a.pixels[i+1]<<8)|a.pixels[i+2]
      const count=(colors.get(rgb)||0)+1;colors.set(rgb,count)
      if(count>largest){dominant=rgb;largest=count}
    }
    const background=[dominant>>16,(dominant>>8)&255,dominant&255]
    for(let i=0;i<a.pixels.length;i+=4){
      const model=Math.abs(a.pixels[i]-background[0])+Math.abs(a.pixels[i+1]-background[1])+Math.abs(a.pixels[i+2]-background[2])>30
      if(!model)continue
      modelPixels++
      const error=Math.abs(a.pixels[i]-b.pixels[i])+Math.abs(a.pixels[i+1]-b.pixels[i+1])+Math.abs(a.pixels[i+2]-b.pixels[i+2])
      totalError+=error
      if(error>15)changed++
    }
    return {background:Array.from(background),backgroundBrightness:background[0]+background[1]+background[2],modelFraction:modelPixels/(a.width*a.height),changedFraction:changed/Math.max(1,modelPixels),meanColorError:totalError/(Math.max(1,modelPixels)*765),modelPixels,changed,width:a.width,height:a.height}
  },[before.toString('base64'),after.toString('base64')])

  await mode.getByRole('button',{name:/^(Matavimai|Measurements)$/}).click()
  const points=await capture()
  const baseline=await compare(points,points)
  // A light canvas must contain actual geometry, not an empty compositor placeholder.
  expect(baseline.backgroundBrightness).toBeGreaterThan(650)
  expect(baseline.modelFraction).toBeGreaterThan(.03)
  await mode.getByRole('button',{name:/^(Mikroklimatas|Microclimate)$/}).click()
  let volume=points,metrics=baseline
  await expect.poll(async()=>{
    volume=await capture();metrics=await compare(points,volume)
    return metrics.changedFraction
  },{message:'The climate field must visibly change the rendered greenhouse, not just its labels',timeout:10000}).toBeGreaterThan(.01)
  await mode.getByRole('button',{name:/^(Matavimai|Measurements)$/}).click()
  let restored=baseline
  // Repeated GPU captures can vary at geometry edges. Removing the field must
  // eliminate at least 75% of its color difference.
  await expect.poll(async()=>{restored=await compare(points,await capture());return restored.meanColorError/metrics.meanColorError},{message:'Removing the field must remove its visible color contribution',timeout:10000}).toBeLessThan(.25)
  await test.info().attach('rendered-climate-check',{body:JSON.stringify({engine:await page.locator('.nc-living-engine').innerText(),...metrics,restoredColorError:restored.meanColorError},null,2),contentType:'application/json'})
}

test('3D demonstration renders, selects sensors and plays recorded intervals without requesting private data', async ({ page }) => {
  // A cold software Vulkan renderer in Linux CI also captures desktop/mobile frames.
  test.setTimeout(process.platform === 'linux' ? 60_000 : 30_000)
  const errors: string[] = [], requests: string[] = []
  page.on('pageerror', e=>errors.push(e.message))
  page.on('request', r=>{ if (/\/areas|\/readings|\/nodes|\/auth\/me/.test(r.url())) requests.push(r.url()) })
  await page.addInitScript(()=>localStorage.setItem('neurocrop-interface-language-v1','lt'))
  await page.setViewportSize({width:1600,height:1050})
  await page.clock.setFixedTime(new Date('2026-10-20T12:00:00Z'))
  await page.goto('/greenhouse-live/demo')
  await expect(page.locator('.nc-living-source')).toContainText('Demonstraciniai duomenys')
  await expect(page.locator('.nc-living-engine')).toHaveText('WebGPU',{timeout:20000})
  await expect(page.locator('.nc-living-empty')).toHaveCount(0)
  await expect(page.locator('.nc-living-pin')).toHaveCount(6)
  await expect(page.locator('.nc-living-scene-caption')).toContainText('Visas tūris: 0–4,2 m')
  await expect(page.getByRole('button',{name:/^(Mikroklimatas|Microclimate)$/})).toHaveAttribute('aria-pressed','true')
  await expectVolumeChangesPixels(page)
  await expect(page.getByRole('button',{name:'Matavimai',exact:true})).toHaveAttribute('aria-pressed','true')
  await expect(page.locator('.nc-living-comparison')).toContainText('2,8 m − 1,2 m')
  await expect(page.getByRole('button',{name:'Aukščio pjūvis',exact:true})).toHaveCount(0)
  await expect(page.getByRole('combobox',{name:/Height above floor|Aukštis nuo grindų/})).toHaveCount(0)
  await page.getByRole('button',{name:'Mikroklimatas',exact:true}).click()
  await expect(page.locator('.nc-living-pin')).toHaveCount(6)
  await expect(page.locator('.nc-living-pin-label:visible')).toHaveCount(0)
  await page.screenshot({path:'/tmp/neurocrop-living-xyz-volume.png',fullPage:true})
  const firstPoint=page.getByRole('button',{name:/NSN-DEMO-01:/})
  await firstPoint.hover()
  await expect(firstPoint.locator('.nc-living-pin-label')).toBeVisible()
  await expect(page.locator('.nc-living-pin-label:visible')).toHaveCount(1)
  await page.mouse.move(0,0)
  await expect(page.locator('.nc-living-pin-label:visible')).toHaveCount(0)
  await firstPoint.focus()
  await page.keyboard.press('Tab')
  const nextPoint=page.getByRole('button',{name:/NSN-DEMO-02:/})
  await expect(nextPoint).toBeFocused()
  await expect(nextPoint.locator('.nc-living-pin-label')).toBeVisible()
  await page.getByRole('button',{name:'Mikroklimatas',exact:true}).focus()
  await expect(page.locator('.nc-living-pin-label:visible')).toHaveCount(0)
  await firstPoint.click()
  await expect(firstPoint).toHaveAttribute('aria-pressed','true')
  await expect(firstPoint.locator('.nc-living-pin-label')).toBeVisible()
  await expect(page.locator('.nc-living-inspector-head')).toContainText('PASIRINKTAS SENSORIUS')
  await page.screenshot({path:'/tmp/neurocrop-living-point-tooltip.png',fullPage:true})
  await page.getByRole('button',{name:'Uždaryti sensorių'}).click()
  await expect(page.locator('.nc-living-pin-label:visible')).toHaveCount(0)
  await page.locator('#living-time').fill('20')
  const before=await page.locator('.nc-living-timeline-label strong').innerText()
  await page.getByRole('button',{name:'Paleisti istoriją'}).click()
  await expect(page.locator('.nc-living-timeline-label strong')).not.toHaveText(before)
  await page.getByRole('button',{name:'Pristabdyti'}).click()
  await page.locator('#living-time').fill('64')
  await page.getByRole('button',{name:'Vaizdas iš viršaus',exact:true}).click()
  // The saved plan uses Cartesian Y: DEMO-03 at Y=9 must stay above
  // DEMO-01 at Y=2; increasing plan X must still move to the right.
  const pin=(id:string)=>page.getByRole('button',{name:new RegExp(`NSN-DEMO-${id}:`)})
  await expect.poll(async()=>((await pin('03').boundingBox())?.y || 0)-((await pin('01').boundingBox())?.y || 0)).toBeLessThan(-20)
  expect((await pin('02').boundingBox())!.x).toBeGreaterThan((await pin('01').boundingBox())!.x)
  await page.getByRole('button',{name:'Pradinis vaizdas',exact:true}).click()
  await page.waitForTimeout(300)
  await page.screenshot({path:'/tmp/neurocrop-living-desktop.png',fullPage:true})
  await page.setViewportSize({width:390,height:844})
  await expect(page.locator('.nc-living-inspector')).toBeVisible()
  await expect(page.locator('.nc-living-pin-label:visible')).toHaveCount(0)
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({path:'/tmp/neurocrop-living-mobile.png',fullPage:true})
  expect(requests).toEqual([])
  expect(errors).toEqual([])
})

test('WebGL fallback works when WebGPU is unavailable', async ({ page }) => {
  await page.addInitScript(()=>Object.defineProperty(navigator,'gpu',{value:undefined,configurable:true}))
  await page.clock.setFixedTime(new Date('2026-10-20T12:00:00Z'))
  await page.goto('/greenhouse-live/demo')
  await expect(page.locator('.nc-living-engine')).toHaveText('WebGL',{timeout:20000})
  await expect(page.locator('.nc-living-empty')).toHaveCount(0)
  await expect(page.locator('.nc-living-pin').first()).toBeVisible()
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
  await page.clock.setFixedTime(new Date('2026-10-20T12:00:00Z'))
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

test('delayed Node readings stay visible with their age and never enter the current heatmap',async({page})=>{
  const now='2026-10-20T16:00:00Z',old='2026-10-20T15:20:00Z'
  await page.clock.setFixedTime(new Date(now))
  const positions=[[.2,.2],[3.3,.2],[7.3,.2],[3.3,2.2],[.2,4.3],[7.3,4.3]]
  const nodes=positions.map((_,i)=>({devEui:`000000000000000${i}`,displayName:`NSN-00000${i+2}`,status:i===3 ? 'stale' : 'online',sensors:['sht45'],sectionId:'s',lastSeenAt:i===3 ? old : now,measurementHeightsM:{'air-temperature':i===3 ? 2.5 : 1.5},measurements:{airTemperatureC:i===3 ? null : 19+i*.4,rootTemperatureC:i===3 ? null : 18,illuminanceLux:i===3 ? null : 3000,measuredAt:now},lastMeasurements:{airTemperatureC:i===3 ? 29.4 : 19+i*.4,measuredAtByMetric:{airTemperatureC:i===3 ? old : now}}}))
  const context={area:{id:'test',name:'Greenhouse'},mapEnabled:true,nodes,sections:[],profiles:[],permissions:{canEdit:true},map:{
    schemaVersion:1,id:'map',name:'Greenhouse',dimensions:{widthM:8,lengthM:5,heightM:3.7},shape:{type:'rectangle'},gridSizeM:.5,orientationDeg:0,wallThicknessM:.01,createdAt:now,updatedAt:now,
    layers:[{id:'sensors',visible:true,opacity:1}],heatmapSettings:{enabled:true,metric:'air-temperature',interpolationMethod:'idw',idwPower:2,cellSizeM:.25,nearestSensorCount:5,minimumSensorCount:2,maxInfluenceDistanceM:10,maxReadingAgeMinutes:30,opacity:.88,scaleMode:'auto',showConfidence:true},
    objects:[...nodes.map((n,i)=>({id:`sensor-${i}`,type:'sensor-node',name:n.displayName,xM:positions[i][0],yM:positions[i][1],widthM:.2,lengthM:.2,rotationDeg:0,visible:true,layerId:'sensors',metadata:{sensor:n}})),
      ...[.6,3.2].map((y,i)=>({id:`bed-${i}`,type:'growing-table',name:'Bed',xM:.6,yM:y,widthM:6.5,lengthM:1.1,rotationDeg:0,visible:true,layerId:'sensors',metadata:{}})),
      {id:'north-door',type:'door',name:'North door',xM:6.8,yM:4.8,widthM:1,lengthM:.2,rotationDeg:0,visible:true,layerId:'sensors',metadata:{}},
      {id:'east-door',type:'door',name:'East door',xM:7.8,yM:1.5,widthM:.2,lengthM:2,rotationDeg:0,visible:true,layerId:'sensors',metadata:{}}],
  }}
  await page.route('**/runtime-config.js*',r=>r.fulfill({contentType:'application/javascript',body:"window.NEUROCROP_CONFIG={apiBaseUrl:'http://delayed.test'};"}))
  await page.route('http://delayed.test/**',async r=>{
    const path=new URL(r.request().url()).pathname
    const data=path==='/auth/me' ? {user:{id:'test',email:'grower@example.test',role:'owner',organizationId:'test'}} : path==='/areas' ? {areas:[{id:'test',name:'Greenhouse',mapEnabled:true,mapConfigured:true}]} : path==='/sections' ? {sections:[{id:'s',areaId:'test',name:'Section'}]} : path==='/nodes' ? {nodes} : path==='/crop-profiles' ? {profiles:[]} : path==='/areas/test/map' ? context : {}
    await r.fulfill({json:data})
  })
  await page.setViewportSize({width:1600,height:1050})
  await page.goto('/greenhouse-live?area=test')
  await page.locator('[data-product-choice="greenhouse"]').click()
  await expect(page.locator('.nc-living-engine')).toHaveText(/WebGPU|WebGL/,{timeout:20000})
  const delayed=page.locator('.nc-living-sensor-list button[data-delayed="true"]')
  await expect(delayed).toHaveCount(1)
  await expect(delayed).toContainText('29.4 °C')
  await expect(delayed).toContainText('40 min ago')
  await expect(delayed).toContainText('Delayed')
  await expect(page.locator('.nc-living-pin[data-delayed="true"]')).toContainText('29.4')
  await expect(page.locator('.nc-living-big-number')).not.toContainText('29.4')
  await expect(page.locator('.nc-living-range')).toContainText('5/6')
  await expect(page.getByRole('combobox',{name:'Metric'}).locator('option[value="illuminance"]')).toHaveCount(1)
  await expect(page.getByRole('combobox',{name:'Metric'}).getByRole('option',{name:'Substrate temperature',exact:true})).toHaveCount(1)
  await page.screenshot({path:'/tmp/neurocrop-living-contours.png',fullPage:true,animations:'disabled'})
  await page.setViewportSize({width:390,height:844})
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))))
  await expect.poll(()=>page.locator('.nc-living-pin:visible').count()).toBe(6)
  await expect.poll(()=>page.locator('.nc-living-canvas').evaluate(host=>{
    const bounds=host.getBoundingClientRect()
    return [...host.querySelectorAll('.nc-living-pin')].every(pin=>{
      const box=pin.getBoundingClientRect(),x=box.left+box.width/2,y=box.top+box.height/2
      return x>=bounds.left && x<=bounds.right && y>=bounds.top && y<=bounds.bottom
    })
  })).toBe(true)
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  await page.screenshot({path:'/tmp/neurocrop-living-contours-mobile.png',fullPage:true,animations:'disabled'})
})
