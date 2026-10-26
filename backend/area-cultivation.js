import { requireRole,requireUserAuth } from './auth-users.js';
import { pool,query } from './db.js';

// Section IDs remain stable evaluation/history keys. The public default assignment is an Area.
export async function resolveNodeAssignment(database,organizationId,{areaId,sectionId}={}, {lock=false}={}){
  if((areaId!=null && typeof areaId!=='string') || (sectionId!=null && typeof sectionId!=='string'))return null;
  const area=typeof areaId==='string' ? areaId.trim() : '',group=typeof sectionId==='string' ? sectionId.trim() : '';
  if(!area && !group)return null;
  const {rows}=await database.query(`SELECT s.id,s.area_id,s.crop_profile,s.is_area_default,
      CASE WHEN s.is_area_default THEN a.name ELSE s.name END AS name
    FROM sections s JOIN areas a ON a.id=s.area_id AND a.organization_id=s.organization_id
    WHERE s.organization_id=$1 AND ${group ? 's.id=$2' : 's.area_id=$2 AND s.is_area_default'}
      ${area && group ? 'AND s.area_id=$3' : ''}${lock==='share' ? ' FOR SHARE OF s' : lock ? ' FOR UPDATE OF s' : ''}`,[organizationId,group || area,...(area && group ? [area] : [])]);
  return rows[0] || null;
}

export function registerAreaCultivationRoutes(app,{database={pool,query}}={}){
  app.get('/areas/:areaId/cultivation',requireUserAuth,async(req,res,next)=>{
    try{
      const scope=await resolveNodeAssignment(database,req.user.organizationId,{areaId:req.params.areaId});
      if(!scope)return res.status(404).json({error:{code:'NOT_FOUND',message:'Area not found'}});
      res.json({areaId:scope.area_id,defaultSectionId:scope.id,cropProfile:scope.crop_profile || null});
    }catch(error){next(error);}
  });
  app.patch('/areas/:areaId/cultivation',requireUserAuth,requireRole('owner','admin','grower'),async(req,res,next)=>{
    const organizationId=req.user.organizationId;
    if(!Object.hasOwn(req.body || {},'cropProfile') || (req.body.cropProfile!==null && (typeof req.body.cropProfile!=='string' || !req.body.cropProfile.trim())))return res.status(400).json({error:{code:'VALIDATION_ERROR',message:'Choose a crop profile, or null when unknown'}});
    let client;
    try{
      client=await database.pool.connect();await client.query('BEGIN');
      const scope=await resolveNodeAssignment(client,organizationId,{areaId:req.params.areaId},{lock:true});
      if(!scope){await client.query('ROLLBACK');return res.status(404).json({error:{code:'NOT_FOUND',message:'Area not found'}});}
      const profile=req.body.cropProfile?.trim() || null;
      if(profile){const {rows}=await client.query('SELECT id FROM crop_profiles WHERE organization_id=$1 AND id=$2 FOR KEY SHARE',[organizationId,profile]);if(!rows.length){await client.query('ROLLBACK');return res.status(400).json({error:{code:'VALIDATION_ERROR',message:'Unknown crop profile'}});}}
      await client.query('UPDATE sections SET crop_profile=$3 WHERE organization_id=$1 AND area_id=$2 AND (is_area_default OR inherit_area_profile)',[organizationId,scope.area_id,profile]);
      await client.query('COMMIT');res.json({areaId:scope.area_id,defaultSectionId:scope.id,cropProfile:profile});
    }catch(error){if(client)await client.query('ROLLBACK').catch(()=>{});next(error);}finally{client?.release();}
  });
}
