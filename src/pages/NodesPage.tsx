import { useState, type FormEvent } from 'react'
import type { Block, Location, NodeDevice } from '../types'

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

  return <>
    <header className="page-head"><div><p className="eyebrow">Hardware</p><h1>Nodes</h1><p>Registered sensor devices and their assigned Sections.</p></div><label className="list-filter">Filter current list<select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All sections</option>{blocks.map((block) => <option key={block.id} value={block.id}>{block.name}</option>)}</select></label></header>
    <form className="create-bar columns" onSubmit={submit}><label>Section<select value={blockId} onChange={(event) => setBlockId(event.target.value)}>{blocks.map((block) => <option key={block.id} value={block.id}>{block.name}</option>)}</select></label><label>DevEUI<input value={devEui} onChange={(event) => setDevEui(event.target.value)} placeholder="16 hexadecimal characters" /></label><button className="primary-button">Register node</button></form>
    <section className="list-shell"><div className="list-head"><h2>Registered nodes</h2><span>{visibleNodes.length} nodes</span></div>{visibleNodes.map(({ node, block }) => <article className="list-row" data-tone={node.battery < 35 ? 'critical' : 'normal'} key={node.id}><div><strong>{node.id}</strong><p>{locations.find((location) => location.id === block.locationId)?.name || 'Unassigned'} · {block.name}<br />{node.devEui || 'DevEUI not assigned'}</p></div><div className="row-actions"><span className="status-chip">{node.active ? 'Active' : 'Paused'}</span><span className="battery-chip">▭ {node.battery}%</span><button className="edit-button" onClick={() => openEdit(node, block)}>Edit</button></div></article>)}</section>

    {editing && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditing(null) }}><section className="edit-modal"><div className="modal-head"><div><p className="eyebrow">Edit node</p><h2>{editing.node.id}</h2></div><button onClick={() => setEditing(null)}>×</button></div><label>Assigned section<select value={draft.blockId} onChange={(event) => setDraft({ ...draft, blockId: event.target.value })}>{blocks.map((block) => <option key={block.id} value={block.id}>{block.name}</option>)}</select></label><label>DevEUI<input value={draft.devEui} onChange={(event) => setDraft({ ...draft, devEui: event.target.value.toUpperCase() })} /></label><label className="check-row"><input type="checkbox" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} />Node active</label><div className="modal-actions"><button className="primary-button" onClick={() => { onUpdate(editing.block.id, editing.node.id, draft); setEditing(null) }}>Save changes</button></div><div className="danger-zone"><strong>Delete node</strong><button className="danger-button" onClick={() => { onDelete(editing.block.id, editing.node.id); setEditing(null) }}>Delete node</button></div></section></div>}
  </>
}
