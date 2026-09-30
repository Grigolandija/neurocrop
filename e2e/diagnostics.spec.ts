import {test,expect} from '@playwright/test'
const api='http://diagnostics.test'
const metric={sectionId:'north',name:'Šiaurės zona',metric:'airTemp',unit:'°C',minimum:20,maximum:31,mean:25.8,observedMinutes:1000,expectedMinutes:1100,belowMinutes:0,aboveMinutes:280,unknownMinutes:100,coveragePct:90.9,outsideObservedPct:28,estimatedContextPct:0,peerDelta:2.1,peerMinutes:900,peerOutsidePct:70,recurringDays:5,medianSpread:2.8,maxSpread:4.2,dayMean:26,nightMean:22,daylightExposurePpmHours:null,lightAccumulationLuxHours:null,hourly:Array.from({length:24},(_,hour)=>({hour,observedMinutes:60,outsideMinutes:hour<6?30:0,recurringDays:hour<6?5:0}))}
const report={area:{id:'area',name:'Bandomasis šiltnamis'},from:'2026-09-01T00:00:00Z',to:'2026-09-08T00:00:00Z',days:7,generatedAt:'2026-09-08T00:00:00Z',methodVersion:'diagnostics-1.0',timeZone:'Europe/Vilnius',daily:[],metrics:[metric],nodes:[{...metric,nodeId:'node-1',nodeName:'NeuroSense 1'}],ranking:[metric],insights:[{...metric,kind:'systematic-peer',severity:'high'}],episodes:[],episodesTruncated:false,warnings:[],inputs:{controller:false,calibration:false,cycle:false,ppfd:false,energy:false,yield:false},controllerEvents:[],interventions:[],calibrations:[],cycles:[]}
test('diagnostic navigation, evidence, saved report and mobile layout with explicit fixtures',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message))
 await page.route('**/runtime-config.js*',r=>r.fulfill({contentType:'application/javascript',body:`window.NEUROCROP_CONFIG={apiBaseUrl:'${api}'};`}))
 await page.route(`${api}/**`,async route=>{
  const path=new URL(route.request().url()).pathname
  let data:unknown={}
  if(path==='/auth/me')data={user:{id:'test-user',email:'test@example.test',role:'owner',organizationId:'test',name:'Test'}}
  if(path==='/areas')data={areas:[{id:'area',name:'Bandomasis šiltnamis'}]}
  if(path==='/sections')data={sections:[{id:'north',name:'Šiaurės zona',areaId:'area'}]}
  if(path==='/nodes')data={nodes:[]}
  if(path==='/alerts')data={alerts:[]}
  if(path==='/actions/today')data={actions:[]}
  if(path==='/diagnostics/areas/area')data=report
  if(path==='/diagnostics/areas/area/schedule')data={enabled:false}
  if(path==='/diagnostic-reports')data=route.request().method()==='POST'?{id:'saved-1',snapshot:report}:{reports:[{id:'saved-1',area_id:'area',area:report.area,created_at:report.to,from:report.from,to:report.to,days:'7'}]}
  if(path==='/diagnostic-reports/saved-1')data={id:'saved-1',snapshot:report}
  await route.fulfill({json:data})
 })
 await page.goto('/diagnostics')
 await page.locator('[data-product-choice="greenhouse"]').click()
 await expect(page.locator('[data-nc-react-workspace="diagnostics"]')).toBeVisible()
 await expect(page.locator('.diag-heading h1')).toContainText(/diagnos/i)
 await expect(page.locator('.diag-insights')).toContainText(/2[,.]1/)
 await expect(page.locator('.diag-next-step')).toContainText(/airflow|oro judėjimas/)
 await expect(page.locator('.diag-kpis')).toHaveCount(0)
 await page.locator('.diag-finding button').first().click()
 await expect(page.locator('.diag-panel.active table').first()).toContainText('Šiaurės zona')
 await page.locator('.diag-toolbar .primary').click()
 await expect(page.locator('.diag-period b')).toContainText(/snapshot|ataskaita/i)
 await page.locator('.diag-tabs button').nth(3).click()
 await expect(page.locator('.diag-report-row')).toHaveCount(1)
 await page.locator('.diag-report-row button').first().click()
 await expect(page.locator('.diag-insights')).toBeVisible()
 await page.getByRole('button',{name:'LT',exact:true}).click()
 await expect(page.locator('.diag-verdict')).toContainText('Patikrinkite')
 await page.evaluate(()=>{(document.activeElement as HTMLElement)?.blur();window.scrollTo(0,0)})
 await page.screenshot({path:'/tmp/neurocrop-diagnostics-desktop.png',fullPage:true,animations:'disabled'})
 await page.setViewportSize({width:390,height:844})
 await page.evaluate(()=>window.scrollTo(0,0))
 await page.screenshot({path:'/tmp/neurocrop-diagnostics-mobile.png',fullPage:true,animations:'disabled'})
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true)
 await page.emulateMedia({media:'print'})
 await expect(page.locator('.diag-print-summary')).toBeVisible()
 await expect(page.locator('.diag-report-row')).not.toBeVisible()
 expect(errors).toEqual([])
})
