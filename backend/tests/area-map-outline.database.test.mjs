import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { pool,closePool } from '../db.js';
import { registerFarmPlanRoutes } from '../farm-plan-routes.js';
import { registerGreenhouseMapRoutes } from '../greenhouse-map-routes.js';
import { applyAreaGeometry } from '../area-map-outline.js';

// Every fixture and route mutation is rolled back. The API routes share this one connection.
test('PostgreSQL shared Area contour, history, stale editor and tenant protection',{skip:process.env.NEUROCROP_AREA_OUTLINE_DB_TEST!=='1'},async()=>{
  const client=await pool.connect(),token=randomUUID(),org=`outline-check-${token}`,other=`outline-other-${token}`,user=`outline-user-${token}`,id=`area-${token}`;
  const originalQuery=pool.query,originalConnect=pool.connect;
  try{
    await client.query('BEGIN');
    await client.query('INSERT INTO organizations (id,name) VALUES ($1,$2),($3,$4)',[org,'Temporary outline verification',other,'Temporary isolation verification']);
    await client.query('INSERT INTO users (id,email,display_name,password_hash,is_active) VALUES ($1,$2,$3,$4,false)',[user,`${token}@example.invalid`,'Deployment check','not-a-login']);
    const connection={release(){},async query(sql,params){if(sql==='BEGIN')return client.query('SAVEPOINT outline_route');if(sql==='COMMIT')return client.query('RELEASE SAVEPOINT outline_route');if(sql==='ROLLBACK'){await client.query('ROLLBACK TO SAVEPOINT outline_route');return client.query('RELEASE SAVEPOINT outline_route');}return client.query(sql,params);}};
    pool.query=(sql,params)=>client.query(sql,params);pool.connect=async()=>connection;
    const routes=new Map(),app={get:(path,...handlers)=>routes.set(`GET ${path}`,handlers),patch:(path,...handlers)=>routes.set(`PATCH ${path}`,handlers)};
    registerFarmPlanRoutes(app);registerGreenhouseMapRoutes(app);
    async function invoke(method,path,body,organizationId=org,role='owner'){
      const req={body,params:{areaId:id},user:{id:user,organizationId,role}};
      const res={statusCode:200,status(n){this.statusCode=n;return this;},set(){return this;},json(body){this.body=body;return this;}};
      const handlers=routes.get(`${method} ${path}`),run=async i=>{if(i>=handlers.length)return;let next;await handlers[i](req,res,error=>{if(error)throw error;next=run(i+1);});await next;};await run(0);return res;
    }
    const polygon=[{xM:10,yM:20},{xM:18,yM:20},{xM:18,yM:22},{xM:13,yM:22},{xM:13,yM:26},{xM:10,yM:26}];
    const plan={version:2,name:'Farm',dimensions:{widthM:40,lengthM:40},areas:[{id,name:'L room',kind:'room',height:3,polygon}]};
    let result=await invoke('PATCH','/farm-plan',{plan,expectedRevision:0});assert.equal(result.statusCode,200);
    await client.query('UPDATE areas SET map_enabled=true WHERE organization_id=$1 AND id=$2',[org,id]);
    result=await invoke('GET','/areas/:areaId/map');assert.equal(result.statusCode,200);assert.equal(result.body.map,null);assert.equal(result.body.geometry.widthM,8);assert.equal(result.body.geometry.polygon.length,6);
    const map=applyAreaGeometry({schemaVersion:1,id:'map-check',name:'Map',shape:{type:'rectangle'},dimensions:{widthM:8,lengthM:6},gridSizeM:.25,orientationDeg:0,wallThicknessM:.01,layers:[{id:'equipment',name:'Equipment',visible:true,locked:false,opacity:1}],objects:[{id:'rack',name:'Rack',type:'rack',xM:1,yM:3,widthM:1,lengthM:.3,rotationDeg:0,layerId:'equipment',visible:true,locked:false,metadata:{}}],heatmapSettings:{enabled:true,metric:'air-temperature',interpolationMethod:'idw',idwPower:2,opacity:.8,scaleMode:'auto',showConfidence:true}},result.body.geometry);
    result=await invoke('PATCH','/areas/:areaId/map',{map,expectedRevision:0});assert.equal(result.statusCode,200);assert.equal(result.body.revision,1);
    const forged=structuredClone(map);forged.shape={type:'rectangle'};forged.objects[0].xM=6;forged.objects[0].yM=4;
    result=await invoke('PATCH','/areas/:areaId/map',{map:forged,expectedRevision:1});assert.equal(result.statusCode,400);assert.equal(result.body.error.code,'OUTSIDE_AREA_OUTLINE');
    const changed=structuredClone(plan);changed.areas[0].polygon[1].xM=19;changed.areas[0].polygon[2].xM=19;
    result=await invoke('PATCH','/farm-plan',{plan:changed,expectedRevision:1});assert.equal(result.statusCode,200);
    result=await invoke('GET','/areas/:areaId/map');assert.equal(result.body.map.dimensions.widthM,9);assert.equal(result.body.map.shape.type,'polygon');assert.equal(result.body.revision,2);assert.deepEqual(result.body.map.objects,map.objects);
    const history=(await client.query('SELECT revision,valid_to,map_data FROM greenhouse_map_layout_history WHERE organization_id=$1 AND area_id=$2 ORDER BY revision',[org,id])).rows;
    assert.equal(history.length,2);assert.ok(history[0].valid_to);assert.equal(history[0].map_data.dimensions.widthM,8);assert.equal(history[1].map_data.dimensions.widthM,9);
    result=await invoke('PATCH','/areas/:areaId/map',{map,expectedRevision:1});assert.equal(result.statusCode,409);assert.equal(result.body.error.code,'FARM_GEOMETRY_CONFLICT');
    result=await invoke('GET','/areas/:areaId/map',undefined,other);assert.equal(result.statusCode,404);
    result=await invoke('PATCH','/areas/:areaId/map',{map,expectedRevision:2},org,'viewer');assert.equal(result.statusCode,403);
    console.log('Verified shared Area geometry, unchanged equipment positions, layout history and stale-editor/tenant protection. All test data rolled back.');
  }finally{pool.query=originalQuery;pool.connect=originalConnect;await client.query('ROLLBACK');client.release();await closePool();}
});
