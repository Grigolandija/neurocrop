import { describe,expect,it } from 'vitest'
import { nodeHeightCentimetres,refreshFarmNodeMetadata,unassignedFarmNodes } from './farmNodes'
import { farmEditorMap,newFarmObject,layoutSignature } from './farmLayoutData'
import { emptyFarmPlan,type FarmPlanDocument } from './farmPlanData'

const plan:FarmPlanDocument={...emptyFarmPlan(),name:'Farm',areas:[{id:'a',name:'Room',kind:'room',height:3,polygon:[{xM:0,yM:0},{xM:8,yM:0},{xM:8,yM:5},{xM:0,yM:5}]}]}
const node={devEui:'70b3d57ed006abcd',nodeId:'NSN-000003',sensors:[],status:'online' as const,installationHeightM:1.5,installationConfirmedAt:'2026-10-25T10:00:00Z'}

describe('Farm Node placement context',()=>{
  it('offers only real unassigned hardware and converts its stored centimetres without inventing readings',()=>{
    const nodes=unassignedFarmNodes({nodes:[{devEui:node.devEui.toUpperCase(),name:'NSN-000003',areaId:null,installationHeightCm:150,sensorPresence:{co2:true,light:false}}, {devEui:'70b3d57ed006abce',areaId:'another-area'}, {devEui:'not-hardware'}]})
    expect(nodes).toHaveLength(1)
    expect(nodes[0]).toMatchObject({devEui:node.devEui,installationHeightM:1.5,sensors:['co2']})
    expect(nodes[0].measurements).toBeUndefined()
  })
  it('accepts floor level, exact fractional heights and clearing; rejects elevations beyond the ceiling',()=>{
    expect(nodeHeightCentimetres(0,3)).toBe(0)
    expect(nodeHeightCentimetres(1.537,3)).toBe(153.7)
    expect(nodeHeightCentimetres(null,3)).toBeNull()
    for(const value of [-1,3.01,NaN,Infinity])expect(()=>nodeHeightCentimetres(value,3)).toThrow()
  })
  it('refreshes Node heights through dirty placement and undo snapshots, including a cleared elevation',()=>{
    const map=farmEditorMap(plan,'a',{}),sensor={...newFarmObject('sensor-node',map,undefined,node),xM:2.3,yM:1.2}
    map.objects=[sensor,newFarmObject('growing-table',map)]
    const original=layoutSignature(map)
    const updated=refreshFarmNodeMetadata({a:map},[{...node,installationHeightM:2.1,measurementHeightsM:{'air-temperature':2.1}}]).a
    expect(updated.objects[0]).toMatchObject({xM:2.3,yM:1.2,metadata:{sensor:{installationHeightM:2.1}}})
    expect(updated.objects[1]).toEqual(map.objects[1])
    expect(layoutSignature(updated)).toBe(original)
    const cleared=refreshFarmNodeMetadata({a:updated},[{...node,installationHeightM:undefined,measurementHeightsM:{'air-temperature':null}}]).a
    expect(cleared.objects[0].metadata.sensor?.installationHeightM).toBeUndefined()
    expect(cleared.objects[0].metadata.sensor?.measurementHeightsM?.['air-temperature']).toBeNull()
    expect(map.objects[0].metadata.sensor?.installationHeightM).toBe(1.5)
  })
})
