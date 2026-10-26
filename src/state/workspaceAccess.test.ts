import { describe, expect, it } from 'vitest'
import {
  canAccessWorkspaceRoute,
  deriveWorkspaceStage,
  workspaceStageRedirect,
} from './workspaceAccess'

describe('workspace onboarding access', () => {
  it('starts a new account at Farm plan even when unrelated old Areas exist',()=>{
    expect(deriveWorkspaceStage({areas:[{id:'old'}]},{sections:[{area_id:'old'}]},{revision:0,plan:{version:2,areas:[]}})).toBe('needs-plan')
    expect(workspaceStageRedirect('needs-plan')).toBe('/farm-plan')
    expect(canAccessWorkspaceRoute('needs-plan','/farm-plan')).toBe(true)
    expect(canAccessWorkspaceRoute('needs-plan','/sections')).toBe(false)
  })
  it('unlocks Sections only after an Area is saved in the farm, and monitoring after its Section exists',()=>{
    expect(deriveWorkspaceStage({}, {},{revision:1,plan:{version:2,areas:[]}})).toBe('needs-area')
    const farm={revision:1,plan:{version:2,areas:[{id:'drawn'}]}}
    expect(deriveWorkspaceStage({}, {sections:[{area_id:'old'}]},farm)).toBe('needs-section')
    expect(deriveWorkspaceStage({}, {sections:[{area_id:'drawn'}]},farm)).toBe('ready')
  })
  it('requires an Area before a Section and a Section before the full workspace', () => {
    expect(deriveWorkspaceStage({ areas: [] }, { sections: [] })).toBe('needs-area')
    expect(deriveWorkspaceStage({ areas: [{ id: 'area-1' }] }, { sections: [] })).toBe('needs-section')
    expect(deriveWorkspaceStage({ areas: [{ id: 'area-1' }] }, { sections: [{ id: 'section-1' }] })).toBe('ready')
  })

  it('allows the farm editor before Areas are created while keeping monitoring locked', () => {
    expect(canAccessWorkspaceRoute('needs-area', '/farm-plan')).toBe(true)
    expect(canAccessWorkspaceRoute('needs-area', '/areas')).toBe(true)
    expect(canAccessWorkspaceRoute('needs-area', '/settings')).toBe(true)
    for (const route of ['/', '/sections', '/nodes', '/readings', '/area-map', '/organization']) {
      expect(canAccessWorkspaceRoute('needs-area', route)).toBe(false)
    }
    expect(workspaceStageRedirect('needs-area')).toBe('/farm-plan')
  })

  it('adds Sections after the first Area and unlocks everything after the first Section', () => {
    expect(canAccessWorkspaceRoute('needs-section', '/farm-plan')).toBe(true)
    expect(canAccessWorkspaceRoute('needs-section', '/areas')).toBe(true)
    expect(canAccessWorkspaceRoute('needs-section', '/sections')).toBe(true)
    expect(canAccessWorkspaceRoute('needs-section', '/settings')).toBe(true)
    expect(canAccessWorkspaceRoute('needs-section', '/nodes')).toBe(false)
    expect(canAccessWorkspaceRoute('needs-section', '/area-map')).toBe(false)
    expect(workspaceStageRedirect('needs-section')).toBe('/farm-plan')
    expect(canAccessWorkspaceRoute('ready', '/nodes/0000000000000001')).toBe(true)
    expect(canAccessWorkspaceRoute('ready', '/area-map')).toBe(true)
  })
})
