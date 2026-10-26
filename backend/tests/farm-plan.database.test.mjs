import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { pool,closePool } from '../db.js';
import { registerFarmPlanRoutes } from '../farm-plan-routes.js';

// Explicit opt-in only. Every fixture and route write runs inside one rolled-back
// transaction; route transactions become savepoints on the same connection.
test('direct Area authoring with PostgreSQL: identity, isolation, deletion and revision conflicts',{
  skip:process.env.NEUROCROP_FARM_PLAN_DB_TEST!=='1',
},async()=>{
  const client=await pool.connect(),token=randomUUID();
  const org=`farm-check-${token}`,other=`farm-other-${token}`,user=`farm-user-${token}`;
  const first=`first-${token}`,second=`second-${token}`,foreign=`foreign-${token}`,unplaced=`unplaced-${token}`;
  try{
    await client.query('BEGIN');
    await client.query('INSERT INTO organizations (id,name) VALUES ($1,$2),($3,$4)',[org,'Temporary deployment check',other,'Temporary isolation check']);
    await client.query('INSERT INTO users (id,email,display_name,password_hash,is_active) VALUES ($1,$2,$3,$4,false)',[user,`${token}@example.invalid`,'Deployment check','not-a-login']);
    await client.query('INSERT INTO areas (id,organization_id,name) VALUES ($1,$2,$3),($4,$5,$6)',[foreign,other,'Foreign Area',unplaced,org,'Unrelated Area']);
    const connection={release(){},async query(sql,params){
      if(sql==='BEGIN')return client.query('SAVEPOINT farm_route');
      if(sql==='COMMIT')return client.query('RELEASE SAVEPOINT farm_route');
      if(sql==='ROLLBACK'){await client.query('ROLLBACK TO SAVEPOINT farm_route');return client.query('RELEASE SAVEPOINT farm_route');}
      return client.query(sql,params);
    }};
    const routes=new Map();
    registerFarmPlanRoutes({get:(path,...h)=>routes.set(`GET ${path}`,h),patch:(path,...h)=>routes.set(`PATCH ${path}`,h)},{database:{query:(s,p)=>client.query(s,p),pool:{connect:async()=>connection}}});
    async function invoke(method,body,organizationId=org,role='owner'){
      const req={body,user:{id:user,organizationId,role}};
      const res={statusCode:200,status(code){this.statusCode=code;return this;},set(){return this;},json(body){this.body=body;return this;}};
      const h=routes.get(`${method} /farm-plan`);
      const run=async i=>{if(i>=h.length)return;let next;await h[i](req,res,error=>{if(error)throw error;next=run(i+1);});await next;};
      await run(0);return res;
    }
    const rectangle=x=>[{xM:x,yM:1},{xM:x+8,yM:1},{xM:x+8,yM:6},{xM:x,yM:6}];
    const plan={version:2,name:'Check farm',dimensions:{widthM:40,lengthM:30},areas:[
      {id:first,name:'Room',kind:'room',height:3,polygon:rectangle(1)},
      {id:second,name:'Greenhouse',kind:'greenhouse',height:4,polygon:rectangle(12)},
    ]};
    let result=await invoke('PATCH',{plan,expectedRevision:0});
    assert.equal(result.statusCode,200);assert.equal(result.body.revision,1);
    assert.ok(result.body.areas.some(a=>a.id===first));assert.ok(result.body.areas.some(a=>a.id===second));
    result=await invoke('GET');assert.equal(result.body.plan.version,2);assert.equal(result.body.plan.areas.length,2);
    plan.areas[0].name='Renamed room';result=await invoke('PATCH',{plan,expectedRevision:1});assert.equal(result.body.revision,2);
    assert.equal((await client.query('SELECT count(*)::int AS n FROM areas WHERE organization_id=$1 AND id=ANY($2::text[])',[org,[first,second]])).rows[0].n,2);
    assert.equal((await client.query('SELECT name FROM areas WHERE id=$1',[first])).rows[0].name,'Renamed room');
    const stale=structuredClone(plan);stale.areas.push({id:`new-${token}`,name:'Must not be inserted',kind:'room',height:3,polygon:rectangle(24)});
    result=await invoke('PATCH',{plan:stale,expectedRevision:1});assert.equal(result.statusCode,409);
    assert.equal((await client.query('SELECT count(*)::int AS n FROM areas WHERE id=$1',[`new-${token}`])).rows[0].n,0);
    const collision=structuredClone(plan);collision.areas[1].id=foreign;
    result=await invoke('PATCH',{plan:collision,expectedRevision:2});assert.equal(result.statusCode,400);
    result=await invoke('GET',undefined,other);assert.equal(result.body.revision,0);assert.deepEqual(result.body.areas.map(a=>a.id),[foreign]);
    result=await invoke('PATCH',{plan,expectedRevision:2},org,'viewer');assert.equal(result.statusCode,403);
    result=await invoke('PATCH',{plan,expectedRevision:2},org,'technician');assert.equal(result.statusCode,403);
    const smaller=structuredClone(plan);smaller.areas.pop();
    result=await invoke('PATCH',{plan:smaller,expectedRevision:2});assert.equal(result.statusCode,200);assert.equal(result.body.revision,3);
    assert.equal((await client.query('SELECT count(*)::int AS n FROM areas WHERE id=$1',[second])).rows[0].n,0);
    assert.equal((await client.query('SELECT count(*)::int AS n FROM areas WHERE id=$1',[unplaced])).rows[0].n,1);
    await client.query(`INSERT INTO crop_profiles (id,organization_id,name,hero_name,requires_review,metrics) VALUES ('smoke-profile',$1,'Test profile','Test',true,'{}'::jsonb)`,[org]);
    await client.query(`INSERT INTO sections (id,organization_id,area_id,name,crop_profile) VALUES ($1,$2,$3,'Test Section','smoke-profile')`,[`section-${token}`,org,first]);
    result=await invoke('GET');assert.equal(result.body.areas.find(a=>a.id===first).sectionCount,1);
    result=await invoke('PATCH',{plan:{...smaller,areas:[]},expectedRevision:3});assert.equal(result.statusCode,409);assert.equal(result.body.error.code,'AREA_HAS_CHILDREN');
    assert.equal((await client.query('SELECT count(*)::int AS n FROM sections WHERE organization_id=$1',[org])).rows[0].n,1);
    await client.query('DELETE FROM sections WHERE organization_id=$1',[org]);
    await client.query('DELETE FROM areas WHERE id=$1',[first]);
    result=await invoke('GET');assert.equal(result.body.plan.areas.length,0);
    result=await invoke('PATCH',{plan:smaller,expectedRevision:3});assert.equal(result.statusCode,409);assert.equal(result.body.error.code,'AREA_REMOVED');
    console.log('Verified real DB Area creation/update, no duplication, organization isolation, conflict rollback and safe deletion. All test data rolled back.');
  }finally{
    await client.query('ROLLBACK');client.release();await closePool();
  }
});
