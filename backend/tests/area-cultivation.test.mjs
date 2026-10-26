import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { registerAreaCultivationRoutes,resolveNodeAssignment } from '../area-cultivation.js';

function harness({scope=true,profile=true,fail=false}={}){
  const calls=[],routes=new Map();let released=false;
  const execute=async(sql,params)=>{
    calls.push({sql,params});
    if(sql.includes('FROM sections s JOIN areas'))return {rows:scope && params[0]==='org-a' ? [{id:'stable-scope',area_id:'room',crop_profile:'old',is_area_default:true}] : []};
    if(sql.includes('FROM crop_profiles'))return {rows:profile ? [{id:params[1]}] : []};
    if(fail && sql.startsWith('UPDATE'))throw new Error('write failed');
    return {rows:[]};
  };
  const database={query:execute,pool:{connect:async()=>({query:execute,release(){released=true;}})}};
  registerAreaCultivationRoutes({get:(path,...handlers)=>routes.set('GET',handlers),patch:(path,...handlers)=>routes.set('PATCH',handlers)},{database});
  return {calls,database,get released(){return released;},async invoke(method,body,role='owner',organizationId='org-a'){
    const req={params:{areaId:'room'},body,user:{id:'user-a',role,organizationId}},res={statusCode:200,status(code){this.statusCode=code;return this;},json(value){this.body=value;return this;}};
    const handlers=routes.get(method),run=async index=>{if(index===handlers.length)return;let next;await handlers[index](req,res,error=>{if(error)throw error;next=run(index+1);});await next;};await run(0);return res;
  }};
}

test('Area is a complete assignment; optional group must belong to that Area and tenant',async()=>{
  const calls=[],database={query:async(sql,params)=>{calls.push({sql,params});return {rows:[]};}};
  await resolveNodeAssignment(database,'org-a',{areaId:'room'});
  assert.match(calls[0].sql,/s.organization_id=\$1/);assert.match(calls[0].sql,/s.is_area_default/);assert.deepEqual(calls[0].params,['org-a','room']);
  await resolveNodeAssignment(database,'org-a',{areaId:'room',sectionId:'other-group'});
  assert.match(calls[1].sql,/s.id=\$2/);assert.match(calls[1].sql,/s.area_id=\$3/);assert.deepEqual(calls[1].params,['org-a','other-group','room']);
  await resolveNodeAssignment(database,'org-a',{sectionId:'legacy-group'});assert.deepEqual(calls[2].params,['org-a','legacy-group']);
  assert.equal(await resolveNodeAssignment(database,'org-a',{areaId:{id:'room'}}),null);assert.equal(calls.length,3);
});
test('Area profile load is tenant scoped and exposes the existing stable evaluation identity',async()=>{
  const h=harness(),result=await h.invoke('GET');assert.equal(result.statusCode,200);assert.deepEqual(result.body,{areaId:'room',defaultSectionId:'stable-scope',cropProfile:'old'});
  assert.equal((await h.invoke('GET',undefined,'owner','other-org')).statusCode,404);
});
test('saving a profile updates only the Area and inheriting groups in one transaction',async()=>{
  const h=harness(),result=await h.invoke('PATCH',{cropProfile:'tomato'});
  assert.equal(result.statusCode,200);assert.equal(result.body.cropProfile,'tomato');
  const write=h.calls.find(c=>c.sql.startsWith('UPDATE'));
  assert.match(write.sql,/is_area_default OR inherit_area_profile/);assert.deepEqual(write.params,['org-a','room','tomato']);
  assert.equal(h.calls.at(-1).sql,'COMMIT');assert.ok(h.released);
  assert.ok(h.calls.every(c=>!/^DELETE|UPDATE nodes|UPDATE measurements/.test(c.sql)));
});
test('unknown profiles and other tenants roll back; clearing a profile stays explicit',async()=>{
  const unknown=harness({profile:false});assert.equal((await unknown.invoke('PATCH',{cropProfile:'foreign'})).statusCode,400);assert.equal(unknown.calls.at(-1).sql,'ROLLBACK');assert.ok(!unknown.calls.some(c=>c.sql.startsWith('UPDATE')));
  const other=harness();assert.equal((await other.invoke('PATCH',{cropProfile:'x'},'owner','other-org')).statusCode,404);assert.equal(other.calls.at(-1).sql,'ROLLBACK');
  const clear=harness();assert.equal((await clear.invoke('PATCH',{cropProfile:null})).body.cropProfile,null);
  assert.deepEqual(clear.calls.find(c=>c.sql.startsWith('UPDATE')).params,['org-a','room',null]);
  const denied=harness();assert.equal((await denied.invoke('PATCH',{cropProfile:'x'},'viewer')).statusCode,403);assert.equal(denied.calls.length,0);
  assert.equal((await denied.invoke('PATCH',{})).statusCode,400);
});
test('failed writes roll back and release the connection',async()=>{
  const h=harness({fail:true});await assert.rejects(h.invoke('PATCH',{cropProfile:'valid'}),/write failed/);assert.equal(h.calls.at(-1).sql,'ROLLBACK');assert.ok(h.released);
});
test('migration preserves single-group identities and readings, and provisions future Areas',async()=>{
  const sql=await readFile(new URL('../migrations/0045_area_cultivation.sql',import.meta.url),'utf8');
  assert.match(sql,/ALTER COLUMN crop_profile DROP NOT NULL/);assert.match(sql,/ALTER COLUMN crop_profile DROP DEFAULT/);
  assert.match(sql,/HAVING count\(\*\)=1/);assert.match(sql,/SET is_area_default=true/);assert.match(sql,/CREATE UNIQUE INDEX/);assert.match(sql,/AFTER INSERT OR UPDATE OF name ON areas/);
  assert.doesNotMatch(sql,/DELETE FROM|DROP TABLE|UPDATE measurements|UPDATE measurement_rollups/i);
});
