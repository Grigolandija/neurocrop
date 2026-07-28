import { describe, expect, it } from 'vitest'
import {
  canAccessWorkspaceRoute,
  deriveWorkspaceStage,
  workspaceStageRedirect,
} from './workspaceAccess'

describe('workspace onboarding access', () => {
  it('requires an Area before a Section and a Section before the full workspace', () => {
    expect(deriveWorkspaceStage({ areas: [] }, { sections: [] })).toBe('needs-area')
    expect(deriveWorkspaceStage({ areas: [{ id: 'area-1' }] }, { sections: [] })).toBe('needs-section')
    expect(deriveWorkspaceStage({ areas: [{ id: 'area-1' }] }, { sections: [{ id: 'section-1' }] })).toBe('ready')
  })

  it('allows only Areas and Settings before the first Area exists', () => {
    expect(canAccessWorkspaceRoute('needs-area', '/areas')).toBe(true)
    expect(canAccessWorkspaceRoute('needs-area', '/settings')).toBe(true)
    for (const route of ['/', '/sections', '/nodes', '/readings', '/area-map', '/organization']) {
      expect(canAccessWorkspaceRoute('needs-area', route)).toBe(false)
    }
    expect(workspaceStageRedirect('needs-area')).toBe('/areas')
  })

  it('adds Sections after the first Area and unlocks everything after the first Section', () => {
    expect(canAccessWorkspaceRoute('needs-section', '/areas')).toBe(true)
    expect(canAccessWorkspaceRoute('needs-section', '/sections')).toBe(true)
    expect(canAccessWorkspaceRoute('needs-section', '/settings')).toBe(true)
    expect(canAccessWorkspaceRoute('needs-section', '/nodes')).toBe(false)
    expect(canAccessWorkspaceRoute('needs-section', '/area-map')).toBe(false)
    expect(workspaceStageRedirect('needs-section')).toBe('/sections')
    expect(canAccessWorkspaceRoute('ready', '/nodes/0000000000000001')).toBe(true)
    expect(canAccessWorkspaceRoute('ready', '/area-map')).toBe(true)
  })
})
