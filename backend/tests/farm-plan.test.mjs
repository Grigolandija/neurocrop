import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { loadMigrations } from '../migration-files.js';
import { validateFarmPlan } from '../farm-plan-validation.js';
import { registerFarmPlanRoutes } from '../farm-plan-routes.js';

const rect=(x,y,w,h)=>[{xM:x,yM:y},{xM:x+w,yM:y},{xM:x+w,yM:y+h},{xM:x,yM:y+h}];
function plan(){
  const polygon=rect(1,1,18,12);
  return {version:1,dimensions:{widthM:30,lengthM:20},buildings:[{id:'building',name:'Greenhouse',greenhouse:true,height:4,polygon}],rooms:[],zones:[{id:'zone',name:'Growing area',height:4,buildingId:'building',areaId:'area-a',polygon:rect(2,2,5,5)}]};
}

test('farm plans retain geometry and Area links, stripping client measurements and metadata',()=>{
  const input=plan();input.organizationId='foreign';input.sensors=[{temperature:30}];
  input.zones[0].sensors=[{id:'DEMO',co2:1200}];input.zones[0].polygon[0].reading=30;
  const result=validateFarmPlan(input);
  assert.equal(result.valid,true);assert.deepEqual(result.areaIds,['area-a']);
  assert.equal(result.plan.zones[0].areaId,'area-a');
  assert.equal(JSON.stringify(result.plan).includes('DEMO'),false);
  assert.equal('organizationId' in result.plan,false);
  assert.equal('sensors' in result.plan.zones[0],false);
  assert.equal('reading' in result.plan.zones[0].polygon[0],false);
  assert.equal(input.zones[0].sensors.length,1);
});

test('an L room and independently drawn wall-free zones are accepted',()=>{
  const input=plan();
  const polygon=[{xM:2,yM:2},{xM:10,yM:2},{xM:10,yM:5},{xM:5,yM:5},{xM:5,yM:10},{xM:2,yM:10}];
  input.rooms=[{id:'room',buildingId:'building',name:'L room',height:3,polygon}];
  input.zones[0]={...input.zones[0],roomId:'room',polygon,height:3};
  assert.equal(validateFarmPlan(input).valid,true);
  const acrossNotch=structuredClone(input);acrossNotch.zones[0].polygon=[{xM:3,yM:9},{xM:9,yM:3},{xM:3,yM:3}];
  assert.match(validateFarmPlan(acrossNotch).message,/inside its room/);
});

test('adjoining physical rooms can share walls, but overlapping or identical rooms fail',()=>{
  const input=plan();
  input.rooms=[{id:'left',name:'Left',buildingId:'building',height:3,polygon:rect(1,1,8,12)},{id:'right',name:'Right',buildingId:'building',height:3,polygon:rect(9,1,10,12)}];
  assert.equal(validateFarmPlan(input).valid,true);
  input.rooms[1].polygon=rect(8,1,10,12);assert.equal(validateFarmPlan(input).valid,false);
  input.rooms[1].polygon=input.rooms[0].polygon;assert.equal(validateFarmPlan(input).valid,false);
});

test('invalid shape, out-of-bounds points, duplicate bindings and parent references fail',()=>{
  const cases=[
    p=>{p.dimensions.widthM=Infinity;},
    p=>{p.buildings[0].polygon[1].xM=31;},
    p=>{p.buildings[0].polygon=[{xM:1,yM:1},{xM:10,yM:10},{xM:1,yM:10},{xM:10,yM:1}];},
    p=>{p.zones.push({...p.zones[0],id:'second'});},
    p=>{p.zones[0].buildingId='missing';},
    p=>{p.zones[0].roomId='missing';},
    p=>{p.zones[0].height=0;},
    p=>{p.zones[0].name=' ';},
    p=>{p.buildings.push({...p.buildings[0]});},
  ];
  for(const change of cases){const input=plan();change(input);assert.equal(validateFarmPlan(input).valid,false);}
  const unlinked=plan();delete unlinked.zones[0].areaId;assert.equal(validateFarmPlan(unlinked).valid,true);
});

// Exercise the actual route handlers and auth middleware without an external server or database.
function harness({owned=['area-a'],conflict=false,failLinks=false,links={zone:'area-a'}}={}){
  const calls=[],routes=new Map();let released=false;
  const row={plan_data:validateFarmPlan(plan()).plan,revision:2,updated_at:'2026-10-26T12:00:00Z'};
  const database={query:async(sql,params)=>{
    calls.push({sql,params});
    assert.equal(params[0],'org-a');
    return {rows:sql.includes('FROM farm_plans') ? [{...row,area_links:links}] : [{id:'area-a',name:'Existing Area',map_enabled:true,map_configured:true}]};
  },pool:{connect:async()=>({query:async(sql,params)=>{
    calls.push({sql,params});
    if(sql.startsWith('SELECT id FROM areas'))return {rows:owned.map(id=>({id}))};
    if(sql.startsWith('INSERT INTO farm_plans') || sql.startsWith('UPDATE farm_plans'))return {rows:conflict ? [] : [row]};
    if(failLinks && sql.startsWith('INSERT INTO farm_plan_area_links'))throw new Error('link failed');
    return {rows:[]};
  },release:()=>{released=true;}})}};
  registerFarmPlanRoutes({get:(path,...handlers)=>routes.set(`GET ${path}`,handlers),patch:(path,...handlers)=>routes.set(`PATCH ${path}`,handlers)},{database});
  const invoke=async(method,{role='owner',body,anonymous=false}={})=>{
    const req={body,user:anonymous ? undefined : {id:'user-a',organizationId:'org-a',role}};
    const res={statusCode:200,headers:{},status(code){this.statusCode=code;return this;},set(k,v){this.headers[k]=v;return this;},json(value){this.body=value;return this;}};
    const handlers=routes.get(`${method} /farm-plan`);
    const run=async(index)=>{if(index>=handlers.length)return;let continuation;await handlers[index](req,res,error=>{if(error)throw error;continuation=run(index+1);});await continuation;};
    await run(0);return res;
  };
  return {calls,invoke,get released(){return released;}};
}

test('loading a farm plan scopes both geometry and Areas to the authenticated organization',async()=>{
  const h=harness(),response=await h.invoke('GET',{role:'viewer'});
  assert.equal(response.body.draftScope,'org-a:user-a');
  assert.equal(response.body.permissions.canEdit,false);
  assert.equal(response.body.plan.zones[0].areaId,'area-a');
  assert.equal(response.headers['Cache-Control'],'private, no-store');
  assert.equal(h.calls.length,2);
  assert.ok(h.calls.every(call=>call.sql.includes('organization_id=$1')));
});

test('anonymous requests and read-only members cannot save a farm plan',async()=>{
  for(const options of [{anonymous:true},{role:'viewer'}]){
    const h=harness(),response=await h.invoke('PATCH',{...options,body:{plan:plan(),expectedRevision:1}});
    assert.equal(response.statusCode,options.anonymous ? 401 : 403);assert.equal(h.calls.length,0);
  }
});

test('foreign/deleted Area references are rejected before any plan is changed',async()=>{
  const h=harness({owned:[]}),response=await h.invoke('PATCH',{body:{plan:plan(),expectedRevision:1}});
  assert.equal(response.statusCode,400);assert.equal(response.body.error.code,'AREA_NOT_AVAILABLE');
  assert.deepEqual(h.calls.at(-1),{sql:'ROLLBACK',params:undefined});
  assert.equal(h.calls.some(c=>c.sql.startsWith('UPDATE')),false);assert.equal(h.released,true);
});

test('save atomically writes geometry, tenant-scoped links and a bounded revision history',async()=>{
  const h=harness(),response=await h.invoke('PATCH',{body:{plan:plan(),expectedRevision:1}});
  assert.equal(response.statusCode,200);assert.equal(response.body.revision,2);
  const update=h.calls.find(c=>c.sql.startsWith('UPDATE farm_plans'));
  assert.match(update.sql,/organization_id=\$1 AND revision=\$4/);
  assert.deepEqual([update.params[0],update.params[2],update.params[3]],['org-a','user-a',1]);
  assert.deepEqual(h.calls.find(c=>c.sql.startsWith('INSERT INTO farm_plan_area_links')).params,['org-a','zone','area-a']);
  assert.deepEqual(h.calls.find(c=>c.sql.startsWith('DELETE FROM farm_plan_history')).params,['org-a',-48]);
  assert.equal(h.calls.at(-1).sql,'COMMIT');assert.equal(h.released,true);
});

test('creating the first revision uses insert-if-absent and cannot overwrite an existing plan',async()=>{
  const h=harness({conflict:true}),response=await h.invoke('PATCH',{body:{plan:plan(),expectedRevision:0}});
  assert.equal(response.statusCode,409);
  assert.match(h.calls.find(c=>c.sql.startsWith('INSERT INTO farm_plans')).sql,/ON CONFLICT \(organization_id\) DO NOTHING/);
  assert.equal(h.calls.at(-1).sql,'ROLLBACK');
  assert.equal(h.calls.some(c=>c.sql.startsWith('DELETE FROM farm_plan_area_links')),false);
});

test('a stale revision does not remove links or write history',async()=>{
  const h=harness({conflict:true}),response=await h.invoke('PATCH',{body:{plan:plan(),expectedRevision:1}});
  assert.equal(response.statusCode,409);assert.equal(response.body.error.code,'FARM_PLAN_REVISION_CONFLICT');
  assert.equal(h.calls.some(c=>c.sql.startsWith('DELETE') || c.sql.startsWith('INSERT INTO farm_plan_history')),false);
  assert.equal(h.calls.at(-1).sql,'ROLLBACK');assert.equal(h.released,true);
});

test('link failures roll back the plan and always release the connection',async()=>{
  const h=harness({failLinks:true});
  await assert.rejects(h.invoke('PATCH',{body:{plan:plan(),expectedRevision:1}}),/link failed/);
  assert.equal(h.calls.at(-1).sql,'ROLLBACK');assert.equal(h.released,true);
});

test('invalid revision and invalid geometry do not open a database transaction',async()=>{
  for(const body of [{plan:plan(),expectedRevision:'1'},{plan:{...plan(),version:2},expectedRevision:1}]){
    const h=harness(),response=await h.invoke('PATCH',{body});
    assert.equal(response.statusCode,400);assert.equal(h.calls.length,0);
  }
});


test('deleted Area links are not revived from an older JSON snapshot',async()=>{
  const h=harness({links:{}}),response=await h.invoke('GET');
  assert.equal(response.body.plan.zones[0].areaId,undefined);
});

test('farm plan migration is discovered and enforces tenant-scoped Area relationships',async()=>{
  const migrations=await loadMigrations();
  assert.ok(migrations.some(m=>m.version==='0044'));
  const sql=await readFile(new URL('../migrations/0044_farm_plans.sql',import.meta.url),'utf8');
  assert.match(sql,/FOREIGN KEY \(organization_id, area_id\) REFERENCES areas\(organization_id, id\)/);
  assert.match(sql,/UNIQUE \(organization_id, area_id\)/);
  assert.match(sql,/PRIMARY KEY \(organization_id, revision\)/);
});
