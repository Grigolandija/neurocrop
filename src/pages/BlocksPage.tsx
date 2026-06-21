import { useState, type FormEvent } from 'react'
import type { Block, Location } from '../types'

export function BlocksPage({ locations, blocks, onAdd }: { locations: Location[]; blocks: Block[]; onAdd: (locationId: string, name: string) => void }) {
  const [locationId, setLocationId] = useState(locations[0]?.id || '')
  const [name, setName] = useState('')
  function submit(e: FormEvent) { e.preventDefault(); if (!name.trim()) return; onAdd(locationId, name.trim()); setName('') }
  return <><header className="page-head"><div><p className="eyebrow">Structure</p><h1>Blocks</h1><p>Monitored growing areas inside each location.</p></div></header><form className="create-bar columns" onSubmit={submit}><label>Location<select value={locationId} onChange={(e) => setLocationId(e.target.value)}>{locations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Register block<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tomato Block B" /></label><button className="primary-button">Add block</button></form><section className="list-shell"><div className="list-head"><h2>Current blocks</h2><span>{blocks.length} blocks</span></div>{blocks.map((block) => <article className="list-row" key={block.id}><div><strong>{block.name}</strong><p>{locations.find((item) => item.id === block.locationId)?.name} · {block.cropProfile}</p></div><div className="row-actions"><span className="status-chip">{block.nodes.length} nodes</span><span className="status-chip neutral">{block.installedMetrics.length} metrics</span></div></article>)}</section></>
}
