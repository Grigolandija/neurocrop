import {test,expect} from '@playwright/test'

test('grower can set a connected sensor height and explicitly mark it unknown without changing its purpose',async({page})=>{
  const devEui='0011223344556677',api='http://sensor-height.test'
  const sensor={port:'scd4x',label:'CO₂ sensor',sensorModel:'SCD4x',detected:true,metrics:['co2'],configurable:true,role:'air_co2',medium:'air',spatialScope:'point',targetType:'incubator',targetName:'Incubator 1',heightCm:null as number|null,useForSectionScore:false,allowSpatialInterpolation:false}
  const writes:unknown[]=[]
  await page.route('**/runtime-config.js*',r=>r.fulfill({contentType:'application/javascript',body:`window.NEUROCROP_CONFIG={apiBaseUrl:'${api}'};`}))
  await page.route(`${api}/**`,async route=>{
    const path=new URL(route.request().url()).pathname
    let data:unknown={}
    if(path==='/auth/me')data={user:{id:'height-test',email:'test@example.test',name:'Test',role:'owner',organizationId:'test'}}
    if(path==='/areas')data={areas:[{id:'a',name:'Greenhouse'}]}
    if(path==='/sections')data={sections:[{id:'s',areaId:'a',name:'Section'}]}
    if(path==='/nodes')data={nodes:[{id:devEui,devEui,name:'NSN-000001',areaId:'a',sectionId:'s',transportStatus:'live',lastReceivedAt:new Date().toISOString(),source:'physical'}]}
    if(path.endsWith('/sensors/scd4x/height')){
      const body=route.request().postDataJSON();writes.push(body);sensor.heightCm=body.heightCm;data={sensors:[sensor]}
    }else if(path.endsWith('/sensors'))data={sensors:[sensor]}
    await route.fulfill({json:data})
  })
  await page.goto(`/nodes/${devEui}`)
  await page.locator('[data-product-choice="greenhouse"]').click()
  await page.getByRole('button',{name:'Set height',exact:true}).click()
  const dialog=page.getByRole('dialog',{name:'Measurement height'})
  await expect(dialog).toBeVisible()
  await expect(dialog.getByLabel('Sensor height above floor, cm')).toBeFocused()
  await dialog.getByLabel('Sensor height above floor, cm').fill('150')
  await dialog.getByRole('button',{name:'Save height',exact:true}).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.locator('.nc-sensor-height-trigger')).toHaveText('1.5 m')
  await page.locator('.nc-sensor-height-trigger').click()
  await dialog.getByLabel('Sensor height above floor, cm').fill('')
  await dialog.getByRole('button',{name:'Save height',exact:true}).click()
  await expect(page.locator('.nc-sensor-height-trigger')).toHaveText('Set height')
  expect(writes).toEqual([{heightCm:150},{heightCm:null}])
  expect(sensor.targetType).toBe('incubator');expect(sensor.useForSectionScore).toBe(false)
  await page.setViewportSize({width:390,height:844})
  await page.locator('.nc-sensor-height-trigger').click()
  await expect(dialog).toBeVisible()
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  await page.screenshot({path:'/tmp/neurocrop-sensor-height-editor.png',fullPage:true})
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(page.locator('.nc-sensor-height-trigger')).toBeFocused()
})
