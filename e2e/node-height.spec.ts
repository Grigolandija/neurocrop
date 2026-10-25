import {test,expect} from '@playwright/test'

import { graphicsOptions } from './support/graphics'

test.use(graphicsOptions)

test('Node height is entered in Nodes, saved, and used automatically by the 3D layout',async({page})=>{
  const devEui='0011223344556677',api='http://node-height.test',now=new Date().toISOString()
  const node={id:devEui,devEui,name:'NSN-000001',areaId:'a',sectionId:'s',transportStatus:'live',lastReceivedAt:now,source:'physical',installationHeightCm:null as number|null}
  const writes:Record<string,unknown>[]=[]
  await page.route('**/runtime-config.js*',r=>r.fulfill({contentType:'application/javascript',body:`window.NEUROCROP_CONFIG={apiBaseUrl:'${api}'};`}))
  await page.route(`${api}/**`,async route=>{
    const path=new URL(route.request().url()).pathname
    let data:unknown={}
    if(path==='/auth/me')data={user:{id:'height-test',email:'test@example.test',name:'Test',role:'owner',organizationId:'test'}}
    if(path==='/areas')data={areas:[{id:'a',name:'Greenhouse',mapEnabled:true,mapConfigured:true}]}
    if(path==='/sections')data={sections:[{id:'s',areaId:'a',name:'Section'}]}
    if(path==='/nodes')data={nodes:[node]}
    if(path===`/nodes/${devEui}` && route.request().method()==='PATCH'){
      const body=route.request().postDataJSON();writes.push(body);node.installationHeightCm=body.installationHeightCm;data={node}
    }
    if(path===`/nodes/${devEui}/sensors`)data={sensors:[]}
    if(path==='/areas/a/map'){
      const metadata={devEui,sectionId:'s',status:'online',sensors:[],lastSeenAt:now,measurementHeightsM:{'air-temperature':node.installationHeightCm===null ? null : node.installationHeightCm/100},measurements:{airTemperatureC:24,measuredAt:now}}
      data={area:{id:'a',name:'Greenhouse'},mapEnabled:true,nodes:[metadata],revision:1,updatedAt:now,sections:[],profiles:[],permissions:{canEdit:true},map:{
        schemaVersion:1,id:'a-map',name:'Greenhouse',dimensions:{widthM:10,lengthM:8,heightM:4},shape:{type:'rectangle'},gridSizeM:.5,orientationDeg:0,wallThicknessM:.01,createdAt:now,updatedAt:now,
        layers:[{id:'sensors',visible:true,opacity:1}],heatmapSettings:{enabled:true,metric:'air-temperature',interpolationMethod:'idw',idwPower:2,cellSizeM:.25,nearestSensorCount:5,minimumSensorCount:2,maxInfluenceDistanceM:15,maxReadingAgeMinutes:30,opacity:.88,scaleMode:'auto',showConfidence:true},
        objects:[{id:'node-point',type:'sensor-node',name:node.name,xM:3,yM:3,widthM:.4,lengthM:.4,rotationDeg:0,visible:true,layerId:'sensors',metadata:{sensor:metadata}}],
      }}
    }
    await route.fulfill({json:data})
  })
  await page.goto(`/nodes/${devEui}`)
  await page.locator('[data-product-choice="greenhouse"]').click()
  await page.getByRole('button',{name:'Edit node',exact:true}).click()
  const dialog=page.getByRole('dialog',{name:'Edit node'})
  await dialog.getByLabel('Node height above floor, cm').fill('175')
  await dialog.getByRole('button',{name:'Save changes',exact:true}).click()
  await expect(dialog).toHaveCount(0)
  expect(writes[0]).toEqual({name:'NSN-000001',sectionId:'s',installationHeightCm:175})
  await page.getByRole('button',{name:'Edit node',exact:true}).click()
  await expect(dialog.getByLabel('Node height above floor, cm')).toHaveValue('175')
  await expect(dialog.getByLabel('Node height above floor, cm')).toBeInViewport()
  await expect.poll(()=>dialog.evaluate(el=>getComputedStyle(el).opacity)).toBe('1')
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click()
  await page.locator('#dashboardSidebar [data-sidebar-action="sites"]').click()
  await page.getByRole('button',{name:'3D layout: Greenhouse',exact:true}).click()
  await expect(page).toHaveURL(/greenhouse-live/)
  await expect(page.locator('.nc-living-engine')).toHaveText(/WebGPU|WebGL/,{timeout:20000})
  await page.locator('.nc-living-sensor-list button').click()
  await expect(page.locator('.nc-living-sensor-detail')).toContainText('1.75 m')
  await expect(page.getByRole('combobox',{name:'Height above floor'})).toHaveCount(0)
  await expect(page.getByRole('heading',{name:'3D layout',exact:true})).toBeVisible()
  await expect(page.locator('.nc-living-pin')).toHaveCount(1)
  await expect(page.locator('.nc-living-pin')).toHaveAttribute('data-height-unknown','false')
})
