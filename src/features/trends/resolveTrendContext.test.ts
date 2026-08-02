import { describe, expect, it } from 'vitest'
import { resolveTrendContext } from './resolveTrendContext'

const sections = [
  { id: 'section-a-1', areaId: 'area-a' },
  { id: 'section-b-1', areaId: 'area-b' },
  { id: 'section-b-2', areaId: 'area-b' },
]

describe('resolveTrendContext', () => {
  it('moves to the first Section when a different Area is selected', () => {
    expect(resolveTrendContext(sections, 'area-a', 'section-a-1', 'area-b', '')).toEqual({
      areaId: 'area-b',
      sectionId: 'section-b-1',
    })
  })

  it('keeps a Section that belongs to the requested Area', () => {
    expect(resolveTrendContext(sections, 'area-a', 'section-a-1', 'area-b', 'section-b-2')).toEqual({
      areaId: 'area-b',
      sectionId: 'section-b-2',
    })
  })
})
