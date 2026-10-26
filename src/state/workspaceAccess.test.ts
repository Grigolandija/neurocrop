import { describe,expect,it } from 'vitest'
import { canAccessWorkspaceRoute,deriveWorkspaceStage,workspaceStageRedirect } from './workspaceAccess'
describe('Area-first onboarding',()=>{
  it('starts at Farm plan even when an unrelated old Area exists',()=>{
    expect(deriveWorkspaceStage({areas:[{id:'old'}]},{sections:[{area_id:'old'}]},{revision:0,plan:{version:2,areas:[]}})).toBe('needs-plan')
    expect(workspaceStageRedirect('needs-plan')).toBe('/farm-plan')
  })
  it('unlocks monitoring and Nodes once an Area is saved, with no user-created groups',()=>{
    const farm={revision:1,plan:{version:2,areas:[{id:'room'}]}}
    expect(deriveWorkspaceStage({},{sections:[]},farm)).toBe('ready')
    expect(deriveWorkspaceStage({areas:[{id:'room'}]},{sections:[]})).toBe('ready')
    for(const route of ['/nodes','/readings','/','/area-map'])expect(canAccessWorkspaceRoute('ready',route)).toBe(true)
  })
  it('still requires an Area in the saved plan',()=>{
    expect(deriveWorkspaceStage({areas:[{id:'old'}]},{sections:[{area_id:'old'}]},{revision:1,plan:{version:2,areas:[]}})).toBe('needs-area')
    expect(deriveWorkspaceStage({areas:[]},{sections:[]})).toBe('needs-area')
    for(const route of ['/','/nodes','/readings'])expect(canAccessWorkspaceRoute('needs-area',route)).toBe(false)
    for(const route of ['/farm-plan','/areas','/settings'])expect(canAccessWorkspaceRoute('needs-area',route)).toBe(true)
  })
})
