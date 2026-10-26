import assert from 'node:assert/strict';
import test from 'node:test';
import { areaGeometry,applyAreaGeometry,loadAreaGeometry,objectInsideOutline,outlineError,syncFarmAreaMaps } from '../area-map-outline.js';
import { validateGreenhouseMap } from '../greenhouse-map-routes.js';
const polygon=[{xM:10,yM:20},{xM:18,yM:20},{xM:18,yM:22},{xM:13,yM:22},{xM:13,yM:26},{xM:10,yM:26}];
const plan={version:2,areas:[{id:'room',name:'L room',kind:'room',height:3,polygon}]};
const shape=areaGeometry(plan,4,'room');
const base=()=>applyAreaGeometry({schemaVersion:1,id:'map-room',name:'Old',shape:{type:'rectangle'},dimensions:{widthM:20,lengthM:8},gridSizeM:.25,orientationDeg:0,wallThicknessM:.01,layers:[{id:'equipment',name:'Equipment',visible:true,locked:false,opacity:1}],objects:[{id:'rack',name:'Rack',type:'rack',xM:1,yM:3,widthM:1,lengthM:.3,rotationDeg:0,layerId:'equipment',visible:true,locked:false,metadata:{}}],heatmapSettings:{enabled:true,metric:'air-temperature',interpolationMethod:'idw',idwPower:2,opacity:.8,scaleMode:'auto',showConfidence:true}},shape);
test('API validates the real L-shaped contour and excludes its cut-out',()=>{
  const map=base();assert.equal(validateGreenhouseMap(map).valid,true);
  const outside=structuredClone(map);outside.objects[0].xM=6;
  assert.equal(validateGreenhouseMap(outside).valid,false);assert.equal(outside.objects[0].xM,6);
  const crossed=structuredClone(map);crossed.shape.points=[{xM:0,yM:0},{xM:8,yM:6},{xM:0,yM:6},{xM:8,yM:0}];assert.match(outlineError(crossed),/cross/);
});
test('API accepts an inner-wall opening and rejects a detached mount',()=>{
  const map=base();map.objects=[{...map.objects[0],type:'door',xM:6,yM:2,widthM:1,lengthM:.15,rotationDeg:180,metadata:{door:{type:'single',heightM:2},wallMount:{edgeIndex:2,offsetM:2}}}];
  assert.equal(validateGreenhouseMap(map).valid,true);map.objects[0].yM=3;assert.equal(validateGreenhouseMap(map).valid,false);
});
test('geometry is loaded through organization-owned Area links under a shared lock',async()=>{
  const calls=[],database={query:async(sql,params)=>{calls.push({sql,params});return {rows:[{plan_data:plan,revision:4,zone_id:'room'}]};}};
  assert.deepEqual(await loadAreaGeometry(database,'org','room',true),shape);assert.deepEqual(calls[0].params,['org','room']);assert.match(calls[0].sql,/p.organization_id=\$1 AND l.area_id=\$2/);assert.match(calls[0].sql,/FOR SHARE OF p/);assert.equal(areaGeometry(plan,4,'foreign'),null);
});
test('farm changes synchronize map geometry and history without relocating equipment',async()=>{
  const original=base(),next=structuredClone(plan);next.areas[0].polygon[1].xM=19;next.areas[0].polygon[2].xM=19;
  const calls=[],database={query:async(sql,params)=>{calls.push({sql,params});return {rows:sql.startsWith('SELECT') ? [{area_id:'room',map_data:original}] : sql.startsWith('UPDATE greenhouse_maps') ? [{revision:8,updated_at:'2026-10-26T12:00:00Z'}] : []};}};
  await syncFarmAreaMaps(database,'org',next,5,'user');
  const updated=JSON.parse(calls.find(c=>c.sql.startsWith('UPDATE greenhouse_maps')).params[2]);assert.equal(updated.dimensions.widthM,9);assert.deepEqual(updated.objects,original.objects);assert.equal(updated.farmPlanGeometry.revision,5);
  assert.ok(calls.some(c=>c.sql.startsWith('UPDATE greenhouse_map_layout_history')));assert.ok(calls.some(c=>c.sql.startsWith('INSERT INTO greenhouse_map_layout_history')));
});
test('JSONB property ordering and unrelated farm edits do not create map history noise',async()=>{
  const reverse=x=>Array.isArray(x) ? x.map(reverse) : x && typeof x==='object' ? Object.fromEntries(Object.entries(x).reverse().map(([k,v])=>[k,reverse(v)])) : x;
  const calls=[],database={query:async(sql)=>{calls.push(sql);return {rows:[{area_id:'room',map_data:reverse(base())}]};}};
  await syncFarmAreaMaps(database,'org',plan,5,'user');assert.equal(calls.length,1);
});
test('rotated equipment cannot bridge a concave notch',()=>{const map=base();assert.equal(objectInsideOutline({...map.objects[0],xM:1,yM:4,widthM:5.8,lengthM:.2,rotationDeg:-35},map),false);});
