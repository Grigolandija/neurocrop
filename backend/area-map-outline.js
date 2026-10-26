// Shared by API validation and the map editors. Coordinates are metres in the Area's local frame.
const eps=1e-7;
const cross=(a,b,p)=>(b.xM-a.xM)*(p.yM-a.yM)-(b.yM-a.yM)*(p.xM-a.xM);
const onEdge=(p,a,b)=>Math.abs(cross(a,b,p))<eps && p.xM>=Math.min(a.xM,b.xM)-eps && p.xM<=Math.max(a.xM,b.xM)+eps && p.yM>=Math.min(a.yM,b.yM)-eps && p.yM<=Math.max(a.yM,b.yM)+eps;
export function insideOutline(p,polygon){
  let inside=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const a=polygon[i],b=polygon[j];if(onEdge(p,a,b))return true;
    if((a.yM>p.yM)!==(b.yM>p.yM) && p.xM<(b.xM-a.xM)*(p.yM-a.yM)/(b.yM-a.yM)+a.xM)inside=!inside;
  }
  return inside;
}
export function outlinePoints(map){return map.shape.type==='polygon' ? map.shape.points : [{xM:0,yM:0},{xM:map.dimensions.widthM,yM:0},{xM:map.dimensions.widthM,yM:map.dimensions.lengthM},{xM:0,yM:map.dimensions.lengthM}];}
export function objectFootprint(object){
  const a=object.rotationDeg*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
  return [[0,0],[object.widthM,0],[object.widthM,object.lengthM],[0,object.lengthM]].map(([x,y])=>({xM:object.xM+x*c-y*s,yM:object.yM+x*s+y*c}));
}
function segmentInside(a,b,polygon){
  const dx=b.xM-a.xM,dy=b.yM-a.yM,cuts=[0,1];
  for(let i=0;i<polygon.length;i++){
    const p=polygon[i],q=polygon[(i+1)%polygon.length],ex=q.xM-p.xM,ey=q.yM-p.yM,den=dx*ey-dy*ex;
    if(Math.abs(den)<eps)continue;
    const t=((p.xM-a.xM)*ey-(p.yM-a.yM)*ex)/den,u=((p.xM-a.xM)*dy-(p.yM-a.yM)*dx)/den;
    if(t>0 && t<1 && u>=0 && u<=1)cuts.push(t);
  }
  cuts.sort((a,b)=>a-b);
  return cuts.slice(1).every((t,i)=>insideOutline({xM:a.xM+dx*(t+cuts[i])/2,yM:a.yM+dy*(t+cuts[i])/2},polygon));
}
export function objectInsideOutline(object,map){
  const polygon=outlinePoints(map),points=objectFootprint(object);
  if(object.type==='sensor-node')return insideOutline({xM:(points[0].xM+points[2].xM)/2,yM:(points[0].yM+points[2].yM)/2},polygon);
  return points.every((p,i)=>insideOutline(p,polygon) && segmentInside(p,points[(i+1)%4],polygon));
}
export function areaGeometry(plan,revision,areaId,zoneId=areaId){
  const a=plan?.version===2 ? plan.areas?.find(a=>a.id===areaId) : plan?.zones?.find(a=>a.areaId===areaId && a.id===zoneId);
  if(!a?.polygon?.length)return null;
  const x=Math.min(...a.polygon.map(p=>p.xM)),y=Math.min(...a.polygon.map(p=>p.yM));
  return {areaId,revision,name:a.name,kind:a.kind,heightM:a.height,widthM:Math.max(...a.polygon.map(p=>p.xM))-x,lengthM:Math.max(...a.polygon.map(p=>p.yM))-y,polygon:a.polygon.map(p=>({xM:p.xM-x,yM:p.yM-y})),origin:{xM:x,yM:y}};
}
export function applyAreaGeometry(map,geometry){
  if(!geometry)return map;
  return {...map,name:geometry.name,orientationDeg:0,shape:{type:'polygon',points:geometry.polygon},dimensions:{widthM:geometry.widthM,lengthM:geometry.lengthM,heightM:geometry.heightM},farmPlanGeometry:{areaId:geometry.areaId,revision:geometry.revision,kind:geometry.kind}};
}
export async function loadAreaGeometry(database,organizationId,areaId,lock=false){
  const {rows}=await database.query(`SELECT p.plan_data,p.revision,l.zone_id FROM farm_plans p JOIN farm_plan_area_links l ON l.organization_id=p.organization_id WHERE p.organization_id=$1 AND l.area_id=$2${lock ? ' FOR SHARE OF p' : ''}`,[organizationId,areaId]);
  return rows[0] ? areaGeometry(rows[0].plan_data,rows[0].revision,areaId,rows[0].zone_id) : null;
}

/** Keep the recorded map geometry in step with farm edits without relocating any equipment. */
export async function syncFarmAreaMaps(client,organizationId,plan,revision,userId){
  const {rows}=await client.query('SELECT area_id,map_data FROM greenhouse_maps WHERE organization_id=$1 ORDER BY area_id FOR UPDATE',[organizationId]);
  for(const row of rows){
    const geometry=areaGeometry(plan,revision,row.area_id);if(!geometry)continue;
    const next=applyAreaGeometry(row.map_data,geometry),old=row.map_data;
    if(old.shape?.type==='polygon' && old.shape.points.length===next.shape.points.length && old.shape.points.every((p,i)=>p.xM===next.shape.points[i].xM && p.yM===next.shape.points[i].yM) && ['widthM','lengthM','heightM'].every(k=>old.dimensions[k]===next.dimensions[k]) && old.name===next.name && old.farmPlanGeometry?.kind===next.farmPlanGeometry.kind)continue;
    const result=await client.query('UPDATE greenhouse_maps SET map_data=$3::jsonb,revision=revision+1,updated_by=$4,updated_at=clock_timestamp() WHERE organization_id=$1 AND area_id=$2 RETURNING revision,updated_at',[organizationId,row.area_id,JSON.stringify(next),userId]);
    const saved=result.rows[0];
    await client.query('UPDATE greenhouse_map_layout_history SET valid_to=$3 WHERE organization_id=$1 AND area_id=$2 AND valid_to IS NULL',[organizationId,row.area_id,saved.updated_at]);
    await client.query("INSERT INTO greenhouse_map_layout_history (organization_id,area_id,revision,map_data,valid_from,source,recorded_by) VALUES ($1,$2,$3,$4::jsonb,$5,'recorded',$6)",[organizationId,row.area_id,saved.revision,JSON.stringify(next),saved.updated_at,userId]);
  }
}
export function outlineError(map){
  if(map.shape?.type==='rectangle')return null;
  if(map.shape?.type!=='polygon' || !Array.isArray(map.shape.points))return 'A rectangle or polygon outline is required';
  const p=map.shape.points;
  if(p.length<3 || p.length>64 || p.some(q=>!q || !Number.isFinite(q.xM) || !Number.isFinite(q.yM) || q.xM<0 || q.yM<0 || q.xM>map.dimensions.widthM+eps || q.yM>map.dimensions.lengthM+eps))return 'Invalid Area outline points';
  let area=0;
  for(let i=0;i<p.length;i++){
    const a=p[i],b=p[(i+1)%p.length];
    if(Math.hypot(a.xM-b.xM,a.yM-b.yM)<eps)return 'Outline vertices must be distinct';
    area+=a.xM*b.yM-a.yM*b.xM;
    for(let j=i+2;j<p.length;j++){
      if(i===0 && j===p.length-1)continue;
      const c=p[j],d=p[(j+1)%p.length];
      if((cross(a,b,c)*cross(a,b,d)<-eps && cross(c,d,a)*cross(c,d,b)<-eps) || onEdge(c,a,b) || onEdge(d,a,b) || onEdge(a,c,d) || onEdge(b,c,d))return 'Outline edges cannot cross';
    }
  }
  return Math.abs(area)/2<.25 ? 'Outline area must be at least 0.25 square metres' : null;
}
export function validOutlineMount(object,map){
  const index=object.metadata?.wallMount?.edgeIndex,p=outlinePoints(map);
  if(!Number.isInteger(index) || index<0 || index>=p.length)return false;
  const points=objectFootprint(object);
  return onEdge(points[0],p[index],p[(index+1)%p.length]) && onEdge(points[1],p[index],p[(index+1)%p.length]);
}
