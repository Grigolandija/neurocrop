import { describe, expect, it } from 'vitest'
import { pointInPolygon } from '../greenhouse-map/heatmap/rasterInterpolation'
import { cameraMatrix, planToScene, project } from './sceneMath'
import { siteGeometry, siteVolume } from './siteDemoGeometry'
import { interpolateSite, pickSitePoint, segmentInsideZone, SITE_SIZE, siteBuildings, siteZones, zoneArea, zoneSources } from './siteDemoModel'

describe('multi-building site demonstration', () => {
  it('has two greenhouses and a building partitioned into three non-overlapping rooms', () => {
    expect(siteBuildings).toHaveLength(3)
    expect(siteZones.filter(z=>z.kind==='greenhouse')).toHaveLength(2)
    const rooms=siteZones.filter(z=>z.kind==='room')
    expect(rooms).toHaveLength(3)
    expect(rooms.reduce((sum,zone)=>sum+zoneArea(zone),0)).toBe(14*22)
    for(let y=6.25;y<28;y+=.5)for(let x=31.25;x<45;x+=.5)expect(rooms.filter(z=>pointInPolygon({xM:x,yM:y},z.polygon))).toHaveLength(1)
  })

  it('keeps all 19 sensors inside their own zones at explicitly different heights', () => {
    expect(siteZones.flatMap(z=>z.sensors)).toHaveLength(19)
    for(const zone of siteZones)for(const sensor of zone.sensors){
      expect(pointInPolygon(sensor,zone.polygon)).toBe(true)
      expect(sensor.height).toBeGreaterThan(0)
      expect(sensor.height).toBeLessThan(zone.height)
      expect(interpolateSite(zone.sensors,sensor.xM,sensor.yM,sensor.height,'temperature')).toBe(sensor.temperature)
    }
  })

  it('does not take a shortcut through the L room’s missing corner', () => {
    const zone=siteZones.find(z=>z.id==='room-l')!
    expect(segmentInsideZone({xM:34,yM:25},{xM:42,yM:10},zone.polygon)).toBe(false)
    expect(segmentInsideZone({xM:34,yM:25},{xM:33,yM:9},zone.polygon)).toBe(true)
    const sources=zoneSources(zone,{xM:34,yM:25})
    expect(sources.map(s=>s.id)).not.toContain('DEMO-011')
    expect(sources.length).toBeGreaterThan(1)
    expect(zoneSources(zone,{xM:41,yM:18})).toEqual([])
  })

  it('fills both arms of the L volume and leaves the other rooms, outdoors and above the ceiling empty', () => {
    const zone=siteZones.find(z=>z.id==='room-l')!, field=siteVolume(zone,'temperature')
    const alpha=(x:number,y:number,height:number)=>{
      const ix=Math.floor(x/SITE_SIZE.widthM*field.width), iz=Math.floor(y/SITE_SIZE.lengthM*field.height), iy=Math.floor(height/SITE_SIZE.heightM*field.layers)
      return field.pixels[((iy*field.height+iz)*field.width+ix)*4+3]
    }
    expect(alpha(34,24,1.5)).toBe(255)
    expect(alpha(42,10,2)).toBe(255)
    expect(alpha(41,18,1.5)).toBe(0)
    expect(alpha(41,25,1.5)).toBe(0)
    expect(alpha(20,10,1.5)).toBe(0)
    expect(alpha(34,24,4.5)).toBe(0)
    expect(field.pixels.every(Number.isFinite)).toBe(true)
  })

  it('picks the same plan position after camera orbit and zoom', () => {
    for(const eye of [[55,60,55],[-50,65,40],[20,25,-40]] as [number,number,number][]){
      const matrix=cameraMatrix(eye,[0,1,0],1.6)
      const p=project(planToScene(34,24,.04,SITE_SIZE),matrix,1200,750)
      const picked=pickSitePoint(p.x,p.y,1200,750,matrix)!
      expect(picked.xM).toBeCloseTo(34,2)
      expect(picked.yM).toBeCloseTo(24,2)
    }
  })

  it('generates finite geometry for every zone and parameter', () => {
    for(const selected of [null,...siteZones.map(z=>z.id)]){
      const geometry=siteGeometry(selected,'temperature')
      expect(geometry.length).toBeGreaterThan(1000)
      expect(geometry.length%18).toBe(0)
      expect(geometry.every(Number.isFinite)).toBe(true)
    }
    const zone=siteZones[0]
    expect(siteVolume(zone,'humidity').pixels).not.toEqual(siteVolume(zone,'co2').pixels)
  })
})
