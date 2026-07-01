import { useState, type FormEvent } from 'react'
import type { Block, Location } from '../types'

const profiles = ['Tomatoes, vegetative', 'Lettuce, leaf growth', 'Strawberries, fruiting', 'No crop profile assigned']

type Props = {
  locations: Location[]
  blocks: Block[]
  onAdd: (locationId: string, name: string) => void
  onUpdate: (id: string, patch: { name: string; locationId: string; cropProfile: string }) => void
  onDelete: (id: string) => void
}

export function BlocksPage({ locations, blocks, onAdd, onUpdate, onDelete }: Props) {
  const [locationId, setLocationId] = useState(locations[0]?.id || '')
  const [name, setName] = useState('')
  const [filter, setFilter] = useState('all')
  const [editing, setEditing] = useState<Block | null>(null)
  const [draft, setDraft] = useState({ name: '', locationId: '', cropProfile: '' })
  const visibleBlocks = filter === 'all' ? blocks : blocks.filter((block) => block.locationId === filter)

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) return
    onAdd(locationId, name.trim())
    setName('')
  }

  function openEdit(block: Block) {
    setEditing(block)
    setDraft({ name: block.name, locationId: block.locationId, cropProfile: block.cropProfile })
  }

  return <>
    <header className="page-head"><div><p className="eyebrow">Structure</p><h1>Sections</h1><p>Monitored growing spaces inside each Area.</p></div><label className="list-filter">Filter current list<select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All areas</option><option value="">Unassigned</option>{locations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></header>
    <form className="create-bar columns" onSubmit={submit}><label>Area<select value={locationId} onChange={(event) => setLocationId(event.target.value)}>{locations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Register section<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Tomato Section B" /></label><button className="primary-button">Add section</button></form>
    <section className="list-shell"><div className="list-head"><h2>Current sections</h2><span>{visibleBlocks.length} sections</span></div>{visibleBlocks.map((block) => <article className="list-row" key={block.id}><div><strong>{block.name}</strong><p>{locations.find((item) => item.id === block.locationId)?.name || 'Unassigned'} · {block.cropProfile}</p></div><div className="row-actions"><span className="status-chip">{block.nodes.length} nodes</span><button className="edit-button" onClick={() => openEdit(block)}>Edit</button></div></article>)}</section>

    {editing && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditing(null) }}><section className="edit-modal"><div className="modal-head"><div><p className="eyebrow">Edit section</p><h2>{editing.name}</h2></div><button onClick={() => setEditing(null)}>×</button></div><label>Section name<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label><label>Area<select value={draft.locationId} onChange={(event) => setDraft({ ...draft, locationId: event.target.value })}><option value="">Unassigned</option>{locations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Crop profile<select value={draft.cropProfile} onChange={(event) => setDraft({ ...draft, cropProfile: event.target.value })}>{profiles.map((item) => <option key={item}>{item}</option>)}</select></label><div className="modal-actions"><button className="primary-button" onClick={() => { if (draft.name.trim()) onUpdate(editing.id, { ...draft, name: draft.name.trim() }); setEditing(null) }}>Save changes</button></div><div className="danger-zone"><strong>Delete section</strong><p>{editing.nodes.length} assigned nodes will also be removed from this demo workspace.</p><button className="danger-button" onClick={() => { onDelete(editing.id); setEditing(null) }}>Delete section</button></div></section></div>}
  </>
}
