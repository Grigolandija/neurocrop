import { useState } from 'react'
import { OBJECT_LIBRARY, type ObjectType } from '../model'
import { ltObjectLabels } from './objectLabels'

const advancedTypes = new Set<ObjectType>([
  'irrigation-unit', 'heater', 'cooling-unit', 'electrical-cabinet',
  'technical-zone', 'walkway', 'partition', 'text-label', 'rectangle',
])

export default function ObjectLibraryPanel({ language = 'en', allowDraftNode = false, onAdd }: { language?: 'en' | 'lt'; allowDraftNode?: boolean; onAdd: (type: ObjectType) => void }) {
  const [query, setQuery] = useState('')
  const available = OBJECT_LIBRARY.filter((entry) => allowDraftNode || entry.type !== 'sensor-node')
  const entries = available.filter((entry) => `${entry.label} ${ltObjectLabels[entry.type] || ''}`.toLowerCase().includes(query.toLowerCase()))
  const commonEntries = query ? entries : entries.filter((entry) => !advancedTypes.has(entry.type))
  const advancedEntries = query ? [] : entries.filter((entry) => advancedTypes.has(entry.type))
  const renderEntry = (entry: (typeof OBJECT_LIBRARY)[number]) => <button
    key={entry.type}
    draggable
    onDragStart={(event) => { event.dataTransfer.setData('application/x-neurocrop-object', entry.type); event.dataTransfer.effectAllowed = 'copy' }}
    onClick={() => onAdd(entry.type)}
    title={language === 'lt' ? 'Spustelėkite, kad pridėtumėte, arba nutempkite į planą' : 'Click to add, or drag onto the plan'}
  ><i className={`fa-solid ${entry.icon}`} /><span>{language === 'lt' ? ltObjectLabels[entry.type] || entry.label : entry.label}</span><b>+</b></button>
  return <section className="gh-panel-section gh-library">
    <header><div><small>{language === 'lt' ? 'PRIDĖTI Į PLANĄ' : 'ADD TO PLAN'}</small><h2>{language === 'lt' ? 'Objektai' : 'Objects'}</h2></div><span>{entries.length}</span></header>
    <label className="gh-search"><i className="fa-solid fa-magnifying-glass" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={language === 'lt' ? 'Rasti objektą…' : 'Find an object…'} /></label>
    <div className="gh-library-grid">{commonEntries.map(renderEntry)}</div>
    {advancedEntries.length ? <details className="gh-library-more"><summary>{language === 'lt' ? 'Daugiau objektų' : 'More objects'} <span>{advancedEntries.length}</span></summary><div className="gh-library-grid">{advancedEntries.map(renderEntry)}</div></details> : null}
    {!entries.length ? <p className="gh-library-empty">{language === 'lt' ? 'Objektų nerasta.' : 'No objects found.'}</p> : null}
  </section>
}
