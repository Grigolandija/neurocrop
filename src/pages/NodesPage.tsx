import { useState, type FormEvent } from 'react'
import type { Block, Location, NodeDevice } from '../types'
import { scoreState, sectionScore } from '../lib/score'

type Props = {
  locations: Location[]
  blocks: Block[]
  onAdd: (blockId: string, devEui: string) => void
  onUpdate: (originalBlockId: string, nodeId: string, patch: { blockId: string; devEui: string; active: boolean }) => void
  onDelete: (blockId: string, nodeId: string) => void
}

export function NodesPage({ locations, blocks, onAdd, onUpdate, onDelete }: Props) {
  const [blockId, setBlockId] = useState(blocks[0]?.id || '')
  const [devEui, setDevEui] = useState('')
  const [filter, setFilter] = useState('all')
  const [editing, setEditing] = useState<{ node: NodeDevice; block: Block } | null>(null)
  const [draft, setDraft] = useState({ blockId: '', devEui: '', active: true })
  const nodes = blocks.flatMap((block) => block.nodes.map((node) => ({ node, block })))
  const visibleNodes = filter === 'all' ? nodes : nodes.filter((item) => item.block.id === filter)

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!/^[0-9a-fA-F]{16}$/.test(devEui)) return
    onAdd(blockId, devEui.toUpperCase())
    setDevEui('')
  }

  function openEdit(node: NodeDevice, block: Block) {
    setEditing({ node, block })
    setDraft({ blockId: block.id, devEui: node.devEui || '', active: node.active })
  }

  return <div className="space-y-6">
    <section className="surface rounded-[30px] p-5 md:p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between"><div className="max-w-3xl"><p className="text-[11px] uppercase tracking-[0.28em] text-pine/56">Register node</p><h2 className="mt-1.5 font-display text-[1.65rem] font-bold leading-tight text-ink">Add sensor node</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-ink/66">Register the device and assign it to the section it monitors.</p></div><div className="panel min-w-[112px] rounded-[18px] px-3.5 py-2.5"><div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-pine/56">Nodes</div><div className="mt-0.5 text-xl font-extrabold text-ink">{nodes.length}</div></div></div>
      <form className="mt-4" onSubmit={submit}><div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] xl:items-end"><label className="block"><span className="text-sm font-semibold text-ink/72">Section</span><select className="mt-1.5 w-full rounded-[18px] border border-black/10 bg-white px-4 py-2.5 text-sm text-ink" value={blockId} onChange={(event) => setBlockId(event.target.value)}>{blocks.map((block) => <option key={block.id} value={block.id}>{block.name}</option>)}</select></label><label className="block"><span className="text-sm font-semibold text-ink/72">DevEUI</span><input className="mt-1.5 w-full rounded-[18px] border border-black/10 bg-white px-4 py-2.5 text-sm text-ink" value={devEui} onChange={(event) => setDevEui(event.target.value)} placeholder="16 hexadecimal characters" /></label><button className="actionable rounded-2xl bg-pine px-4 py-2.5 text-sm font-semibold text-white">Register node</button></div></form>
      <div className="mt-4 border-t border-black/8 pt-4 flex items-center justify-between gap-4"><div><p className="text-[11px] uppercase tracking-[0.22em] text-pine/56">Filter current list</p><p className="mt-1 text-sm text-ink/58">Focus nodes assigned to one section.</p></div><select className="w-[280px] rounded-[18px] border border-black/10 bg-white px-4 py-2.5 text-sm font-semibold text-ink" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All sections</option>{blocks.map((block) => <option key={block.id} value={block.id}>{block.name}</option>)}</select></div>
    </section>
    <section className="surface rounded-[34px] p-6 md:p-7"><div><p className="text-xs uppercase tracking-[0.24em] text-pine/56">Current nodes</p><h3 className="mt-2 font-display text-2xl font-bold text-ink">{visibleNodes.length} registered nodes</h3></div><article className="management-list-shell mt-5">{visibleNodes.map(({ node, block }) => {
      const score = sectionScore(block)
      const state = node.battery < 35 ? 'critical' : scoreState(score)
      return <div className="management-list-row" data-state={state} key={node.id}><div className="management-list-main"><div className="management-list-title">{node.id}</div><div className="management-list-meta">{locations.find((location) => location.id === block.locationId)?.name || 'Unassigned'} · {block.name}</div><div className="management-list-note">{node.devEui || 'DevEUI not assigned'}</div></div><div className="management-list-actions"><span className="management-chip" data-tone={node.active ? 'optimal' : 'neutral'}>{node.active ? 'Active' : 'Paused'}</span><span className="management-chip" data-tone={node.battery < 35 ? 'critical' : 'warning'}><i className="fa-solid fa-battery-half" />{node.battery}%</span><button className="inline-action actionable" onClick={() => openEdit(node, block)}><i className="fa-solid fa-sliders" />Edit</button></div></div>
    })}</article></section>

    {editing && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditing(null) }}><section className="edit-modal"><div className="modal-head"><div><p className="eyebrow">Edit node</p><h2>{editing.node.id}</h2></div><button onClick={() => setEditing(null)}>×</button></div><label>Assigned section<select value={draft.blockId} onChange={(event) => setDraft({ ...draft, blockId: event.target.value })}>{blocks.map((block) => <option key={block.id} value={block.id}>{block.name}</option>)}</select></label><label>DevEUI<input value={draft.devEui} onChange={(event) => setDraft({ ...draft, devEui: event.target.value.toUpperCase() })} /></label><label className="check-row"><input type="checkbox" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} />Node active</label><div className="modal-actions"><button className="primary-button" onClick={() => { onUpdate(editing.block.id, editing.node.id, draft); setEditing(null) }}>Save changes</button></div><div className="danger-zone"><strong>Delete node</strong><button className="danger-button" onClick={() => { onDelete(editing.block.id, editing.node.id); setEditing(null) }}>Delete node</button></div></section></div>}
  </div>
}
