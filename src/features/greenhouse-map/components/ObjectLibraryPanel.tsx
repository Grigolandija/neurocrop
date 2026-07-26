import { useState } from 'react'
import { OBJECT_LIBRARY, type ObjectType } from '../model'

export const ltObjectLabels: Partial<Record<ObjectType, string>> = {
  'sensor-node': 'Jutiklio node', 'growing-table': 'Auginimo stalas', 'hydroponic-channel': 'Hidroponikos kanalas',
  'growing-bed': 'Lysvė', rack: 'Lentyna', reservoir: 'Rezervuaras', 'irrigation-unit': 'Laistymo įrenginys',
  fan: 'Ventiliatorius', heater: 'Šildytuvas', 'cooling-unit': 'Vėsinimo įrenginys', lamp: 'Lempa',
  door: 'Durys', window: 'Langas', 'ventilation-opening': 'Vėdinimo anga', 'electrical-cabinet': 'Elektros skydas',
  'technical-zone': 'Techninė zona', walkway: 'Takas', partition: 'Pertvara', 'text-label': 'Teksto etiketė', rectangle: 'Stačiakampis',
}

export default function ObjectLibraryPanel({ language = 'en', onAdd }: { language?: 'en' | 'lt'; onAdd: (type: ObjectType) => void }) {
  const [query, setQuery] = useState('')
  const entries = OBJECT_LIBRARY.filter((entry) => `${entry.label} ${ltObjectLabels[entry.type] || ''}`.toLowerCase().includes(query.toLowerCase()))
  return <section className="gh-panel-section gh-library">
    <header><div><small>{language === 'lt' ? 'PRIDĖTI Į PLANĄ' : 'ADD TO PLAN'}</small><h2>{language === 'lt' ? 'Objektų biblioteka' : 'Object library'}</h2></div><span>{entries.length}</span></header>
    <label className="gh-search"><i className="fa-solid fa-magnifying-glass" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={language === 'lt' ? 'Rasti objektą…' : 'Find an object…'} /></label>
    <div className="gh-library-grid">
      {entries.map((entry) => <button
        key={entry.type}
        draggable
        onDragStart={(event) => { event.dataTransfer.setData('application/x-neurocrop-object', entry.type); event.dataTransfer.effectAllowed = 'copy' }}
        onClick={() => onAdd(entry.type)}
        title={language === 'lt' ? 'Spustelėkite, kad pridėtumėte, arba nutempkite į planą' : 'Click to add, or drag onto the plan'}
      ><i className={`fa-solid ${entry.icon}`} /><span>{language === 'lt' ? ltObjectLabels[entry.type] || entry.label : entry.label}</span><b>+</b></button>)}
    </div>
  </section>
}
