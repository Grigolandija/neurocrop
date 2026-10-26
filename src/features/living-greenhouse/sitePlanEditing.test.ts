import { afterEach, describe, expect, it, vi } from 'vitest'
import { pointInPolygon } from '../greenhouse-map/heatmap/rasterInterpolation'
import { siteGeometry, siteVolume } from './siteDemoGeometry'
import { createSitePlan, rectangle, zoneArea, zoneSources, type SitePlan, type SitePoint } from './siteDemoModel'
import { addSiteEntity, containsPolygon, deleteSiteEntity, editSitePolygon, insideLabel, loadSitePlan, moveSiteEntity, normalizeSitePlan, polygonError, SITE_PLAN_KEY, triangulateSitePolygon, validateSitePlan } from './sitePlanEditing'

const empty=():SitePlan=>({version:1,buildings:[],rooms:[],zones:[]})
const concave:SitePoint[]=[{xM:2,yM:2},{xM:15,yM:2},{xM:15,yM:7},{xM:8,yM:7},{xM:8,yM:15},{xM:2,yM:15}]
afterEach(()=>vi.unstubAllGlobals())

describe('editable site plan',()=>{
  it('keeps the original sample valid and separate from its mutable copy',()=>{
    const plan=createSitePlan()
    expect(validateSitePlan(plan)).toBeNull()
    plan.buildings[0].polygon[0].xM=0
    expect(createSitePlan().buildings[0].polygon[0].xM).toBe(4)
  })

  it('creates a building, a concave room and an independent smaller zone from an empty plan',()=>{
    let plan=addSiteEntity(empty(),'buildings',rectangle(1,1,20,20)).plan
    const room=addSiteEntity(plan,'rooms',concave)
    expect(room.error).toBeNull();plan=room.plan
    const zone=addSiteEntity(plan,'zones',rectangle(3,3,3,3))
    expect(zone.error).toBeNull()
    expect(zone.plan.zones[0].roomId).toBe(room.id)
    expect(zone.plan.rooms[0].polygon).toEqual(concave)
    expect(zone.plan.zones[0].polygon).not.toEqual(concave)
    expect(zone.plan.zones[0].sensors.length).toBeGreaterThanOrEqual(3)
    expect(validateSitePlan(zone.plan)).toBeNull()
    expect(siteGeometry(zone.id,'temperature',zone.plan).every(Number.isFinite)).toBe(true)
    expect(siteVolume(zone.plan.zones[0],'temperature',zone.plan).pixels.some((v,i)=>i%4===3 && v===255)).toBe(true)
  })

  it('triangulates L, U and diagonal outlines in either direction without filling missing corners',()=>{
    const outlines=[concave,[{xM:1,yM:1},{xM:12,yM:1},{xM:12,yM:12},{xM:9,yM:12},{xM:9,yM:4},{xM:4,yM:4},{xM:4,yM:12},{xM:1,yM:12}], [{xM:1,yM:1},{xM:12,yM:2},{xM:8,yM:7},{xM:12,yM:12},{xM:2,yM:11}]]
    for(const outline of outlines)for(const polygon of [outline,outline.toReversed()]){
      expect(polygonError(polygon)).toBeNull()
      const triangles=triangulateSitePolygon(polygon)
      expect(triangles.reduce((sum,triangle)=>sum+zoneArea({polygon:triangle}),0)).toBeCloseTo(zoneArea({polygon}))
      expect(triangles.every(triangle=>containsPolygon(polygon,triangle))).toBe(true)
      expect(pointInPolygon(insideLabel(polygon),polygon)).toBe(true)
    }
  })

  it('renders an edited non-rectangular greenhouse and clips its volume to the real footprint',()=>{
    const building=addSiteEntity(empty(),'buildings',concave,true)
    const result=addSiteEntity(building.plan,'zones',concave)
    expect(result.error).toBeNull()
    expect(siteGeometry(result.id,'humidity',result.plan).every(Number.isFinite)).toBe(true)
    const field=siteVolume(result.plan.zones[0],'humidity',result.plan)
    const alpha=(x:number,y:number)=>field.pixels[((4*field.height+Math.floor(y/34*field.height))*field.width+Math.floor(x/50*field.width))*4+3]
    expect(alpha(4,10)).toBe(255)
    expect(alpha(12,4)).toBe(255)
    expect(alpha(12,12)).toBe(0)
  })

  it('rejects crossed outlines, overlaps, undersized shapes and contours outside a parent',()=>{
    expect(polygonError([{xM:0,yM:0},{xM:10,yM:10},{xM:0,yM:10},{xM:10,yM:0}])).toContain('kirstis')
    expect(polygonError(rectangle(0,0,.1,.1))).toContain('0,25')
    const plan=createSitePlan()
    expect(addSiteEntity(plan,'buildings',rectangle(5,6,5,5)).error).toContain('persidengti')
    expect(addSiteEntity(plan,'rooms',rectangle(46,2,2,2)).error).toContain('pastatą')
    expect(addSiteEntity(plan,'rooms',rectangle(39,15,4,4)).error).toContain('persidengti')
    expect(containsPolygon(concave,rectangle(5,5,7,7))).toBe(false)
  })

  it('moves an entire building together with its rooms, zones and sensor positions',()=>{
    const before=createSitePlan(), result=moveSiteEntity(before,{layer:'buildings',id:'building'},-2,-2)
    expect(result.error).toBeNull()
    expect(result.plan.rooms[0].polygon[0].xM).toBe(before.rooms[0].polygon[0].xM-2)
    expect(result.plan.zones[2].sensors[0].yM).toBe(before.zones[2].sensors[0].yM-2)
    expect(before.rooms[0].polygon[0].xM).toBe(31)
  })

  it('moves a shared wall vertex and keeps junctions, adjoining rooms and full-room zones connected',()=>{
    const plan=createSitePlan(),room=plan.rooms.find(r=>r.id==='room-2')!
    const polygon=room.polygon.map((p,i)=>i===0 ? {xM:37,yM:15} : p)
    const result=editSitePolygon(plan,{layer:'rooms',id:room.id},polygon,0)
    expect(result.error).toBeNull()
    expect(validateSitePlan(result.plan)).toBeNull()
    const l=result.plan.rooms.find(r=>r.id==='room-l')!
    expect(l.polygon).toContainEqual({xM:37,yM:15})
    expect(l.polygon).toContainEqual({xM:38,yM:21})
    expect(result.plan.zones.find(z=>z.id==='room-l')!.polygon).toEqual(l.polygon)
    expect(result.plan.rooms.reduce((sum,r)=>sum+zoneArea(r),0)).toBeCloseTo(14*22)
  })

  it('updates sensors only when needed and never confuses an administrative boundary with a wall',()=>{
    const plan=createSitePlan()
    const zone=plan.zones[0]
    // A concave zone is inside one open greenhouse, with no physical partition.
    zone.polygon=[{xM:4,yM:5},{xM:24,yM:5},{xM:24,yM:9},{xM:12,yM:9},{xM:12,yM:14},{xM:4,yM:14}]
    const normalized=normalizeSitePlan(plan),newZone=normalized.zones[0]
    expect(newZone.sensors.every(s=>pointInPolygon(s,newZone.polygon))).toBe(true)
    expect(newZone.sensors[0].temperature).toBe(zone.sensors[0].temperature)
    expect(zoneSources(newZone,{xM:7,yM:12},normalized.rooms,normalized.buildings)).toHaveLength(newZone.sensors.length)
    const l=normalized.zones.find(z=>z.id==='room-l')!
    expect(zoneSources(l,{xM:34,yM:25},normalized.rooms,normalized.buildings).map(s=>s.id)).not.toContain('DEMO-011')
  })

  it('derives physical height changes in the volume and removes descendants reversibly',()=>{
    const plan=createSitePlan();plan.buildings[0].height=8
    const normalized=normalizeSitePlan(plan)
    expect(normalized.zones[0].height).toBe(8)
    expect(siteVolume(normalized.zones[0],'temperature',normalized).bounds[2]).toBe(8)
    const removed=deleteSiteEntity(normalized,{layer:'buildings',id:'building'})
    expect(removed.rooms).toHaveLength(0)
    expect(removed.zones).toHaveLength(2)
    expect(normalized.rooms).toHaveLength(3)
  })

  it('restores a locally saved plan and falls back safely for malformed data',()=>{
    let raw=JSON.stringify(createSitePlan())
    vi.stubGlobal('localStorage',{getItem:(key:string)=>key===SITE_PLAN_KEY ? raw : null})
    expect(loadSitePlan().buildings).toHaveLength(3)
    raw=JSON.stringify(empty())
    expect(loadSitePlan().buildings).toHaveLength(0)
    raw='{invalid'
    expect(loadSitePlan().buildings).toHaveLength(3)
    raw=JSON.stringify({version:1,buildings:[],rooms:[],zones:[{id:'bad'}]})
    expect(loadSitePlan().buildings).toHaveLength(3)
  })
})
