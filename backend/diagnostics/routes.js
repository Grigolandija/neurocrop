import { randomUUID } from 'node:crypto';
import { pool } from '../db.js';
import { requireUserAuth, requireRole } from '../auth-users.js';
import { buildAreaDiagnostic, saveReport } from './repository.js';
const writers=requireRole('owner','admin','grower');
const technicians=requireRole('owner','admin','technician');
const wrap=fn=>async(req,res,next)=>{try{res.set('Cache-Control','no-store');await fn(req,res);}catch(e){if(e.status&&e.status<500)return res.status(e.status).json({error:{code:'DIAGNOSTIC_ERROR',message:e.message}});next(e);}};
const bad=message=>{throw Object.assign(new Error(message),{status:400});};
const csv=value=>{let s=String(value??'');if(/^[=+\-@]/.test(s))s=`'${s}`;return `"${s.replaceAll('"','""')}"`;};
export function registerDiagnosticRoutes(app){
  const org=req=>req.user.organizationId;
  app.get('/diagnostics/comparison',requireUserAuth,wrap(async(req,res)=>{
    const ids=[...new Set(String(req.query.areaIds||'').split(',').filter(Boolean))];if(ids.length<2||ids.length>6)bad('Choose 2–6 greenhouses');
    const summaries=[];
    // Sequential, bounded queries avoid exhausting the shared database pool.
    for(const id of ids){const report=await buildAreaDiagnostic(pool,org(req),id,req.query);summaries.push({area:report.area,metrics:report.metrics,from:report.from,to:report.to});}
    res.json({areas:summaries});
  }));
  app.get('/diagnostics/farms',requireUserAuth,wrap(async(req,res)=>{
    const {rows}=await pool.query('SELECT id,name FROM farms WHERE organization_id=$1 ORDER BY name',[org(req)]);res.json({farms:rows});
  }));
  app.post('/diagnostics/farms',requireUserAuth,writers,wrap(async(req,res)=>{
    const name=String(req.body?.name||'').trim();if(!name||name.length>200)bad('Invalid farm name');
    const id=randomUUID();await pool.query('INSERT INTO farms(id,organization_id,name) VALUES($1,$2,$3)',[id,org(req),name]);res.status(201).json({id,name});
  }));
  app.post('/diagnostics/areas/:areaId/farm',requireUserAuth,writers,wrap(async(req,res)=>{
    const farmId=req.body?.farmId||null;
    if(farmId&&!(await pool.query('SELECT id FROM farms WHERE organization_id=$1 AND id=$2',[org(req),farmId])).rows.length)bad('Unknown farm');
    const {rows}=await pool.query('UPDATE areas SET farm_id=$3 WHERE organization_id=$1 AND id=$2 RETURNING id,farm_id',[org(req),req.params.areaId,farmId]);if(!rows.length)bad('Unknown Area');res.json(rows[0]);
  }));
  app.get('/diagnostics/areas/:areaId',requireUserAuth,wrap(async(req,res)=>res.json(await buildAreaDiagnostic(pool,org(req),req.params.areaId,req.query))));
  app.get('/diagnostic-reports',requireUserAuth,wrap(async(req,res)=>{
    const {rows}=await pool.query(`SELECT id,area_id,created_at,snapshot->'area' AS area,snapshot->>'from' AS "from",snapshot->>'to' AS "to",snapshot->>'days' AS days FROM diagnostic_reports WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 100`,[org(req)]);res.json({reports:rows});
  }));
  app.post('/diagnostic-reports',requireUserAuth,writers,wrap(async(req,res)=>res.status(201).json(await saveReport(pool,org(req),String(req.body?.areaId||''),req.body,req.user.id))));
  app.get('/diagnostic-reports/:id',requireUserAuth,wrap(async(req,res)=>{
    const {rows}=await pool.query('SELECT id,snapshot,created_at FROM diagnostic_reports WHERE organization_id=$1 AND id=$2',[org(req),req.params.id]);
    if(!rows.length)return res.status(404).json({error:{code:'NOT_FOUND',message:'Report not found'}});res.json(rows[0]);
  }));
  app.get('/diagnostic-reports/:id/export.csv',requireUserAuth,wrap(async(req,res)=>{
    const {rows}=await pool.query('SELECT snapshot FROM diagnostic_reports WHERE organization_id=$1 AND id=$2',[org(req),req.params.id]);
    if(!rows.length)return res.status(404).json({error:{code:'NOT_FOUND',message:'Report not found'}});
    const columns=['sectionId','name','metric','unit','minimum','maximum','mean','coveragePct','observedMinutes','unknownMinutes','belowMinutes','aboveMinutes','outsideObservedPct','peerDelta','peerMinutes','recurringDays','estimatedContextPct'];
    res.set('Content-Type','text/csv; charset=utf-8').set('Content-Disposition','attachment; filename="neurocrop-diagnostic.csv"');
    res.send('\ufeff'+[columns.map(csv).join(','),...rows[0].snapshot.metrics.map(m=>columns.map(c=>csv(m[c])).join(','))].join('\r\n'));
  }));
  app.get('/diagnostics/areas/:areaId/schedule',requireUserAuth,wrap(async(req,res)=>{
    const {rows}=await pool.query('SELECT * FROM diagnostic_schedules WHERE organization_id=$1 AND area_id=$2',[org(req),req.params.areaId]);res.json(rows[0]||{enabled:false,days:7,time_zone:'Europe/Vilnius'});
  }));
  app.post('/diagnostics/areas/:areaId/schedule',requireUserAuth,writers,wrap(async(req,res)=>{
    const days=Number(req.body.days),timeZone=String(req.body.timeZone||'Europe/Vilnius');if(![7,14,30].includes(days)||typeof req.body.enabled!=='boolean')bad('Invalid schedule');
    try{new Intl.DateTimeFormat('en',{timeZone}).format();}catch{bad('Invalid time zone');}
    const {rows}=await pool.query(`INSERT INTO diagnostic_schedules(organization_id,area_id,days,enabled,time_zone,next_run_at)
      SELECT organization_id,id,$3,$4,$5,now()+$3*interval '1 day' FROM areas WHERE organization_id=$1 AND id=$2
      ON CONFLICT(organization_id,area_id) DO UPDATE SET days=EXCLUDED.days,enabled=EXCLUDED.enabled,time_zone=EXCLUDED.time_zone,next_run_at=EXCLUDED.next_run_at RETURNING *`,[org(req),req.params.areaId,days,req.body.enabled,timeZone]);
    if(!rows.length)return res.status(404).json({error:{code:'NOT_FOUND',message:'Area not found'}});res.json(rows[0]);
  }));
  app.post('/diagnostics/controller-events',requireUserAuth,technicians,wrap(async(req,res)=>{
    const b=req.body||{},time=new Date(b.occurredAt);
    if(!['controller','manual'].includes(b.source)||!Number.isFinite(+time)||+time>Date.now()+60000||!b.deviceId||!b.channel||!b.externalId||!b.state||typeof b.state!=='object'||Array.isArray(b.state)||JSON.stringify(b.state).length>10000)bad('Invalid controller event');
    if([b.deviceId,b.channel,b.externalId].some(v=>typeof v!=='string'||v.length>200))bad('Invalid controller identity');
    const {rows}=await pool.query('SELECT id FROM areas WHERE organization_id=$1 AND id=$2',[org(req),b.areaId]);if(!rows.length)bad('Unknown Area');
    if(b.sectionId){const result=await pool.query('SELECT id FROM sections WHERE organization_id=$1 AND area_id=$2 AND id=$3',[org(req),b.areaId,b.sectionId]);if(!result.rows.length)bad('Section does not belong to Area');}
    const result=await pool.query(`INSERT INTO diagnostic_controller_events(id,organization_id,area_id,section_id,occurred_at,source,device_id,channel,state,external_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(organization_id,device_id,external_id) DO NOTHING RETURNING id`,[randomUUID(),org(req),b.areaId,b.sectionId||null,time,b.source,b.deviceId,b.channel,b.state,b.externalId]);res.status(result.rows.length?201:200).json({accepted:true,duplicate:!result.rows.length,id:result.rows[0]?.id});
  }));
  app.post('/diagnostics/calibrations',requireUserAuth,technicians,wrap(async(req,res)=>{
    const b=req.body||{},time=new Date(b.calibratedAt),expires=b.expiresAt?new Date(b.expiresAt):null;
    if(!Number.isFinite(+time)||+time>Date.now()||!b.port||!String(b.reference||'').trim()||String(b.reference).length>2000||(expires&&(!Number.isFinite(+expires)||expires<=time))||(b.uncertainty!=null&&(!Number.isFinite(b.uncertainty)||b.uncertainty<0)))bad('Invalid calibration');
    const {rows}=await pool.query('SELECT dev_eui FROM nodes WHERE organization_id=$1 AND dev_eui=$2',[org(req),b.nodeId]);if(!rows.length)bad('Unknown node');
    const id=randomUUID();await pool.query(`INSERT INTO diagnostic_calibrations(id,organization_id,node_id,port,calibrated_at,expires_at,reference,uncertainty,coefficients,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[id,org(req),b.nodeId,b.port,time,expires,b.reference,b.uncertainty??null,b.coefficients||{},req.user.id]);res.status(201).json({id});
  }));
  app.post('/diagnostics/cycles',requireUserAuth,writers,wrap(async(req,res)=>{
    const b=req.body||{},start=new Date(b.startsAt),end=b.endsAt?new Date(b.endsAt):null;
    if(!String(b.crop||'').trim()||!Number.isFinite(+start)||(end&&(!Number.isFinite(+end)||end<=start)))bad('Invalid growing cycle');
    const id=randomUUID();const {rows}=await pool.query(`INSERT INTO diagnostic_cycles(id,organization_id,section_id,crop,cultivar,batch_id,experiment_id,stage,starts_at,ends_at)
      SELECT $1,organization_id,id,$4,$5,$6,$7,$8,$9,$10 FROM sections WHERE organization_id=$2 AND id=$3 RETURNING id`,[id,org(req),b.sectionId,String(b.crop).slice(0,200),b.cultivar||null,b.batchId||null,b.experimentId||null,b.stage||'',start,end]);if(!rows.length)bad('Unknown Section');res.status(201).json({id});
  }));
}
