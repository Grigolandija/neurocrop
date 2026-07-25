import { useState } from 'react'
import { OBJECT_LIBRARY, type ObjectType } from '../model'

export default function ObjectLibraryPanel({ onAdd }: { onAdd: (type: ObjectType) => void }) {
  const [query, setQuery] = useState('')
  const entries = OBJECT_LIBRARY.filter((entry) => entry.label.toLowerCase().includes(query.toLowerCase()))
  return <section className="gh-panel-section gh-library">
    <header><div><small>ADD TO PLAN</small><h2>Object library</h2></div><span>{entries.length}</span></header>
    <label className="gh-search"><i className="fa-solid fa-magnifying-glass" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find an object…" /></label>
    <div className="gh-library-grid">
      {entries.map((entry) => <button
        key={entry.type}
        draggable
        onDragStart={(event) => { event.dataTransfer.setData('application/x-neurocrop-object', entry.type); event.dataTransfer.effectAllowed = 'copy' }}
        onClick={() => onAdd(entry.type)}
        title="Click to add, or drag onto the plan"
      ><i className={`fa-solid ${entry.icon}`} /><span>{entry.label}</span><b>+</b></button>)}
    </div>
  </section>
}
