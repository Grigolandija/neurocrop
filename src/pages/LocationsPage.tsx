import { useState, type FormEvent } from 'react'
import { areaScore, scoreState } from '../lib/score'
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
  const totalNodes = blocks.flatMap((block) => block.nodes).length
  const alerts = blocks.filter((block) => (areaScore([block]) || 100) < 90).length

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

  return <div className="space-y-6">
    <section className="surface rounded-[30px] p-5 md:p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-3xl"><p className="text-[11px] uppercase tracking-[0.28em] text-pine/56">Register area</p><h2 className="mt-1.5 font-display text-[1.65rem] font-bold leading-tight text-ink">Create area</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-ink/66">Use one area for one greenhouse, room, tunnel, or other larger operating space.</p></div>
        <div className="flex flex-wrap gap-2.5 xl:max-w-[500px] xl:justify-end">
          {[['Areas', locations.length], ['Sections', blocks.length], ['Nodes', totalNodes], ['Active alerts', alerts]].map(([label, value]) => <div className="panel min-w-[112px] rounded-[18px] px-3.5 py-2.5" key={label}><div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-pine/56">{label}</div><div className="mt-0.5 text-xl font-extrabold text-ink">{value}</div></div>)}
        </div>
      </div>
      <form className="mt-4" onSubmit={submit}><div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end"><label className="block"><span className="text-sm font-semibold text-ink/72">Area name</span><input className="mt-1.5 w-full rounded-[18px] border border-black/10 bg-white px-4 py-2.5 text-sm text-ink outline-none transition focus:border-pine/35 focus:ring-2 focus:ring-pine/12" value={name} onChange={(event) => setName(event.target.value)} placeholder="Greenhouse No. 3" /></label><button className="actionable rounded-2xl bg-pine px-4 py-2.5 text-sm font-semibold text-white">Create area</button></div></form>
      <div className="mt-3 rounded-[20px] bg-[#f8f3ea] px-4 py-2.5 text-sm leading-6 text-ink/66">Sections are always created inside a saved area.</div>
    </section>

    <section className="surface rounded-[34px] p-6 md:p-7">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between"><div><p className="text-xs uppercase tracking-[0.24em] text-pine/56">Current areas</p><h3 className="mt-2 font-display text-2xl font-bold text-ink">{locations.length} areas connected</h3></div><div className="text-sm leading-6 text-ink/58">{blocks.length} sections · {totalNodes} nodes in structure</div></div>
      <article className="management-list-shell mt-5">{locations.map((item) => {
        const areaSections = blocks.filter((block) => block.locationId === item.id)
        const score = areaScore(areaSections)
        const state = scoreState(score)
        return <div className="management-list-row" data-state={state} key={item.id}><div className="management-list-main"><div className="management-list-title">{item.name}</div><div className="management-list-meta">{score ?? '—'}% area score · {areaSections.length} sections · {areaSections.flatMap((section) => section.nodes).length} nodes</div><div className="management-list-note">{areaSections.length ? 'Ready for live monitoring.' : 'No sections exist yet.'}</div></div><div className="management-list-actions"><span className="management-chip" data-tone={state}>{score ?? 'Setup needed'}</span><button className="inline-action actionable" onClick={() => openEdit(item)}><i className="fa-solid fa-sliders" />Edit</button></div></div>
      })}</article>
    </section>

    {editing && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditing(null) }}><section className="edit-modal"><div className="modal-head"><div><p className="eyebrow">Edit area</p><h2>{editing.name}</h2></div><button onClick={() => setEditing(null)}>×</button></div><label>Area name<input value={editName} onChange={(event) => setEditName(event.target.value)} /></label><div className="modal-actions"><button className="primary-button" onClick={() => { if (editName.trim()) onUpdate(editing.id, editName.trim()); setEditing(null) }}>Save changes</button></div><div className="danger-zone"><strong>Delete area</strong>{affectedBlocks > 0 && <><p>{affectedBlocks} sections must be moved or left unassigned.</p><label className="check-row"><input type="checkbox" checked={leaveUnassigned} onChange={(event) => setLeaveUnassigned(event.target.checked)} />Leave sections unassigned</label><label>Move sections to<select disabled={leaveUnassigned} value={moveTo} onChange={(event) => setMoveTo(event.target.value)}>{locations.filter((item) => item.id !== editing.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></>}<button className="danger-button" onClick={() => { onDelete(editing.id, leaveUnassigned ? '' : moveTo); setEditing(null) }}>Delete area</button></div></section></div>}
  </div>
}
