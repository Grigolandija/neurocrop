import { test, expect, type Page } from '@playwright/test'

import { graphicsOptions } from './support/graphics'

test.use(graphicsOptions)

async function expectVolumeChangesPixels(page: Page) {
  // This must be a context option: an ignored test option lets the camera intro
  // change the baseline while the software renderer is taking its first frame.
  expect(await page.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true)
  const canvas=page.locator('.nsd-scene canvas')
  const mode=page.locator('.nsd-segments')
  const capture=async()=>{
    await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))))
    await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))))
    return canvas.screenshot({animations:'disabled',style:'.nsd-pins, .nsd-scene-info, .nsd-legend, .nsd-camera { visibility: hidden !important; }'})
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

  await mode.getByRole('button',{name:'Taškai',exact:true}).click()
  const points=await capture()
  const baseline=await compare(points,points)
  // A light canvas must contain actual geometry, not an empty compositor placeholder.
  expect(baseline.backgroundBrightness).toBeGreaterThan(650)
  expect(baseline.modelFraction).toBeGreaterThan(.03)
  await mode.getByRole('button',{name:'Mikroklimatas',exact:true}).click()
  let volume=points,metrics=baseline
  await expect.poll(async()=>{
    volume=await capture();metrics=await compare(points,volume)
    return metrics.changedFraction
  },{message:'The climate field must visibly change the rendered greenhouse, not just its labels',timeout:10000}).toBeGreaterThan(.01)
  await mode.getByRole('button',{name:'Taškai',exact:true}).click()
  let restored=baseline
  // Repeated GPU captures can vary at geometry edges. Removing the field must
  // eliminate at least 75% of its color difference.
  await expect.poll(async()=>{restored=await compare(points,await capture());return restored.meanColorError/metrics.meanColorError},{message:'Removing the field must remove its visible color contribution',timeout:10000}).toBeLessThan(.25)
  await test.info().attach('rendered-climate-check',{body:JSON.stringify({engine:await page.locator('.nsd-explanation small').innerText(),...metrics,restoredColorError:restored.meanColorError},null,2),contentType:'application/json'})
}

// Normal workspace button transitions must never interpolate a projected XYZ
// marker. Compare its visible center with the current camera projection while
// a real pointer drag is moving the scene, rather than after it has settled.
async function expectMarkersFollowOrbit(page: Page) {
  await page.emulateMedia({reducedMotion:'no-preference'})
  // Wait for projected coordinates to change after each real pointer move.
  // A requestAnimationFrame callback alone does not guarantee a GPU redraw.
  const sample=()=>page.locator('.nc-living-canvas').evaluate(host=>{
    const bounds=host.getBoundingClientRect()
    return [...host.querySelectorAll<HTMLElement>('.nc-living-pin')].flatMap(pin=>{
      const target=pin.style.transform.match(/translate\(([-\d.e+]+)px,\s*([-\d.e+]+)px\)/)
      if(!target || getComputedStyle(pin).visibility==='hidden')return []
      const x=Number(target[1]),y=Number(target[2]),box=pin.getBoundingClientRect()
      return [{id:pin.getAttribute('aria-label')!,x,y,error:Math.hypot(box.left+box.width/2-bounds.left-x,box.top+box.height/2-bounds.top-y),transition:getComputedStyle(pin).transitionProperty}]
    })
  })
  await expect(page.locator('.nc-living-pin').first()).toBeVisible()
  const initial=new Map((await sample()).map(pin=>[pin.id,pin]))
  const host=(await page.locator('.nc-living-canvas').boundingBox())!
  await page.mouse.move(host.x+40,host.y+host.height*.55)
  await page.mouse.down()
  const samples:Awaited<ReturnType<typeof sample>>[]=[]
  try {
    for(let step=1;step<=5;step++){
      await page.mouse.move(host.x+40+step*32,host.y+host.height*.55-step*9)
      const previous=new Map((samples.at(-1) || [...initial.values()]).map(pin=>[pin.id,pin]))
      let projected:Awaited<ReturnType<typeof sample>>=[]
      await expect.poll(async()=>{
        projected=await sample()
        return projected.some(pin=>{const old=previous.get(pin.id);return old && Math.hypot(pin.x-old.x,pin.y-old.y)>.5})
      },{message:'Dragging must update the projected sensor positions',timeout:10000,intervals:[50,100,250]}).toBe(true)
      samples.push(projected)
    }
  } finally {
    await page.mouse.up()
    await page.emulateMedia({reducedMotion:'reduce'})
  }
  const points=samples.flat()
  const metrics={frames:samples.length,maxError:Math.max(...points.map(p=>p.error)),travel:Math.max(...points.map(p=>{const first=initial.get(p.id);return first ? Math.hypot(p.x-first.x,p.y-first.y) : 0}))}
  await test.info().attach('sensor-orbit-tracking',{body:JSON.stringify(metrics,null,2),contentType:'application/json'})
  expect(initial.size).toBeGreaterThan(0)
  expect(points.length).toBeGreaterThan(0)
  expect(points.every(p=>p.transition==='none')).toBe(true)
  expect(metrics.frames).toBeGreaterThan(2)
  expect(metrics.travel).toBeGreaterThan(30)
  expect(metrics.maxError,JSON.stringify(metrics)).toBeLessThan(1)
}

test('3D demonstration renders, selects sensors and plays synthetic intervals without requesting private data', async ({ page }) => {
  test.setTimeout(process.platform === 'linux' ? 60_000 : 30_000)
  const errors: string[] = [], requests: string[] = []
  page.on('pageerror', e=>errors.push(e.message))
  page.on('request', r=>{ if (/\/areas|\/readings|\/nodes|\/auth\/me/.test(r.url())) requests.push(r.url()) })
  await page.setViewportSize({width:1600,height:1050})
  await page.clock.setFixedTime(new Date('2026-10-20T12:00:00Z'))
  await page.goto('/greenhouse-live/demo')
  await expect(page.locator('.nsd-notice')).toContainText('Pavyzdinis planas ir sintetiniai matavimai')
  await expect(page.locator('.nsd-explanation small')).toHaveText('WebGPU',{timeout:20000})
  await expect(page.locator('.nsd-render-error')).toHaveCount(0)
  await expect(page.locator('.nsd-pin')).toHaveCount(6)
  await expect(page.locator('.nsd-scene-info')).toContainText('6 sensoriai · 0,6–2,7 m aukštyje')
  await expect(page.getByRole('button',{name:'Mikroklimatas',exact:true})).toHaveAttribute('aria-pressed','true')
  await expectVolumeChangesPixels(page)
  const firstPoint=page.locator('.nsd-pin').filter({hasText:'0,6 m'})
  const nextPoint=page.locator('.nsd-pin').filter({hasText:'1,1 m'})
  await expect(page.locator('.nsd-pin > span:visible')).toHaveCount(6)
  await page.getByTitle('Matavimų etiketės',{exact:true}).click()
  await expect(page.locator('.nsd-pin > span:visible')).toHaveCount(1)
  await nextPoint.click()
  await expect(nextPoint).toHaveClass(/is-selected/)
  await expect(firstPoint).not.toHaveClass(/is-selected/)
  const inspector=page.getByRole('complementary',{name:'Pasirinkto objekto duomenys'})
  await expect(inspector.getByRole('heading',{name:'NSN-000006',exact:true})).toBeVisible()
  await expect(inspector.locator('.nsd-properties').first()).toContainText('1,1 m')
  await nextPoint.focus()
  await page.keyboard.press('Tab')
  await expect(page.locator('.nsd-pin').nth(2)).toBeFocused()
  await expect(page.getByRole('combobox',{name:'Aukštis nuo grindų'})).toHaveCount(0)
  await page.getByRole('button',{name:'+ Pridėti sensoriaus patikrą',exact:true}).click()
  const navigation=page.getByRole('navigation',{name:'Demonstracijos navigacija'})
  await navigation.getByRole('button',{name:/^Veiksmai/}).click()
  await expect(inspector).toContainText('Patikrinti NSN-000006')
  await inspector.getByRole('button',{name:'Pažymėti atlikta ✓'}).click()
  await expect(inspector).toContainText('Pasirinkite sensorių ir pridėkite jo patikrą')
  await navigation.getByRole('button',{name:'Matavimai',exact:true}).click()
  await expect(inspector.locator('.nsd-result')).toHaveCount(6)
  await navigation.getByRole('button',{name:'Ataskaita',exact:true}).click()
  await expect(inspector).toContainText('negalima atskirai nustatyti vertikalaus temperatūros gradiento')
  await page.getByRole('combobox',{name:'Rodiklis',exact:true}).selectOption('co2')
  await expect(page.locator('.nsd-legend')).toContainText('CO₂ · ppm')
  await page.getByRole('combobox',{name:'Rodiklis',exact:true}).selectOption('air-temperature')
  const timeline=page.getByRole('slider',{name:'Pavyzdinės paros laikas'})
  await timeline.fill('20')
  const before=await page.locator('.nsd-time-value b').innerText()
  await page.getByRole('button',{name:'Paleisti istoriją',exact:true}).click()
  await expect(page.locator('.nsd-time-value b')).not.toHaveText(before)
  await page.getByRole('button',{name:'Sustabdyti istoriją',exact:true}).click()
  await page.getByRole('button',{name:'Dabar',exact:true}).click()
  await expect(timeline).toHaveValue('96')
  await page.getByRole('button',{name:'Vaizdas iš viršaus',exact:true}).click()
  // Increasing saved plan Y must move upward, and increasing X to the right.
  const pin=(id:string)=>page.locator('.nsd-pin').and(page.getByRole('button',{name:new RegExp(`^NSN-${id},`)}))
  await expect.poll(async()=>((await pin('000006').boundingBox())?.y || 0)-((await pin('000003').boundingBox())?.y || 0)).toBeLessThan(-20)
  expect((await pin('000002').boundingBox())!.x).toBeGreaterThan((await pin('000003').boundingBox())!.x)
  await page.getByRole('button',{name:'Pradinis vaizdas',exact:true}).click()
  await page.setViewportSize({width:390,height:844})
  await expect(inspector).toBeVisible()
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(requests).toEqual([])
  expect(errors).toEqual([])
})

test('WebGL fallback renders the spatial demo when WebGPU is unavailable', async ({ page }) => {
  await page.addInitScript(()=>Object.defineProperty(navigator,'gpu',{value:undefined,configurable:true}))
  await page.clock.setFixedTime(new Date('2026-10-20T12:00:00Z'))
  await page.goto('/greenhouse-live/demo')
  await expect(page.locator('.nsd-explanation small')).toHaveText('WebGL',{timeout:20000})
  await expect(page.locator('.nsd-render-error')).toHaveCount(0)
  await expect(page.locator('.nsd-pin').first()).toBeVisible()
  await expectVolumeChangesPixels(page)
})

test('unavailable graphics explains the failure and leaves demo readings and history accessible', async ({ page }) => {
  await page.addInitScript(()=>{
    Object.defineProperty(navigator,'gpu',{value:undefined,configurable:true})
    const original=HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function(this: HTMLCanvasElement, type: string, options?: unknown) {
      if (type==='webgl2') return null
      return original.call(this,type,options)
    } as typeof original
  })
  await page.clock.setFixedTime(new Date('2026-10-20T12:00:00Z'))
  await page.goto('/greenhouse-live/demo')
  await expect(page.getByRole('alert')).toContainText('Nepavyko paleisti 3D')
  await expect(page.locator('.nsd-loading')).toHaveCount(0)
  const navigation=page.getByRole('navigation',{name:'Demonstracijos navigacija'})
  await navigation.getByRole('button',{name:'Matavimai',exact:true}).click()
  await expect(page.locator('.nsd-result')).toHaveCount(6)
  await page.getByRole('slider',{name:'Pavyzdinės paros laikas'}).fill('20')
  await expect(page.locator('.nsd-scene-info')).toContainText('ISTORIJA')
  await page.locator('.nsd-result').nth(1).click()
  await expect(page.locator('.nsd-inspector h2')).toHaveText('NSN-000006')
  await expect(page.locator('.nsd-big-value')).not.toHaveText('')
})

test('authenticated view uses only saved sensor positions and does not apply today’s layout to missing history', async ({ page }) => {
  test.setTimeout(60000)
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
  await expect(page.locator('#dashboardSidebar [data-sidebar-action="climate-3d"]')).toHaveCount(0)
  await expect(page.getByRole('heading',{name:'3D išdėstymas',exact:true})).toBeVisible()
  await expect(page.locator('.nc-living-prototype')).toHaveCount(0)
  await expect(page.getByRole('link',{name:'Mazgai ir jų aukščiai',exact:true})).toHaveAttribute('href','/nodes')
  await expect(page.locator('.nc-living')).toHaveAttribute('data-integrated','true')
  await expect(page.getByRole('combobox',{name:/Height above floor|Aukštis nuo grindų/})).toHaveCount(0)
  await expect(page.locator('.nc-living-scene-caption')).toContainText('sensorių aukštis nenurodytas')
  await expectMarkersFollowOrbit(page)
  await page.locator('#dashboardSidebar [data-sidebar-action="sites"]').click()
  await expect(page.locator('.nc-area-row')).toHaveCount(1)
  await page.getByRole('button',{name:'3D išdėstymas: Actual saved greenhouse',exact:true}).click()
  await expect(page).toHaveURL(/greenhouse-live\?area=actual/)
  await expect(page.locator('#dashboardSidebar [data-sidebar-action="climate-3d"]')).toHaveCount(0)
  await expect(page.locator('.nc-living-pin')).toHaveCount(3)
  await page.getByRole('button',{name:'24 valandos',exact:true}).click()
  await expect(page.locator('.nc-living-empty')).toContainText('Šiam laikui nėra užfiksuoto plano')
  await expect(page.locator('.nc-living-pin')).toHaveCount(0)
  await page.getByRole('button',{name:'Dabar',exact:true}).click()
  await expect(page.locator('.nc-living-pin')).toHaveCount(3)
  await page.setViewportSize({width:390,height:844})
  await expect(page.locator('.nc-living-pin').first()).toBeVisible()
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  expect(errors).toEqual([])
})

test('delayed Node readings stay visible with their age and are excluded from the current range',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('neurocrop-interface-language-v1','en'))
  // Use relative timestamps without a virtual clock: resizing this GPU page
  // must let Chromium update native media-query styles and animation frames.
  const now=new Date().toISOString(),old=new Date(Date.now()-40*60_000).toISOString()
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
  await page.setViewportSize({width:390,height:844})
  // Let ResizeObserver and the next rendering frame apply the mobile canvas size.
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))))
  await expect.poll(()=>page.locator('.nc-living-canvas').evaluate(host=>host.clientWidth)).toBeGreaterThan(0)
  await expect.poll(()=>page.locator('.nc-living-pin:visible').count()).toBe(6)

  await expect.poll(()=>page.locator('.nc-living-canvas').evaluate(host=>{
    const bounds=host.getBoundingClientRect()
    return [...host.querySelectorAll('.nc-living-pin')].flatMap(pin=>{
      const box=pin.getBoundingClientRect(),x=box.left+box.width/2,y=box.top+box.height/2
      return x>=bounds.left && x<=bounds.right && y>=bounds.top && y<=bounds.bottom ? [] : [{sensor:pin.getAttribute('aria-label'),x,y,canvas:bounds.toJSON()}]
    })
  })).toEqual([])
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
})

// The old topography experiment was replaced by the public model library.
// Keep real rendering coverage on both backends, including door resizing.
for(const engine of ['WebGPU','WebGL'] as const){
  test(`equipment models render and door settings update geometry in ${engine}`,async({page})=>{
    test.setTimeout(60000)
    const errors:string[]=[]
    page.on('pageerror',e=>errors.push(e.message))
    if(engine==='WebGL')await page.addInitScript(()=>Object.defineProperty(navigator,'gpu',{value:undefined,configurable:true}))
    await page.setViewportSize({width:1600,height:1050})
    await page.goto('/greenhouse-live/models')
    await expect(page.locator('.nep-engine')).toContainText(engine,{timeout:20000})
    const canvas=page.locator('.nep-scene canvas')
    await expect(canvas).toBeVisible()
    const capture=async()=>{
      await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))))
      return canvas.screenshot()
    }
    const before=await capture()
    await page.getByRole('slider',{name:'Durų angos plotis',exact:true}).fill('3')
    await expect(page.getByRole('combobox',{name:'Durų tipas',exact:true})).toHaveValue('single')
    await expect(page.locator('.nep-title')).toContainText('3 ×')
    let resized=before
    await expect.poll(async()=>{resized=await capture();return resized.equals(before)},{message:'Widening a door must update the actual rendered model',timeout:10000}).toBe(false)
    await page.getByRole('combobox',{name:'Durų tipas',exact:true}).selectOption('double')
    await expect(page.getByRole('combobox',{name:'Durų tipas',exact:true})).toHaveValue('double')
    await expect.poll(async()=>(await capture()).equals(resized),{message:'Double doors must have different geometry from single doors',timeout:10000}).toBe(false)
    await page.getByRole('combobox',{name:'Durų tipas',exact:true}).selectOption('sliding')
    await page.getByRole('slider',{name:'Durų aukštis',exact:true}).fill('2.4')
    await expect(page.getByRole('slider',{name:'Durų aukštis',exact:true})).toHaveValue('2.4')
    await page.getByRole('combobox',{name:'Pasukimas išplanavime',exact:true}).selectOption('90')
    await expect(page.getByRole('combobox',{name:'Pasukimas išplanavime',exact:true})).toHaveValue('90')
    await page.locator('.nep-workspace aside').getByRole('button',{name:'Ventiliatorius',exact:true}).click()
    await expect(page.locator('.nep-title h2')).toHaveText('Ventiliatorius')
    await expect(page.locator('.nep-scene canvas')).toBeVisible()
    await expect(page.locator('.nep-scene [role="alert"]')).toHaveCount(0)
    await page.setViewportSize({width:390,height:844})
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
    expect(errors).toEqual([])
  })
}
