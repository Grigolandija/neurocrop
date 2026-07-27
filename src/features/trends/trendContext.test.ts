import { describe, expect, it } from 'vitest'
import { resolveTrendContext } from './resolveTrendContext'

const sections = [
  { id: 'section-greenhouse-2', areaId: 'greenhouse-2' },
  { id: 'section-greenhouse-1-a', areaId: 'greenhouse-1' },
  { id: 'section-greenhouse-1-b', areaId: 'greenhouse-1' },
]

describe('trend workspace context', () => {
  it('moves a stale hidden-workspace Section together with a newly selected Area', () => {
    expect(resolveTrendContext(
      sections,
      'greenhouse-2',
      'section-greenhouse-2',
      'greenhouse-1',
      '',
    )).toEqual({
      areaId: 'greenhouse-1',
      sectionId: 'section-greenhouse-1-a',
    })
  })

  it('honours an explicitly requested Section and its Area', () => {
    expect(resolveTrendContext(
      sections,
      'greenhouse-2',
      'section-greenhouse-2',
      'greenhouse-1',
      'section-greenhouse-1-b',
    )).toEqual({
      areaId: 'greenhouse-1',
      sectionId: 'section-greenhouse-1-b',
    })
  })
})
