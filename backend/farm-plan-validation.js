const finite = value => typeof value === 'number' && Number.isFinite(value);
const epsilon = 1e-7;
const cross = (a,b,c) => (b.xM-a.xM)*(c.yM-a.yM)-(b.yM-a.yM)*(c.xM-a.xM);
const onEdge = (p,a,b) => Math.abs(cross(a,b,p))<epsilon && p.xM>=Math.min(a.xM,b.xM)-epsilon && p.xM<=Math.max(a.xM,b.xM)+epsilon && p.yM>=Math.min(a.yM,b.yM)-epsilon && p.yM<=Math.max(a.yM,b.yM)+epsilon;
function inside(point,polygon) {
  let result=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
    const a=polygon[i],b=polygon[j];
    if(onEdge(point,a,b))return true;
    if((a.yM>point.yM)!==(b.yM>point.yM) && point.xM<(b.xM-a.xM)*(point.yM-a.yM)/(b.yM-a.yM)+a.xM)result=!result;
  }
  return result;
}
function intersects(a,b,c,d) {
  return (cross(a,b,c)*cross(a,b,d)<-epsilon && cross(c,d,a)*cross(c,d,b)<-epsilon) || onEdge(a,c,d) || onEdge(b,c,d) || onEdge(c,a,b) || onEdge(d,a,b);
}
function segmentInside(a,b,polygon) {
  const dx=b.xM-a.xM,dy=b.yM-a.yM,cuts=[0,1];
  for(let i=0;i<polygon.length;i++){
    const p=polygon[i],q=polygon[(i+1)%polygon.length],ex=q.xM-p.xM,ey=q.yM-p.yM,den=dx*ey-dy*ex;
    if(Math.abs(den)<epsilon)continue;
    const t=((p.xM-a.xM)*ey-(p.yM-a.yM)*ex)/den,u=((p.xM-a.xM)*dy-(p.yM-a.yM)*dx)/den;
    if(t>0 && t<1 && u>=0 && u<=1)cuts.push(t);
  }
  cuts.sort((a,b)=>a-b);
  return cuts.slice(1).every((t,i)=>{const m=(cuts[i]+t)/2;return inside({xM:a.xM+dx*m,yM:a.yM+dy*m},polygon);});
}
const contained=(outer,inner)=>inner.every((p,i)=>inside(p,outer) && segmentInside(p,inner[(i+1)%inner.length],outer));
function polygonError(polygon,dimensions){
  if(!Array.isArray(polygon) || polygon.length<3 || polygon.length>64)return 'A contour must contain 3 to 64 points';
  if(polygon.some(p=>!p || !finite(p.xM) || !finite(p.yM) || p.xM<0 || p.yM<0 || p.xM>dimensions.widthM || p.yM>dimensions.lengthM))return 'Contour points must lie within the farm plan';
  let area=0;
  for(let i=0;i<polygon.length;i++){
    const a=polygon[i],b=polygon[(i+1)%polygon.length];
    if(Math.hypot(a.xM-b.xM,a.yM-b.yM)<epsilon)return 'Adjacent points must be distinct';
    area+=a.xM*b.yM-b.xM*a.yM;
    for(let j=i+1;j<polygon.length;j++)if(j!==i+1 && !(i===0 && j===polygon.length-1) && intersects(a,b,polygon[j],polygon[(j+1)%polygon.length]))return 'Contour edges cannot cross';
  }
  return Math.abs(area)/2<.25 ? 'Contour area must be at least 0.25 square metres' : null;
}

function overlap(a,b){
  const strict=(p,poly)=>inside(p,poly) && !poly.some((q,i)=>onEdge(p,q,poly[(i+1)%poly.length]));
  if(a.some(p=>strict(p,b)) || b.some(p=>strict(p,a)))return true;
  for(let i=0;i<a.length;i++)for(let j=0;j<b.length;j++)if(cross(a[i],a[(i+1)%a.length],b[j])*cross(a[i],a[(i+1)%a.length],b[(j+1)%b.length])<-epsilon && cross(b[j],b[(j+1)%b.length],a[i])*cross(b[j],b[(j+1)%b.length],a[(i+1)%a.length])<-epsilon)return true;
  // Equal contours and aligned strips can overlap with every vertex on an edge.
  for(const poly of [a,b])for(let i=0;i<poly.length;i++){
    const p=poly[i],q=poly[(i+1)%poly.length],length=Math.hypot(q.xM-p.xM,q.yM-p.yM);
    const mid={xM:(p.xM+q.xM)/2,yM:(p.yM+q.yM)/2};
    for(const direction of [-1,1]){
      const sample={xM:mid.xM-(q.yM-p.yM)/length*.0001*direction,yM:mid.yM+(q.xM-p.xM)/length*.0001*direction};
      if(strict(sample,a) && strict(sample,b))return true;
    }
  }
  return false;
}

/** Whitelist geometry and Area references. Client measurements never enter the farm plan. */
export function validateFarmPlan(input){
  const invalid=message=>({valid:false,message});
  if(input?.version===2)return validateAreaPlan(input);
  if(!input || input.version!==1 || !input.dimensions)return invalid('Unsupported farm plan');
  const dimensions={widthM:input.dimensions.widthM,lengthM:input.dimensions.lengthM};
  if(!Object.values(dimensions).every(n=>finite(n) && n>=1 && n<=10000))return invalid('Farm dimensions must be between 1 and 10000 metres');
  const plan={version:1,dimensions,buildings:[],rooms:[],zones:[]};
  const areaIds=new Set();
  for(const key of ['buildings','rooms','zones']){
    const ids=new Set();
    if(!Array.isArray(input[key]) || input[key].length>80)return invalid('At most 80 objects per layer are supported');
    for(const raw of input[key]){
      if(!raw || typeof raw.id!=='string' || !raw.id.trim() || raw.id.length>100 || ids.has(raw.id) || typeof raw.name!=='string' || !raw.name.trim() || raw.name.length>160)return invalid('Each object needs a unique id and a name');
      ids.add(raw.id);
      const error=polygonError(raw.polygon,dimensions);
      if(error)return invalid(error);
      if(!finite(raw.height) || raw.height<.5 || raw.height>12)return invalid('Object height must be between 0.5 and 12 metres');
      const item={id:raw.id,name:raw.name.trim(),height:raw.height,polygon:raw.polygon.map(p=>({xM:p.xM,yM:p.yM}))};
      if(key==='buildings'){
        if(typeof raw.greenhouse!=='boolean')return invalid('Building type is required');
        item.greenhouse=raw.greenhouse;
      }else{
        const parent=plan.buildings.find(b=>b.id===raw.buildingId);
        if(!parent || !contained(parent.polygon,item.polygon))return invalid('Rooms and zones must be inside their building');
        item.buildingId=parent.id;
        if(item.height>parent.height)return invalid('Room height cannot exceed building height');
        if(key==='zones'){
          if(raw.roomId){const room=plan.rooms.find(r=>r.id===raw.roomId && r.buildingId===parent.id);if(!room || !contained(room.polygon,item.polygon))return invalid('Zone must be inside its room');item.roomId=room.id;item.height=room.height;}
          else item.height=parent.height;
          if(raw.areaId!==undefined && raw.areaId!==null && raw.areaId!==''){
            if(typeof raw.areaId!=='string' || raw.areaId.length>100 || areaIds.has(raw.areaId))return invalid('An Area can be linked to only one zone');
            areaIds.add(raw.areaId);item.areaId=raw.areaId;
          }
        }
      }
      plan[key].push(item);
    }
    if(key!=='zones')for(let i=0;i<plan[key].length;i++)for(let j=i+1;j<plan[key].length;j++)if(overlap(plan[key][i].polygon,plan[key][j].polygon))return invalid('Physical buildings and rooms cannot overlap');
  }
  if(Buffer.byteLength(JSON.stringify(plan),'utf8')>800000)return invalid('Farm plan is too large');
  return {valid:true,plan,areaIds:[...areaIds]};
}


/** v2 stores authored Areas directly. Shape and business entity share one ID. */
function validateAreaPlan(input){
  const invalid=message=>({valid:false,message});
  const dimensions={widthM:input.dimensions?.widthM,lengthM:input.dimensions?.lengthM};
  if(!Object.values(dimensions).every(n=>finite(n) && n>=1 && n<=10000))return invalid('Farm dimensions must be between 1 and 10000 metres');
  if(typeof input.name!=='string' || input.name.length>120)return invalid('Farm name must be at most 120 characters');
  if(!Array.isArray(input.areas) || input.areas.length>80)return invalid('A farm plan supports up to 80 Areas');
  const plan={version:2,name:input.name.trim(),dimensions,areas:[]},ids=new Set();
  for(const raw of input.areas){
    if(!raw || typeof raw.id!=='string' || !raw.id.trim() || raw.id.length>100 || ids.has(raw.id))return invalid('Each Area needs a unique id');
    if(typeof raw.name!=='string' || !raw.name.trim() || raw.name.length>120)return invalid('Each Area needs a name of up to 120 characters');
    if(!['greenhouse','room','zone'].includes(raw.kind))return invalid('Unknown Area type');
    if(!finite(raw.height) || raw.height<.5 || raw.height>12)return invalid('Area height must be between 0.5 and 12 metres');
    const error=polygonError(raw.polygon,dimensions);if(error)return invalid(error);
    ids.add(raw.id);plan.areas.push({id:raw.id,name:raw.name.trim(),kind:raw.kind,height:raw.height,polygon:raw.polygon.map(({xM,yM})=>({xM,yM}))});
  }
  for(let i=0;i<plan.areas.length;i++)for(let j=i+1;j<plan.areas.length;j++){
    const a=plan.areas[i],b=plan.areas[j];
    if(a.kind!=='zone' && b.kind!=='zone' && overlap(a.polygon,b.polygon))return invalid('Physical Areas cannot overlap');
  }
  if(Buffer.byteLength(JSON.stringify(plan),'utf8')>800000)return invalid('Farm plan is too large');
  return {valid:true,plan,areaIds:[...ids],createsAreas:true};
}
