import {test,expect} from '@playwright/test'
import {withAgronomicInsights} from '../backend/agronomy/index.js'
const api='http://diagnostics.test'
const metric={sectionId:'north',name:'Šiaurės zona',metric:'airTemp',unit:'°C',minimum:20,maximum:31,mean:25.8,observedMinutes:1000,expectedMinutes:1100,belowMinutes:0,aboveMinutes:280,unknownMinutes:100,coveragePct:90.9,outsideObservedPct:28,estimatedContextPct:0,peerDelta:2.1,peerMinutes:900,peerOutsidePct:70,recurringDays:5,medianSpread:2.8,maxSpread:4.2,dayMean:26,nightMean:22,daylightExposurePpmHours:null,lightAccumulationLuxHours:null,hourly:Array.from({length:24},(_,hour)=>({hour,observedMinutes:60,outsideMinutes:hour<6?30:0,recurringDays:hour<6?5:0}))}
const map={schemaVersion:1,id:'test-map',name:'Test map',shape:{type:'rectangle'},dimensions:{widthM:20,lengthM:8,heightM:4},wallThicknessM:.01,gridSizeM:.5,orientationDeg:0,createdAt:'2026-09-01',updatedAt:'2026-09-01',layers:['structure','sensors'].map(id=>({id,name:id,visible:true,locked:true,opacity:1})),heatmapSettings:{enabled:false,metric:'air-temperature',interpolationMethod:'idw',idwPower:2,cellSizeM:.25,nearestSensorCount:5,minimumSensorCount:2,maxInfluenceDistanceM:15,maxReadingAgeMinutes:30,opacity:.88,scaleMode:'auto',showConfidence:true},objects:[{id:'door',type:'door',name:'Durys',xM:9,yM:0,widthM:1.2,lengthM:.25,rotationDeg:0,layerId:'structure',visible:true,locked:true,metadata:{}},{id:'sensor',type:'sensor-node',name:'NeuroSense 1',xM:10,yM:2,widthM:.65,lengthM:.65,rotationDeg:0,layerId:'sensors',visible:true,locked:true,metadata:{sensor:{devEui:'node-1',installationConfirmedAt:'2026-09-01',sensors:[],status:'unassigned'}}}]}
const report={agronomy:[{kind:'high-vpd',nodeId:'node-1',nodeName:'NeuroSense 1',sectionId:'north',sectionName:'Šiaurės zona',profileId:'tomato',stage:'vegetative',crops:['Tomato'],estimated:false,minutes:180,longestMinutes:60,rootDryMinutes:90,rootObservedMinutes:180,vpdMin:1.6,vpdMax:2.4,target:[.6,1.2],firstAt:'2026-09-05T10:00:00Z',lastAt:'2026-09-05T13:00:00Z',dewPoint:null,leafTemperature:null}],explanations:[{nodeId:'node-1',nodeName:'NeuroSense 1',sectionId:'north',metric:'airTemp',observedMinutes:1000,estimatedPct:0,directions:{above:{minutes:280,meanDeparture:3.2,matchedRelated:[{metric:"humidity",during:60,baseline:70,matchedMinutes:120,hourContextGroups:2}],eventCount:5,longestMinutes:90,days:5,peak:{at:'2026-09-05T13:00:00Z',value:31,limit:25,departure:6},peakHours:[{hour:16,minutes:180},{hour:17,minutes:100}],longestEvents:[{from:'2026-09-05T13:00:00Z',to:'2026-09-05T14:30:00Z',minutes:90}],scope:'local',peersAtPeak:{count:3,configuredCount:3,sameDirectionCount:0,median:24}}},halves:[{coveragePct:90,outsidePct:30},{coveragePct:91,outsidePct:26}],trend:'comparable',related:[{metric:'humidity',during:60,otherwise:70,duringMinutes:280,otherwiseMinutes:720}]}],diagnosticMap:map,traces:[{nodeId:'node-1',nodeName:'NeuroSense 1',sectionId:'north',metric:'airTemp',points:Array.from({length:168},(_,i)=>({at:new Date(Date.parse('2026-09-01T00:00:00Z')+i*3600000).toISOString(),min:20+Math.sin(i/4)*3,max:26+Math.sin(i/4)*3,mean:23+Math.sin(i/4)*3,target:[20,25],count:6}))}],area:{id:'area',name:'Bandomasis šiltnamis'},from:'2026-09-01T00:00:00Z',to:'2026-09-08T00:00:00Z',days:7,generatedAt:'2026-09-08T00:00:00Z',methodVersion:'diagnostics-1.0',timeZone:'Europe/Vilnius',daily:[],metrics:[metric],nodes:[{...metric,nodeId:'node-1',nodeName:'NeuroSense 1'}],ranking:[metric],insights:[{...metric,kind:'systematic-peer',severity:'high'}],episodes:[],episodesTruncated:false,warnings:['legacy-context-estimated'],inputs:{controller:false,calibration:false,cycle:false,ppfd:false,energy:false,yield:false},controllerEvents:[],interventions:[],calibrations:[],cycles:[]}
for(const [key,unit,mean,low,high] of [['humidity','%',85,65,80],['vpd','kPa',.4,.6,1.2],['co2','ppm',450,600,1000]] as const){
 const m={...metric,metric:key,unit,mean,dayMean:mean,nightMean:mean,minimum:mean*.9,maximum:mean*1.1,belowMinutes:mean<low?280:0,aboveMinutes:mean>high?280:0,peerDelta:0,recurringDays:2}
 report.metrics.push(m);report.nodes.push({...m,nodeId:'node-1',nodeName:'NeuroSense 1'})
 report.insights.push({...m,kind:'outside-target',severity:'medium'})
 report.traces.push({...report.traces[0],metric:key,points:report.traces[0].points.map(p=>({...p,min:mean*.9,max:mean*1.1,mean,target:[low,high]}))})
}
report.traces.push({...report.traces[0],nodeId:'peer-1',nodeName:'NeuroSense 2',sectionId:'south',points:report.traces[0].points.map(p=>({...p,min:p.min-2,max:p.max-2,mean:p.mean-2}))})
const growthFixtures=[
 ['heat-load','airTemp',30,'°C'],['co2-low-lit','co2',300,'ppm'],['light-low','ppfd',100,'µmol/m²/s'],
 ['wet-root','soilMoisture',80,'%'],['substrate-salinity','soilEc',4,'mS/cm'],['ph-high','ph',7.5,''],
].map(([kind,metric,value,unit])=>({kind,primaryMetric:metric,nodeId:'node-1',nodeName:'NeuroSense 1',sectionId:'north',sectionName:'Šiaurės zona',profileId:'crop',stage:'vegetative',crops:['Tomato'],estimated:false,minutes:120,longestMinutes:60,firstAt:report.from,lastAt:report.to,support:[{metric,minimum:value,maximum:value,target:null,unit}]}))
const expandedReport=withAgronomicInsights({...report,agronomy:[...report.agronomy,...growthFixtures]},'historical-analysis')
test('diagnostic navigation, evidence, saved report and mobile layout with explicit fixtures',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message))
 let savedSnapshot=withAgronomicInsights({...report,agronomy:expandedReport.agronomy,days:14,from:'2026-08-25T00:00:00Z'}),analysisCalls=0
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
  if(path==='/diagnostics/areas/area'){analysisCalls++;data=expandedReport}
  if(path==='/diagnostics/areas/area/schedule')data={enabled:false}
  if(path==='/diagnostic-reports'){
   if(route.request().method()==='POST'){savedSnapshot=expandedReport;data={id:'saved-1',snapshot:savedSnapshot}}
   else data={reports:[{id:'saved-1',area_id:'area',area:report.area,created_at:report.to,from:savedSnapshot.from,to:report.to,days:String(savedSnapshot.days)}]}
  }
  if(path==='/diagnostic-reports/saved-1')data={id:'saved-1',snapshot:savedSnapshot}
  await route.fulfill({json:data})
 })
 await page.goto('/diagnostics')
 await page.locator('[data-product-choice="greenhouse"]').click()
 await expect(page.locator('[data-nc-react-workspace="diagnostics"]')).toBeVisible()
 await expect(page.locator('.diag-heading h1')).toContainText(/diagnos/i)
 await expect(page.locator('.diag-finding')).toHaveCount(0)
 await expect(page.locator('.diag-start')).toBeVisible()
 await page.screenshot({path:'/tmp/neurocrop-diagnostics-start.png',fullPage:true,animations:'disabled'})
 await page.locator('.diag-tabs button').nth(2).click()
 await expect(page.locator('.diag-report-row')).toBeVisible()
 await expect(page.locator('.diag-start')).not.toBeVisible()
 await page.locator('.diag-report-row button').first().click()
 await expect(page.locator('.diag-filters select').nth(1)).toHaveValue('14')
 await expect(page.locator('.diag-agro-card')).toHaveCount(7)
 await expect(page.locator('.diag-agronomy')).toContainText('The old report’s measurements are unchanged')
 await expect(page.locator('.diag-period b')).toContainText('Saved snapshot')
 expect(analysisCalls).toBe(0)
 await page.getByRole('button',{name:'Areas',exact:true}).click()
 await page.getByRole('button',{name:'Diagnostics',exact:true}).click()
 await expect(page.locator('.diag-filters select').nth(1)).toHaveValue('14')
 await expect(page.locator('.diag-period b')).toContainText('Saved snapshot')
 expect(analysisCalls).toBe(0)
 await page.locator('.diag-filters select').nth(1).selectOption('7')
 await expect(page.locator('.diag-start')).toBeVisible()
 await page.getByRole('button',{name:'Generate report',exact:true}).click()
 await expect(page.locator('.diag-agronomy')).toContainText('High evaporative demand coincided with a dry root zone')
 await expect(page.locator('.diag-agronomy')).toContainText('inspect emitters')
 await expect(page.locator('.diag-agro-card')).toHaveCount(7)
 await expect(page.locator('.diag-overview')).toContainText('7')
 await expect(page.locator('.diag-agro-heading').first()).toContainText('Check first')
 await expect(page.locator('.diag-agro-card').first().locator('.diag-agro-action')).toBeVisible()
 await expect(page.locator('.diag-agro-card').first().locator('.diag-agro-impact')).toBeVisible()
 await page.screenshot({path:'/tmp/neurocrop-diagnostics-redesign-top.png',animations:'disabled'})

 for(const title of ['Heat load may disrupt growth','CO₂ may limit photosynthesis','Light may be insufficient','Persistently wet substrate','Salt concentration may hinder','Nutrients may be less available'])await expect(page.locator('.diag-agronomy')).toContainText(title)
 await expect(page.locator('.diag-insights')).not.toBeVisible()
 await page.locator('.diag-measurement-review > summary').click()
 await expect(page.locator('.diag-insights')).toContainText(/2[,.]1/)
 await expect(page.locator('.diag-filters select')).toHaveCount(2)
 await expect(page.locator('.diag-finding')).toHaveCount(3)
 await expect(page.locator('.diag-evidence')).toHaveCount(0)
 await expect(page.locator('.diag-explanation')).toHaveCount(0)
 await expect(page.locator('.diag-insights')).toContainText('matching hours')
 await expect(page.locator('.diag-insights')).toContainText('The longest lasted')
 await expect(page.locator('.diag-insights')).toContainText('not independent confirmation')
 await page.locator('.diag-finding > button').first().click()
 await expect(page.locator('.diag-explanation')).toContainText('Largest excursion')
 await expect(page.locator('.diag-explanation')).toContainText('0 of 3')
 await page.locator('.diag-supporting > summary').click()
 await expect(page.locator('.diag-chart svg')).toBeVisible()
 await expect(page.locator('.diag-location-map canvas').first()).toBeVisible()
 await page.locator('.diag-toolbar .primary').click()
 await expect(page.locator('.diag-period b')).toContainText(/snapshot|ataskaita/i)
 await page.locator('.diag-tabs button').nth(2).click()
 await expect(page.locator('.diag-report-row')).toHaveCount(1)
 await page.locator('.diag-report-row button').first().click()
 await expect(page.locator('.diag-agronomy')).toBeVisible()
 await page.getByRole('button',{name:'Areas',exact:true}).click()
 await expect(page.locator('.nc-diagnostics')).toHaveCount(0)
 await page.getByRole('button',{name:'Diagnostics',exact:true}).click()
 await expect(page.locator('.diag-period b')).toContainText(/snapshot|ataskaita/i)
 await expect(page.locator('.diag-toolbar .primary')).toBeDisabled()
 await page.getByRole('button',{name:'LT',exact:true}).click()
 await expect(page.locator('.diag-agronomy > h2')).toContainText('Ką tai reiškia augalams')
 await page.evaluate(()=>{(document.activeElement as HTMLElement)?.blur();window.scrollTo(0,0)})
 await page.screenshot({path:'/tmp/neurocrop-diagnostics-desktop.png',fullPage:true,animations:'disabled'})
 await page.screenshot({path:'/tmp/neurocrop-diagnostics-redesign-lt-top.png',animations:'disabled'})
 await page.locator('.diag-agro-card').first().scrollIntoViewIfNeeded()
 await page.screenshot({path:'/tmp/neurocrop-diagnostics-redesign-preview.png',animations:'disabled'})
 await page.locator('.diag-measurement-review > summary').click()
 await page.locator('.diag-finding > button').first().click()
 await page.screenshot({path:'/tmp/neurocrop-diagnostics-depth.png',fullPage:true,animations:'disabled'})
 await page.locator('.diag-finding > button').first().click()
 await page.locator('.diag-measurement-review > summary').click()
 await page.setViewportSize({width:390,height:844})
 await page.evaluate(()=>window.scrollTo(0,0))
 await page.screenshot({path:'/tmp/neurocrop-diagnostics-mobile.png',fullPage:true,animations:'disabled'})
 await page.screenshot({path:'/tmp/neurocrop-diagnostics-redesign-mobile-top.png',animations:'disabled'})
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true)
 await page.locator('.diag-measurement-review > summary').click()
 await page.locator('.diag-finding > button').first().click()
 await page.locator('.diag-supporting > summary').click()
 await expect.poll(async()=>{const canvas=await page.locator('.diag-location-map canvas').first().boundingBox();const host=await page.locator('.diag-location-map .gh-canvas-shell').boundingBox();return Boolean(canvas&&host&&canvas.width<=host.width+1&&canvas.height<=host.height+1)}).toBe(true)

 await page.emulateMedia({media:'print'})
 await expect(page.locator('.diag-print-summary')).toBeVisible()
 await expect(page.locator('.diag-report-row')).not.toBeVisible()
 expect(errors).toEqual([])
})

test('30-day analysis survives the former 15s deadline and can retry a timeout',async({page})=>{
 test.setTimeout(50_000)
 let failNext=false,analysisCalls=0
 await page.route('**/runtime-config.js*',r=>r.fulfill({contentType:'application/javascript',body:`window.NEUROCROP_CONFIG={apiBaseUrl:'${api}'};`}))
 await page.route(`${api}/**`,async route=>{
  const url=new URL(route.request().url()),path=url.pathname
  let data:unknown={}
  if(path==='/auth/me')data={user:{id:'test-user',email:'test@example.test',role:'owner',organizationId:'test',name:'Test'}}
  if(path==='/areas')data={areas:[report.area]}
  if(path==='/sections')data={sections:[{id:'north',name:'Šiaurės zona',areaId:'area'}]}
  if(path==='/nodes')data={nodes:[]}
  if(path==='/alerts')data={alerts:[]}
  if(path==='/actions/today')data={actions:[]}
  if(path==='/diagnostics/areas/area'){
   analysisCalls++
   if(failNext){failNext=false;await route.fulfill({status:504,json:{message:'Gateway Time-out'}});return}
   if(url.searchParams.get('days')==='30')await new Promise(resolve=>setTimeout(resolve,16_000))
   data=withAgronomicInsights({...report,days:Number(url.searchParams.get('days')),from:url.searchParams.get('days')==='30'?'2026-08-09T00:00:00Z':report.from},'historical-analysis')
  }
  await route.fulfill({json:data})
 })
 await page.goto('/diagnostics')
 await page.locator('[data-product-choice="greenhouse"]').click()
 await expect(page.getByRole('button',{name:'Generate report',exact:true})).toBeEnabled()
 expect(analysisCalls).toBe(0)
 await page.locator('.diag-filters select').nth(1).selectOption('30')
 await expect(page.getByText('Choose a greenhouse and period, then select Generate report.')).toBeVisible()
 expect(analysisCalls).toBe(0)
 await page.getByRole('button',{name:'Generate report',exact:true}).click()
 await expect(page.getByRole('status').filter({hasText:/Analyzing|Analizuojami/})).toBeVisible()
 await expect(page.locator('.diag-finding')).toHaveCount(3,{timeout:22_000})
 await expect(page.locator('.diag-error')).toHaveCount(0)
 const callsBeforeReturn=analysisCalls
 await page.getByRole('button',{name:'Areas',exact:true}).click()
 await expect(page.locator('.nc-diagnostics')).toHaveCount(0)
 await page.getByRole('button',{name:'Diagnostics',exact:true}).click()
 await expect(page.locator('.diag-finding')).toHaveCount(3)
 await expect(page.locator('.diag-filters select').nth(1)).toHaveValue('30')
 expect(analysisCalls).toBe(callsBeforeReturn)
 failNext=true
 await page.locator('.diag-filters button').click()
 await expect(page.getByRole('alert')).toContainText(/Try again or choose a shorter period|Bandykite dar kartą/)
 await expect(page.getByRole('alert')).not.toContainText('Gateway Time-out')
 await page.locator('.diag-filters select').nth(1).selectOption('7')
 await expect(page.getByText('Choose a greenhouse and period, then select Generate report.')).toBeVisible()
 expect(analysisCalls).toBe(callsBeforeReturn+1)
 await page.getByRole('button',{name:'Generate report',exact:true}).click()
 await expect(page.locator('.diag-finding')).toHaveCount(3)
 await expect(page.locator('.diag-error')).toHaveCount(0)
})
