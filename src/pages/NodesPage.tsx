import { useState, type FormEvent } from 'react'
import type { Block, Location, NodeDevice } from '../types'

export function NodesPage({ locations, blocks, onAdd }: { locations: Location[]; blocks: Block[]; onAdd: (blockId: string, devEui: string) => void }) {
  const [blockId, setBlockId] = useState(blocks[0]?.id || '')
  const [devEui, setDevEui] = useState('')
  const nodes = blocks.flatMap((block) => block.nodes.map((node) => ({ node, block })))
  function submit(e: FormEvent) { e.preventDefault(); if (!/^[0-9a-fA-F]{16}$/.test(devEui)) return; onAdd(blockId, devEui.toUpperCase()); setDevEui('') }
  return <><header className="page-head"><div><p className="eyebrow">Hardware</p><h1>Nodes</h1><p>Registered sensor devices and their assigned blocks.</p></div></header><form className="create-bar columns" onSubmit={submit}><label>Block<select value={blockId} onChange={(e) => setBlockId(e.target.value)}>{blocks.map((block) => <option key={block.id} value={block.id}>{block.name}</option>)}</select></label><label>DevEUI<input value={devEui} onChange={(e) => setDevEui(e.target.value)} placeholder="16 hexadecimal characters" /></label><button className="primary-button">Register node</button></form><section className="list-shell"><div className="list-head"><h2>Registered nodes</h2><span>{nodes.length} nodes</span></div>{nodes.map(({ node, block }: { node: NodeDevice; block: Block }) => <article className="list-row" data-tone={node.battery < 35 ? 'critical' : 'normal'} key={node.id}><div><strong>{node.id}</strong><p>{locations.find((location) => location.id === block.locationId)?.name} · {block.name}<br />{node.devEui || 'DevEUI not assigned'}</p></div><div className="row-actions"><span className="status-chip">Active</span><span className="battery-chip">▭ {node.battery}%</span></div></article>)}</section></>
}
