import { pool, query } from './db.js';
import { requireRole, requireUserAuth } from './auth-users.js';
import { validateFarmPlan } from './farm-plan-validation.js';

const writableRoles=['owner','admin','grower','technician'];
const emptyPlan=()=>({version:1,dimensions:{widthM:50,lengthM:34},buildings:[],rooms:[],zones:[]});
export function registerFarmPlanRoutes(app,{database={pool,query}}={}){
  app.get('/farm-plan',requireUserAuth,async(req,res,next)=>{
    const organizationId=req.user.organizationId;
    try{
      const [stored,areas]=await Promise.all([
        database.query(`SELECT plan_data, revision, updated_at,
          (SELECT COALESCE(jsonb_object_agg(zone_id,area_id),'{}'::jsonb) FROM farm_plan_area_links WHERE organization_id=$1) AS area_links
          FROM farm_plans WHERE organization_id=$1`,[organizationId]),
        database.query(`SELECT a.id, a.name, a.kind, a.map_enabled,
          (gm.area_id IS NOT NULL) AS map_configured, gm.map_data->'dimensions' AS map_dimensions
          FROM areas a LEFT JOIN greenhouse_maps gm ON gm.organization_id=a.organization_id AND gm.area_id=a.id
          WHERE a.organization_id=$1 ORDER BY a.name, a.id`,[organizationId]),
      ]);
      const row=stored.rows[0],areaLinks=row?.area_links || {};
      const plan=row?.plan_data || emptyPlan();
      res.set('Cache-Control','private, no-store');
      res.json({draftScope:`${organizationId}:${req.user.id}`,plan:{...plan,zones:plan.zones.map(zone=>({...zone,areaId:Object.hasOwn(areaLinks,zone.id) ? areaLinks[zone.id] : undefined}))},revision:row?.revision || 0,updatedAt:row?.updated_at || null,
        areas:areas.rows.map(a=>({id:a.id,name:a.name,kind:a.kind,mapEnabled:!!a.map_enabled,mapConfigured:!!a.map_configured,mapDimensions:a.map_dimensions})),permissions:{canEdit:writableRoles.includes(req.user.role)}});
    }catch(error){next(error);}
  });

  app.patch('/farm-plan',requireUserAuth,requireRole(...writableRoles),async(req,res,next)=>{
    const organizationId=req.user.organizationId,expectedRevision=req.body?.expectedRevision;
    const validation=validateFarmPlan(req.body?.plan);
    if(!validation.valid)return res.status(400).json({error:{code:'VALIDATION_ERROR',message:validation.message}});
    if(!Number.isSafeInteger(expectedRevision) || expectedRevision<0 || expectedRevision>2147483647)return res.status(400).json({error:{code:'VALIDATION_ERROR',message:'expectedRevision must be a non-negative integer'}});
    let client;
    try{
      client=await database.pool.connect();
      await client.query('BEGIN');
      if(validation.areaIds.length){
        const owned=await client.query('SELECT id FROM areas WHERE organization_id=$1 AND id=ANY($2::text[]) FOR KEY SHARE',[organizationId,validation.areaIds]);
        if(owned.rows.length!==validation.areaIds.length){await client.query('ROLLBACK');return res.status(400).json({error:{code:'AREA_NOT_AVAILABLE',message:'A linked Area no longer exists in this workspace'}});}
      }
      const serialized=JSON.stringify(validation.plan);
      const saved=expectedRevision===0
        ? await client.query(`INSERT INTO farm_plans (organization_id,plan_data,revision,updated_by) VALUES ($1,$2::jsonb,1,$3)
            ON CONFLICT (organization_id) DO NOTHING RETURNING plan_data,revision,updated_at`,[organizationId,serialized,req.user.id])
        : await client.query(`UPDATE farm_plans SET plan_data=$2::jsonb, revision=revision+1, updated_by=$3, updated_at=now()
            WHERE organization_id=$1 AND revision=$4 RETURNING plan_data,revision,updated_at`,[organizationId,serialized,req.user.id,expectedRevision]);
      if(!saved.rows[0]){await client.query('ROLLBACK');return res.status(409).json({error:{code:'FARM_PLAN_REVISION_CONFLICT',message:'The farm plan changed in another session. Reload before saving.'}});}
      const row=saved.rows[0];
      await client.query('DELETE FROM farm_plan_area_links WHERE organization_id=$1',[organizationId]);
      for(const zone of validation.plan.zones)if(zone.areaId)await client.query('INSERT INTO farm_plan_area_links (organization_id,zone_id,area_id) VALUES ($1,$2,$3)',[organizationId,zone.id,zone.areaId]);
      await client.query('INSERT INTO farm_plan_history (organization_id,revision,plan_data,saved_by) VALUES ($1,$2,$3::jsonb,$4)',[organizationId,row.revision,serialized,req.user.id]);
      await client.query('DELETE FROM farm_plan_history WHERE organization_id=$1 AND revision<=$2',[organizationId,row.revision-50]);
      await client.query('COMMIT');
      res.json({plan:row.plan_data,revision:row.revision,updatedAt:row.updated_at});
    }catch(error){if(client)await client.query('ROLLBACK').catch(()=>{});next(error);}
    finally{client?.release();}
  });
}
