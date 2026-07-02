import { useState, type FormEvent } from 'react'
import type { Block, Location } from '../types'
import { scoreState, sectionScore } from '../lib/score'

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

  return <div className="space-y-6">
    <section className="surface rounded-[30px] p-5 md:p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between"><div className="max-w-3xl"><p className="text-[11px] uppercase tracking-[0.28em] text-pine/56">Register section</p><h2 className="mt-1.5 font-display text-[1.65rem] font-bold leading-tight text-ink">Create section</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-ink/66">Use one section for one monitored crop area inside an area.</p></div><div className="flex flex-wrap gap-2.5 xl:justify-end">{[['Shown sections', visibleBlocks.length], ['Areas', locations.length], ['Nodes', visibleBlocks.flatMap((block) => block.nodes).length]].map(([label, value]) => <div className="panel min-w-[112px] rounded-[18px] px-3.5 py-2.5" key={label}><div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-pine/56">{label}</div><div className="mt-0.5 text-xl font-extrabold text-ink">{value}</div></div>)}</div></div>
      <form className="mt-4 space-y-3" onSubmit={submit}><div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] xl:items-end"><label className="block"><span className="text-sm font-semibold text-ink/72">Section name</span><input className="mt-1.5 w-full rounded-[18px] border border-black/10 bg-white px-4 py-2.5 text-sm text-ink" value={name} onChange={(event) => setName(event.target.value)} placeholder="Tomato Section B" /></label><label className="block"><span className="text-sm font-semibold text-ink/72">Area</span><select className="mt-1.5 w-full rounded-[18px] border border-black/10 bg-white px-4 py-2.5 text-sm text-ink" value={locationId} onChange={(event) => setLocationId(event.target.value)}>{locations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><button className="actionable rounded-2xl bg-pine px-4 py-2.5 text-sm font-semibold text-white">Create section</button></div></form>
      <div className="mt-4 border-t border-black/8 pt-4"><div className="flex items-center justify-between gap-4"><div><p className="text-[11px] uppercase tracking-[0.22em] text-pine/56">Filter current list</p><p className="mt-1 text-sm text-ink/58">Choose an area to focus the section list.</p></div><select className="w-[280px] rounded-[18px] border border-black/10 bg-white px-4 py-2.5 text-sm font-semibold text-ink" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All areas</option><option value="">Unassigned</option>{locations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div></div>
    </section>
    <section className="surface rounded-[34px] p-6 md:p-7"><div className="flex items-end justify-between"><div><p className="text-xs uppercase tracking-[0.24em] text-pine/56">Current sections</p><h3 className="mt-2 font-display text-2xl font-bold text-ink">{visibleBlocks.length} sections in this view</h3></div></div><article className="management-list-shell mt-5">{visibleBlocks.map((block) => {
      const score = sectionScore(block)
      return <div className="management-list-row" data-state={scoreState(score)} key={block.id}><div className="management-list-main"><div className="management-list-title">{block.name}</div><div className="management-list-meta">{locations.find((item) => item.id === block.locationId)?.name || 'Unassigned'} · {block.cropProfile} · {block.nodes.length} nodes</div><div className="management-list-note">Ready for live monitoring.</div></div><div className="management-list-actions"><span className="management-chip" data-tone={scoreState(score)}>{score}%</span><button className="inline-action actionable" onClick={() => openEdit(block)}><i className="fa-solid fa-sliders" />Edit</button></div></div>
    })}</article></section>

    {editing && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditing(null) }}><section className="edit-modal"><div className="modal-head"><div><p className="eyebrow">Edit section</p><h2>{editing.name}</h2></div><button onClick={() => setEditing(null)}>×</button></div><label>Section name<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label><label>Area<select value={draft.locationId} onChange={(event) => setDraft({ ...draft, locationId: event.target.value })}><option value="">Unassigned</option>{locations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Crop profile<select value={draft.cropProfile} onChange={(event) => setDraft({ ...draft, cropProfile: event.target.value })}>{profiles.map((item) => <option key={item}>{item}</option>)}</select></label><div className="modal-actions"><button className="primary-button" onClick={() => { if (draft.name.trim()) onUpdate(editing.id, { ...draft, name: draft.name.trim() }); setEditing(null) }}>Save changes</button></div><div className="danger-zone"><strong>Delete section</strong><p>{editing.nodes.length} assigned nodes will also be removed from this demo workspace.</p><button className="danger-button" onClick={() => { onDelete(editing.id); setEditing(null) }}>Delete section</button></div></section></div>}
  </div>
}
