import type { Vec3 } from './sceneMath'
import type { createVolumeGrid } from './volumeGrid'

const axes=[[1,0,0],[0,1,0],[0,0,1]] as const

export type ClimateContour = { value: number; normalized: number; anchors: Vec3[] }

/** Fixed, readable value boundaries from the shared time-series scale. */
export function climateContours(grid: ReturnType<typeof createVolumeGrid>, bounds: Vec3, scale: {min:number;max:number}): ClimateContour[] {
  const span=scale.max-scale.min
  if(!(span>0) || !grid.mask.some(Boolean))return []
  const raw=span/10, magnitude=10**Math.floor(Math.log10(raw))
  const step=([1,2,2.5,5,10].find(n=>n>=raw/magnitude) || 10)*magnitude
  const {width,depth,layers,values,mask}=grid
  let minimum=Infinity,maximum=-Infinity
  for(let i=0;i<values.length;i++)if(mask[i]){minimum=Math.min(minimum,values[i]);maximum=Math.max(maximum,values[i])}
  const contours:ClimateContour[]=[]
  for(let value=Math.ceil((scale.min+step*.05)/step)*step;value<scale.max-step*.05;value+=step){
    if(value<=minimum || value>=maximum)continue
    const candidates:{point:Vec3;score:number}[]=[]
    for(let y=0;y<layers;y++)for(let z=0;z<depth;z++)for(let x=0;x<width;x++){
      const i=(y*depth+z)*width+x
      if(!mask[i])continue
      for(const [dx,dy,dz] of axes){
        if(x+dx>=width || y+dy>=layers || z+dz>=depth)continue
        const j=((y+dy)*depth+z+dz)*width+x+dx
        if(!mask[j] || values[i]===values[j] || (values[i]-value)*(values[j]-value)>0)continue
        const t=(value-values[i])/(values[j]-values[i])
        const point:Vec3=[((x+.5+t*dx)/width-.5)*bounds[0],(y+.5+t*dy)/layers*bounds[2],(.5-(z+.5+t*dz)/depth)*bounds[1]]
        // Prefer supported positions away from roof/floor caps. Keep multiple
        // candidates so the projected caption can avoid other captions.
        const score=grid.confidence[i]-.12*Math.abs(point[1]/bounds[2]-.55)
        candidates.push({point,score})
      }
    }
    candidates.sort((a,b)=>b.score-a.score)
    const anchors:Vec3[]=[]
    for(const {point} of candidates){
      if(anchors.every(p=>Math.hypot(...p.map((n,i)=>n-point[i]))>Math.min(...bounds)*.12))anchors.push(point)
      if(anchors.length===24)break
    }
    if(anchors.length)contours.push({value:Number(value.toPrecision(9)),normalized:(value-scale.min)/span,anchors})
  }
  // Show at most two meaningful boundaries. Values come from the fixed scale;
  // choose the ones closest to the current field’s lower/upper thirds.
  if(contours.length<=2)return contours
  const selected=[1/3,2/3].map(t=>contours.reduce((best,c)=>Math.abs(c.value-(minimum+(maximum-minimum)*t))<Math.abs(best.value-(minimum+(maximum-minimum)*t)) ? c : best))
  return contours.filter(c=>selected.includes(c))
}

/** Colors compare lower/higher values in this view; they are not crop risk levels. */
export function contourColor(value:number,contours:ClimateContour[]):[number,number,number] {
  if(!contours.length)return [.55,.63,.57]
  const low=contours[0].value,high=contours[contours.length-1].value
  const t=Math.max(0,Math.min(1,(value-low)/(high-low || .00001)))
  const stops=[[.09,.47,.68],[.84,.87,.82],[.93,.31,.16]]
  const i=t<.5 ? 0 : 1,f=t<.5 ? t*2 : (t-.5)*2
  return stops[i].map((n,j)=>n+(stops[i+1][j]-n)*f) as [number,number,number]
}
