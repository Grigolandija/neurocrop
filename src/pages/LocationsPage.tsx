import { useState, type FormEvent } from 'react'
import type { Block, Location } from '../types'

export function LocationsPage({ locations, blocks, onAdd }: { locations: Location[]; blocks: Block[]; onAdd: (name: string) => void }) {
  const [name, setName] = useState('')
  function submit(e: FormEvent) { e.preventDefault(); if (!name.trim()) return; onAdd(name.trim()); setName('') }
  return <><header className="page-head"><div><p className="eyebrow">Structure</p><h1>Locations</h1><p>Greenhouses and other top-level growing areas.</p></div></header><form className="create-bar" onSubmit={submit}><label>Register location<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Greenhouse No. 3" /></label><button className="primary-button">Add location</button></form><section className="list-shell"><div className="list-head"><h2>Current locations</h2><span>{locations.length} locations</span></div>{locations.map((item) => <article className="list-row" key={item.id}><div><strong>{item.name}</strong><p>{blocks.filter((block) => block.locationId === item.id).length} blocks</p></div><span className="status-chip">Active</span></article>)}</section></>
}
