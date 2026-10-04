import { analyzeHistoricalAgronomy } from '../agronomy/index.js';
import { explainDiagnostics } from './explanations.js';
import { buildDiagnosticTraces } from './evidence.js';
import { controllerResponses } from './controller-response.js';
import { randomUUID } from 'node:crypto';
import { pool } from '../db.js';
import { analyzeObservations, METHOD_VERSION } from './engine.js';
import { advanceDetector, expireDetector } from './detector.js';

export async function buildAreaDiagnostic(db, organizationId, areaId, {days=7,to=new Date().toISOString(),timeZone='Europe/Vilnius'}={}) {
  if(![7,14,30].includes(Number(days)))throw Object.assign(new Error('Choose 7, 14 or 30 days'),{status:400});
  const until=new Date(to),from=new Date(+until-Number(days)*86400000);
  if(!Number.isFinite(+until)||+until>Date.now()+60000)throw Object.assign(new Error('Invalid diagnostic end time'),{status:400});
  try{new Intl.DateTimeFormat('en',{timeZone}).format(until);}catch{throw Object.assign(new Error('Invalid time zone'),{status:400});}
  const area=await db.query('SELECT id,name FROM areas WHERE organization_id=$1 AND id=$2',[organizationId,areaId]);
  if(!area.rows.length)throw Object.assign(new Error('Area not found'),{status:404});
  const {rows:inventory}=await db.query(`SELECT n.dev_eui, jsonb_build_object('nodeId',n.dev_eui,'nodeName',n.name,'sectionId',n.section_id,'areaId',n.area_id,'source',n.source,'sectionName',s.name,'profileId',s.crop_profile,'stage',p.stage,'metrics',p.metrics,
    'sensors',COALESCE((SELECT jsonb_agg(to_jsonb(c)) FROM node_sensor_configs c WHERE c.organization_id=n.organization_id AND c.node_dev_eui=n.dev_eui),'[]'::jsonb)) AS context
    FROM nodes n JOIN sections s ON s.organization_id=n.organization_id AND s.id=n.section_id
    LEFT JOIN crop_profiles p ON p.organization_id=s.organization_id AND p.id=s.crop_profile
    WHERE n.organization_id=$1 AND n.area_id=$2 AND n.archived_at IS NULL AND n.source<>'simulated'`,[organizationId,areaId]);
  const contexts=new Map(inventory.map(n=>[n.dev_eui,n.context]));
  const {rows:capturedContexts}=await db.query('SELECT id,snapshot FROM diagnostic_contexts WHERE organization_id=$1 AND area_id=$2',[organizationId,areaId]);
  const capturedById=new Map(capturedContexts.map(c=>[c.id,c.snapshot]));
  const {rows}=await db.query(`SELECT m.*,NULL::jsonb AS context
    FROM diagnostic_contexts c JOIN measurements m ON m.diagnostic_context_id=c.id
    WHERE c.organization_id=$1 AND c.area_id=$2 AND COALESCE(c.snapshot->>'source','physical')<>'simulated' AND m.time >= $3::timestamptz-interval '2 hours' AND m.time<=$4
    UNION ALL
    SELECT m.*,NULL::jsonb AS context FROM measurements m JOIN nodes n ON n.dev_eui=m.dev_eui
    WHERE m.diagnostic_context_id IS NULL AND n.organization_id=$1 AND n.area_id=$2 AND n.archived_at IS NULL AND n.source<>'simulated'
      AND m.time >= $3::timestamptz-interval '2 hours' AND m.time<=$4
    LIMIT 300001`,[organizationId,areaId,from.toISOString(),until.toISOString()]);
  if(rows.length>300000)throw Object.assign(new Error('This window exceeds 300,000 observations. Choose a shorter period.'),{status:422});
  for(const row of rows)row.context = capturedById.get(row.diagnostic_context_id) || contexts.get(row.dev_eui);
  const report=analyzeObservations(rows,{from,to:until,timeZone,inventory});
  const [episodes,events,actions,calibrations,cycles]=await Promise.all([
    db.query(`SELECT * FROM diagnostic_episodes WHERE organization_id=$1 AND area_id=$2 AND started_at<=$4 AND COALESCE(ended_at,$4::timestamptz)>=$3 ORDER BY started_at DESC LIMIT 2001`,[organizationId,areaId,from,until]),
    db.query('SELECT * FROM diagnostic_controller_events WHERE organization_id=$1 AND area_id=$2 AND occurred_at BETWEEN $3 AND $4 ORDER BY occurred_at',[organizationId,areaId,from,until]),
    db.query(`SELECT i.* FROM interventions i JOIN sections s ON s.organization_id=i.organization_id AND s.id=i.section_id WHERE i.organization_id=$1 AND s.area_id=$2 AND i.performed_at BETWEEN $3 AND $4 ORDER BY i.performed_at DESC LIMIT 200`,[organizationId,areaId,from,until]),
    db.query(`SELECT c.* FROM diagnostic_calibrations c JOIN nodes n ON n.organization_id=c.organization_id AND n.dev_eui=c.node_id WHERE c.organization_id=$1 AND n.area_id=$2 ORDER BY c.calibrated_at DESC LIMIT 200`,[organizationId,areaId]),
    db.query(`SELECT c.* FROM diagnostic_cycles c JOIN sections s ON s.organization_id=c.organization_id AND s.id=c.section_id WHERE c.organization_id=$1 AND s.area_id=$2 ORDER BY c.starts_at DESC LIMIT 200`,[organizationId,areaId])
  ]);
  const {rows:layouts}=await db.query(`SELECT map_data,valid_from,source FROM greenhouse_map_layout_history
    WHERE organization_id=$1 AND area_id=$2 AND valid_from<=$3 AND (valid_to IS NULL OR valid_to>$3)
    ORDER BY valid_from DESC LIMIT 1`,[organizationId,areaId,until]);
  const layout=layouts[0];
  const diagnosticMap=layout?{...layout.map_data,objects:(layout.map_data.objects||[]).map(o=>({...o,metadata:{...o.metadata,sensor:o.metadata?.sensor?{...o.metadata.sensor,measurements:undefined,status:'unassigned',batteryPercent:undefined,lastSeenAt:undefined}:undefined}})),heatmapSettings:{...layout.map_data.heatmapSettings,enabled:false}}:null;
  return {...report,...analyzeHistoricalAgronomy(rows,report),explanations:explainDiagnostics(rows,report),...buildDiagnosticTraces(rows,report),diagnosticMap,mapValidFrom:layout?.valid_from||null,mapSource:layout?.source||null,area:area.rows[0],days:Number(days),episodes:episodes.rows.slice(0,2000).map(e=>{
      const evidence={...e.evidence};if(evidence.latest&&+new Date(evidence.latest.observedAt)>+until)delete evidence.latest;
      const extendsPastEnd=e.ended_at&&+new Date(e.ended_at)>+until;
      return {...e,evidence,last_observed_at:new Date(Math.min(+new Date(e.last_observed_at),+until)),ended_at:extendsPastEnd?null:e.ended_at,resolution_reason:extendsPastEnd?null:e.resolution_reason};
    }),episodesTruncated:episodes.rows.length>2000,
    controllerResponses:controllerResponses(rows,events.rows,{from,to:until}),controllerResponsesTruncated:events.rows.length>100,controllerEvents:events.rows,interventions:actions.rows,calibrations:calibrations.rows,cycles:cycles.rows,
    inputs:{controller:events.rows.some(e=>e.source==='controller'),calibration:calibrations.rows.length>0,cycle:cycles.rows.length>0,ppfd:report.metrics.some(m=>m.metric==='ppfd'&&m.observedMinutes>0),energy:false,yield:false},
    warnings:[...(rows.some(r=>!r.diagnostic_context_id)?['legacy-context-estimated']:[]),...(inventory.length?[]:['no-physical-nodes']),...(report.metrics.some(m=>m.estimatedContextPct>0)?['history-before-context-capture']:[])]};
}

async function persistTransitions(db,tenant,transitions){
  for(const t of transitions){
    if(t.type==='close'){
      await db.query(`UPDATE diagnostic_episodes SET ended_at=GREATEST(started_at,$3::timestamptz),resolution_reason=$4 WHERE organization_id=$1 AND signal_key=$2 AND ended_at IS NULL`,[tenant,t.key,new Date(t.at),t.reason]);
    }else{
      await db.query(`INSERT INTO diagnostic_episodes(id,organization_id,signal_key,area_id,section_id,node_id,metric,kind,severity,started_at,last_observed_at,evidence,method_version)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10,$11,$12)
        ON CONFLICT(organization_id,signal_key) WHERE ended_at IS NULL DO UPDATE SET
        last_observed_at=GREATEST(diagnostic_episodes.last_observed_at,EXCLUDED.last_observed_at),
        severity=CASE WHEN EXCLUDED.severity='critical' THEN 'critical' ELSE diagnostic_episodes.severity END,
        evidence=diagnostic_episodes.evidence || jsonb_build_object('latest',EXCLUDED.evidence)`,
      [randomUUID(),tenant,t.key,t.ctx.areaId,t.ctx.sectionId,t.nodeId,t.metric,t.kind,t.severity,new Date(t.at),t.evidence,METHOD_VERSION]);
    }
  }
}
export async function processDiagnosticTenant(tenant, databasePool=pool){
  const db=await databasePool.connect();
  try{
    await db.query('BEGIN');
    const lock=await db.query("SELECT pg_try_advisory_xact_lock(hashtext($1)) AS locked",[`diagnostics:${tenant}`]);
    if(!lock.rows[0].locked){await db.query('ROLLBACK');return;}
    await db.query('INSERT INTO diagnostic_detector_state(organization_id) VALUES($1) ON CONFLICT DO NOTHING',[tenant]);
    const {rows:[checkpoint]}=await db.query('SELECT * FROM diagnostic_detector_state WHERE organization_id=$1 FOR UPDATE',[tenant]);
    const {rows}=await db.query(`SELECT m.*,c.snapshot AS context FROM diagnostic_observation_queue q
      JOIN measurements m ON m.id=q.measurement_id JOIN diagnostic_contexts c ON c.id=m.diagnostic_context_id AND c.organization_id=q.organization_id
      WHERE q.organization_id=$1 ORDER BY m.time,m.id LIMIT 5000 FOR UPDATE OF q SKIP LOCKED`,[tenant]);
    const state=checkpoint.state;
    for(const row of rows)if(row.context?.source!=='simulated')await persistTransitions(db,tenant,advanceDetector(state,row));
    if(rows.length)await db.query('DELETE FROM diagnostic_observation_queue WHERE organization_id=$1 AND measurement_id=ANY($2::bigint[])',[tenant,rows.map(row=>row.id)]);
    await db.query('DELETE FROM diagnostic_observation_queue q WHERE q.organization_id=$1 AND NOT EXISTS(SELECT 1 FROM measurements m WHERE m.id=q.measurement_id)',[tenant]);
    // Do not expire on wall time while there is still a backlog to process.
    if(rows.length<5000)await persistTransitions(db,tenant,expireDetector(state,Date.now()));
    await db.query('UPDATE diagnostic_detector_state SET cursor_id=$2,state=$3,updated_at=now() WHERE organization_id=$1',[tenant,rows.at(-1)?.id||checkpoint.cursor_id,state]);
    await db.query('COMMIT');
  }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}finally{db.release();}
}
export async function saveReport(db,tenant,areaId,options,userId=null,scheduleKey=null){
  const snapshot=await buildAreaDiagnostic(db,tenant,areaId,options),id=randomUUID();
  const {rows}=await db.query(`INSERT INTO diagnostic_reports(id,organization_id,area_id,created_by,snapshot,schedule_key) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(schedule_key) DO NOTHING RETURNING id`,[id,tenant,areaId,userId,snapshot,scheduleKey]);
  return {id:rows[0]?.id||null,snapshot};
}
export function startDiagnosticMonitor({evaluateRisks}={}){
  let stopped=false,running=null;
  const tick=async()=>{
    if(stopped||running)return;
    running=(async()=>{
      const {rows}=await pool.query("SELECT id FROM organizations WHERE status='active'");
      for(const tenant of rows){if(stopped)break;try{await processDiagnosticTenant(tenant.id);await evaluateRisks?.(tenant.id);}catch(e){console.error('[diagnostics] evaluation failed',e.message);}}
      const {rows:schedules}=await pool.query('SELECT * FROM diagnostic_schedules WHERE enabled=true AND next_run_at<=now() ORDER BY next_run_at LIMIT 10');
      for(const schedule of schedules){if(stopped)break;try{
        // Immutable unique schedule key makes concurrent API replicas idempotent.
        await saveReport(pool,schedule.organization_id,schedule.area_id,{days:schedule.days,to:schedule.next_run_at,timeZone:schedule.time_zone},null,`${schedule.organization_id}:${schedule.area_id}:${new Date(schedule.next_run_at).toISOString()}`);
        await pool.query("UPDATE diagnostic_schedules SET next_run_at=next_run_at+days*interval '1 day' WHERE organization_id=$1 AND area_id=$2 AND next_run_at=$3",[schedule.organization_id,schedule.area_id,schedule.next_run_at]);
      }catch(e){console.error('[diagnostics] scheduled report failed',e.message);}}
    })().catch(e=>console.error('[diagnostics] monitor failed',e.message));
    try{await running;}finally{running=null;}
  };
  const first=setTimeout(()=>void tick(),5000),timer=setInterval(()=>void tick(),60000);first.unref?.();timer.unref?.();
  return async()=>{stopped=true;clearTimeout(first);clearInterval(timer);await running;};
}
