import { useState, type FormEvent } from 'react'
import type { Block, Location } from '../types'

type Props = {
  locations: Location[]
  blocks: Block[]
  onAdd: (name: string) => void
  onUpdate: (id: string, name: string) => void
  onDelete: (id: string, moveToLocationId: string) => void
}

export function LocationsPage({ locations, blocks, onAdd, onUpdate, onDelete }: Props) {
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<Location | null>(null)
  const [editName, setEditName] = useState('')
  const [leaveUnassigned, setLeaveUnassigned] = useState(false)
  const [moveTo, setMoveTo] = useState('')

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) return
    onAdd(name.trim())
    setName('')
  }

  function openEdit(location: Location) {
    setEditing(location)
    setEditName(location.name)
    setLeaveUnassigned(false)
    setMoveTo(locations.find((item) => item.id !== location.id)?.id || '')
  }

  const affectedBlocks = editing ? blocks.filter((block) => block.locationId === editing.id).length : 0

  return <>
    <header className="page-head"><div><p className="eyebrow">Structure</p><h1>Areas</h1><p>Greenhouses and other top-level growing spaces.</p></div></header>
    <form className="create-bar" onSubmit={submit}><label>Register area<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Greenhouse No. 3" /></label><button className="primary-button">Add area</button></form>
    <section className="list-shell"><div className="list-head"><h2>Current areas</h2><span>{locations.length} areas</span></div>{locations.map((item) => <article className="list-row" key={item.id}><div><strong>{item.name}</strong><p>{blocks.filter((block) => block.locationId === item.id).length} sections</p></div><div className="row-actions"><span className="status-chip">Active</span><button className="edit-button" onClick={() => openEdit(item)}>Edit</button></div></article>)}</section>

    {editing && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditing(null) }}><section className="edit-modal"><div className="modal-head"><div><p className="eyebrow">Edit area</p><h2>{editing.name}</h2></div><button onClick={() => setEditing(null)}>×</button></div><label>Area name<input value={editName} onChange={(event) => setEditName(event.target.value)} /></label><div className="modal-actions"><button className="primary-button" onClick={() => { if (editName.trim()) onUpdate(editing.id, editName.trim()); setEditing(null) }}>Save changes</button></div><div className="danger-zone"><strong>Delete area</strong>{affectedBlocks > 0 && <><p>{affectedBlocks} sections must be moved or left unassigned.</p><label className="check-row"><input type="checkbox" checked={leaveUnassigned} onChange={(event) => setLeaveUnassigned(event.target.checked)} />Leave sections unassigned</label><label>Move sections to<select disabled={leaveUnassigned} value={moveTo} onChange={(event) => setMoveTo(event.target.value)}>{locations.filter((item) => item.id !== editing.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></>}<button className="danger-button" onClick={() => { onDelete(editing.id, leaveUnassigned ? '' : moveTo); setEditing(null) }}>Delete area</button></div></section></div>}
  </>
}
