import { useState } from 'react'
import { OBJECT_LIBRARY, type ObjectType } from '../model'
import { ltObjectLabels } from './objectLabels'
import './object-library-panel.css'

const advancedTypes = new Set<ObjectType>([
  'irrigation-unit', 'filter-unit', 'dehumidifier', 'heater', 'cooling-unit', 'electrical-cabinet',
  'technical-zone', 'walkway', 'partition', 'text-label', 'rectangle',
])

const frequentTypes = new Set<ObjectType>(['growing-table', 'rack', 'lamp', 'fan', 'door', 'window', 'ibc-tank', 'water-tank'])
const categories = ['common', 'all', 'cultivation', 'irrigation', 'climate', 'structure', 'other'] as const
type Category = typeof categories[number]

export default function ObjectLibraryPanel({ language = 'en', allowDraftNode = false, compact = false, onAdd }: { language?: 'en' | 'lt'; allowDraftNode?: boolean; compact?: boolean; onAdd: (type: ObjectType) => void }) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<Category>('common')
  const lt = language === 'lt'
  const categoryLabels: Record<Category, string> = {
    common: lt ? 'Dažniausi' : 'Frequently used',
    all: lt ? 'Visi objektai' : 'All objects',
    cultivation: lt ? 'Auginimas' : 'Growing',
    irrigation: lt ? 'Vanduo ir laistymas' : 'Water & irrigation',
    climate: lt ? 'Klimatas ir šviesa' : 'Climate & lighting',
    structure: lt ? 'Patalpos elementai' : 'Room elements',
    other: lt ? 'Kiti objektai' : 'Other objects',
  }
  const available = OBJECT_LIBRARY.filter((entry) => allowDraftNode || entry.type !== 'sensor-node')
  const matchesCategory = (entry: (typeof OBJECT_LIBRARY)[number]) => category === 'all'
    || (category === 'common' ? frequentTypes.has(entry.type)
      : category === 'other' ? ['labels', 'sensors'].includes(entry.layerId) || entry.type === 'rectangle'
        : category === 'climate' ? ['climate', 'lighting'].includes(entry.layerId)
          : entry.layerId === category && entry.type !== 'rectangle')
  const entries = available.filter((entry) => (!compact || matchesCategory(entry)) && `${entry.label} ${ltObjectLabels[entry.type] || ''}`.toLowerCase().includes(query.trim().toLowerCase()))
  const commonEntries = compact || query ? entries : entries.filter((entry) => !advancedTypes.has(entry.type))
  const advancedEntries = compact || query ? [] : entries.filter((entry) => advancedTypes.has(entry.type))
  const renderEntry = (entry: (typeof OBJECT_LIBRARY)[number]) => <button
    key={entry.type}
    type="button"
    draggable
    onDragStart={(event) => { event.dataTransfer.setData('application/x-neurocrop-object', entry.type); event.dataTransfer.effectAllowed = 'copy' }}
    onClick={() => onAdd(entry.type)}
    title={`${lt ? ltObjectLabels[entry.type] || entry.label : entry.label} · ${lt ? 'Spustelėkite arba nutempkite į planą' : 'Click to add, or drag onto the plan'}`}
  ><i className={`fa-solid ${entry.icon}`} aria-hidden="true" /><span>{language === 'lt' ? ltObjectLabels[entry.type] || entry.label : entry.label}</span><b aria-hidden="true">+</b></button>
  const search = <label className="gh-library-search">{!compact && <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />}<input type="search" aria-label={lt ? 'Rasti objektą visoje bibliotekoje' : 'Find an object in the library'} value={query} onChange={(event) => { setQuery(event.target.value); if (compact && event.target.value.trim()) setCategory('all') }} placeholder={lt ? 'Rasti objektą…' : 'Find an object…'} /></label>
  return <section className="gh-panel-section gh-library" data-compact={compact}>
    <header><div><small>{language === 'lt' ? 'PRIDĖTI Į PLANĄ' : 'ADD TO PLAN'}</small><h2>{language === 'lt' ? 'Objektai' : 'Objects'}</h2></div><span>{entries.length}</span></header>
    {compact ? <div className="gh-library-toolbar">{search}<select aria-label={lt ? 'Objektų kategorija' : 'Object category'} value={category} onChange={event => { setCategory(event.target.value as Category); setQuery('') }}>{categories.map(item => <option key={item} value={item}>{categoryLabels[item]}</option>)}</select><span className="gh-library-count" role="status">{entries.length} {lt ? 'obj.' : 'objects'}</span></div> : search}
    <div className="gh-library-grid" key={compact ? `${category}-${query}` : 'objects'} role="group" aria-label={lt ? 'Pridėti objektą' : 'Add an object'}>{commonEntries.map(renderEntry)}</div>
    {advancedEntries.length ? <details className="gh-library-more"><summary>{language === 'lt' ? 'Daugiau objektų' : 'More objects'} <span>{advancedEntries.length}</span></summary><div className="gh-library-grid">{advancedEntries.map(renderEntry)}</div></details> : null}
    {!entries.length ? <p className="gh-library-empty">{language === 'lt' ? 'Objektų nerasta.' : 'No objects found.'}</p> : null}
  </section>
}
