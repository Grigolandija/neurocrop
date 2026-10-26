import { syncFarmAreaMaps,areaGeometry,applyAreaGeometry } from './area-map-outline.js';
import { pool, query } from './db.js';
import { requireRole, requireUserAuth } from './auth-users.js';
import { validateFarmPlan } from './farm-plan-validation.js';

const writableRoles=['owner','admin','grower','technician'];
const areaKinds={greenhouse:'Greenhouse',room:'Growing room',zone:'Growing area'};
const areaRows=(database,organizationId)=>database.query(`SELECT a.id, a.name, a.kind, a.map_enabled,
  (gm.area_id IS NOT NULL) AS map_configured, gm.map_data->'dimensions' AS map_dimensions,
  (SELECT count(*)::int FROM sections s WHERE s.organization_id=$1 AND s.area_id=a.id AND NOT s.is_area_default) AS section_count,
  (SELECT count(*)::int FROM nodes n WHERE n.organization_id=$1 AND n.area_id=a.id) AS node_count
  FROM areas a LEFT JOIN greenhouse_maps gm ON gm.organization_id=a.organization_id AND gm.area_id=a.id
  WHERE a.organization_id=$1 ORDER BY a.name,a.id`,[organizationId]);
const publicAreas=rows=>rows.map(a=>({id:a.id,name:a.name,kind:a.kind,mapEnabled:!!a.map_enabled,mapConfigured:!!a.map_configured,sectionCount:a.section_count || 0,nodeCount:a.node_count || 0,mapDimensions:a.map_dimensions}));
const farmLayouts=async(database,organizationId,plan,revision)=>{
  const {rows}=await database.query(`SELECT gm.area_id,gm.map_data,gm.revision,gm.updated_at,l.zone_id FROM greenhouse_maps gm JOIN farm_plan_area_links l ON l.organization_id=gm.organization_id AND l.area_id=gm.area_id WHERE gm.organization_id=$1 ORDER BY gm.area_id`,[organizationId]);
  if(!rows.length)return [];
  const nodes=await database.query(`SELECT n.area_id,n.dev_eui,n.installation_height_cm,n.installation_height_recorded_at FROM nodes n JOIN farm_plan_area_links l ON l.organization_id=n.organization_id AND l.area_id=n.area_id WHERE n.organization_id=$1 AND n.archived_at IS NULL`,[organizationId]);
  const heights=new Map(nodes.rows.map(n=>[`${n.area_id}:${n.dev_eui.toLowerCase()}`,n]));
  return rows.map(row=>{
    const map=applyAreaGeometry(row.map_data,areaGeometry(plan,revision,row.area_id,row.zone_id));
    return {areaId:row.area_id,map:{...map,objects:map.objects.map(o=>{
      if(o.type!=='sensor-node' || !o.metadata?.sensor)return o;
      const node=heights.get(`${row.area_id}:${o.metadata.sensor.devEui?.toLowerCase()}`);
      return {...o,metadata:{...o.metadata,sensor:{...o.metadata.sensor,installationHeightM:node?.installation_height_cm == null ? null : node.installation_height_cm/100,installationConfirmedAt:node?.installation_height_recorded_at || null}}};
    })},revision:row.revision,updatedAt:row.updated_at};
  });
};
const emptyPlan=()=>({version:1,dimensions:{widthM:50,lengthM:34},buildings:[],rooms:[],zones:[]});
export function registerFarmPlanRoutes(app,{database={pool,query}}={}){
  app.get('/farm-plan',requireUserAuth,async(req,res,next)=>{
    const organizationId=req.user.organizationId;
    try{
      const [stored,areas]=await Promise.all([
        database.query(`SELECT plan_data, revision, updated_at,
          (SELECT COALESCE(jsonb_object_agg(zone_id,area_id),'{}'::jsonb) FROM farm_plan_area_links WHERE organization_id=$1) AS area_links
          FROM farm_plans WHERE organization_id=$1`,[organizationId]),
        areaRows(database,organizationId),
      ]);
      const row=stored.rows[0],areaLinks=row?.area_links || {};
      const plan=row?.plan_data || emptyPlan();
      const layouts=await farmLayouts(database,organizationId,plan,row?.revision || 0);
      res.set('Cache-Control','private, no-store');
      res.json({draftScope:`${organizationId}:${req.user.id}`,plan:plan.version===2 ? {...plan,areas:plan.areas.filter(area=>Object.hasOwn(areaLinks,area.id))} : {...plan,zones:plan.zones.map(zone=>({...zone,areaId:Object.hasOwn(areaLinks,zone.id) ? areaLinks[zone.id] : undefined}))},revision:row?.revision || 0,updatedAt:row?.updated_at || null,
        layouts,areas:publicAreas(areas.rows),permissions:{canEdit:['owner','admin','grower'].includes(req.user.role)},capabilities:{areaAuthoring:true}});
    }catch(error){next(error);}
  });

  app.patch('/farm-plan',requireUserAuth,requireRole(...writableRoles),async(req,res,next)=>{
    const organizationId=req.user.organizationId,expectedRevision=req.body?.expectedRevision;
    const validation=validateFarmPlan(req.body?.plan);
    if(!validation.valid)return res.status(400).json({error:{code:'VALIDATION_ERROR',message:validation.message}});
    if(!Number.isSafeInteger(expectedRevision) || expectedRevision<0 || expectedRevision>2147483647)return res.status(400).json({error:{code:'VALIDATION_ERROR',message:'expectedRevision must be a non-negative integer'}});
    if(validation.createsAreas && !['owner','admin','grower'].includes(req.user.role))return res.status(403).json({error:{code:'FORBIDDEN',message:'Insufficient permission to create Areas'}});
    let client;
    try{
      client=await database.pool.connect();
      await client.query('BEGIN');
      if(!validation.createsAreas && validation.areaIds.length){
        const owned=await client.query('SELECT id FROM areas WHERE organization_id=$1 AND id=ANY($2::text[]) FOR KEY SHARE',[organizationId,validation.areaIds]);
        if(owned.rows.length!==validation.areaIds.length){await client.query('ROLLBACK');return res.status(400).json({error:{code:'AREA_NOT_AVAILABLE',message:'A linked Area no longer exists in this workspace'}});}
      }
      const previous=validation.createsAreas ? (await client.query('SELECT plan_data FROM farm_plans WHERE organization_id=$1 FOR UPDATE',[organizationId])).rows[0]?.plan_data : null;
      const serialized=JSON.stringify(validation.plan);
      const saved=expectedRevision===0
        ? await client.query(`INSERT INTO farm_plans (organization_id,plan_data,revision,updated_by) VALUES ($1,$2::jsonb,1,$3)
            ON CONFLICT (organization_id) DO NOTHING RETURNING plan_data,revision,updated_at`,[organizationId,serialized,req.user.id])
        : await client.query(`UPDATE farm_plans SET plan_data=$2::jsonb, revision=revision+1, updated_by=$3, updated_at=now()
            WHERE organization_id=$1 AND revision=$4 RETURNING plan_data,revision,updated_at`,[organizationId,serialized,req.user.id,expectedRevision]);
      if(!saved.rows[0]){await client.query('ROLLBACK');return res.status(409).json({error:{code:'FARM_PLAN_REVISION_CONFLICT',message:'The farm plan changed in another session. Reload before saving.'}});}
      const row=saved.rows[0];
      if(validation.createsAreas){
        if(previous?.version===2 && previous.areas.length){
          const previousIds=previous.areas.map(a=>a.id),existing=await client.query('SELECT id FROM areas WHERE organization_id=$1 AND id=ANY($2::text[]) FOR KEY SHARE',[organizationId,previousIds]);
          const present=new Set(existing.rows.map(a=>a.id));
          if(validation.areaIds.some(id=>previousIds.includes(id) && !present.has(id))){await client.query('ROLLBACK');return res.status(409).json({error:{code:'AREA_REMOVED',message:'An Area was deleted in another session. Load the server plan before saving.'}});}
        }
        for(const area of [...validation.plan.areas].sort((a,b)=>a.id.localeCompare(b.id))){
          const owned=await client.query(`INSERT INTO areas (id,organization_id,name,kind,location) VALUES ($1,$2,$3,$4,'')
            ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,kind=EXCLUDED.kind WHERE areas.organization_id=EXCLUDED.organization_id RETURNING id`,[area.id,organizationId,area.name,areaKinds[area.kind]]);
          if(!owned.rows[0]){await client.query('ROLLBACK');return res.status(400).json({error:{code:'AREA_NOT_AVAILABLE',message:'Area id is unavailable in this workspace'}});}
        }
      }
      if(validation.createsAreas && previous?.version===2){
        const removed=previous.areas.filter(area=>!validation.areaIds.includes(area.id)).map(area=>area.id);
        if(removed.length){
          const blocked=await client.query(`SELECT a.id FROM areas a WHERE a.organization_id=$1 AND a.id=ANY($2::text[])
            AND (EXISTS (SELECT 1 FROM sections s WHERE s.organization_id=$1 AND s.area_id=a.id AND NOT s.is_area_default)
              OR EXISTS (SELECT 1 FROM nodes n WHERE n.organization_id=$1 AND n.area_id=a.id)) FOR UPDATE`,[organizationId,removed]);
          if(blocked.rows.length){await client.query('ROLLBACK');return res.status(409).json({error:{code:'AREA_HAS_CHILDREN',message:'Remove Sections and Nodes through Areas before deleting this Area'}});}
          await client.query('DELETE FROM areas WHERE organization_id=$1 AND id=ANY($2::text[])',[organizationId,removed]);
        }
      }
      await client.query('DELETE FROM farm_plan_area_links WHERE organization_id=$1',[organizationId]);
      const links=validation.createsAreas ? validation.plan.areas.map(area=>({id:area.id,areaId:area.id})) : validation.plan.zones;
      for(const zone of links)if(zone.areaId)await client.query('INSERT INTO farm_plan_area_links (organization_id,zone_id,area_id) VALUES ($1,$2,$3)',[organizationId,zone.id,zone.areaId]);
      await client.query('INSERT INTO farm_plan_history (organization_id,revision,plan_data,saved_by) VALUES ($1,$2,$3::jsonb,$4)',[organizationId,row.revision,serialized,req.user.id]);
      await client.query('DELETE FROM farm_plan_history WHERE organization_id=$1 AND revision<=$2',[organizationId,row.revision-50]);
      const areas=validation.createsAreas ? publicAreas((await areaRows(client,organizationId)).rows) : undefined;
      if(validation.createsAreas)await syncFarmAreaMaps(client,organizationId,validation.plan,row.revision,req.user.id);
      const layouts=await farmLayouts(client,organizationId,validation.plan,row.revision);
      await client.query('COMMIT');
      res.json({layouts,plan:row.plan_data,revision:row.revision,updatedAt:row.updated_at,...(areas ? {areas} : {})});
    }catch(error){if(client)await client.query('ROLLBACK').catch(()=>{});next(error);}
    finally{client?.release();}
  });
}
