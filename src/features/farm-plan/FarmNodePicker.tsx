import { useState } from 'react'
import { Link } from 'react-router'
import type { GreenhouseMap } from '../greenhouse-map/model'
import type { AreaMapContext, AreaMapNode } from '../greenhouse-map/services/areaMapRepository'

type Filter = 'area' | 'placed' | 'available' | 'height' | 'unassigned' | 'all'
type Props = {
  map: GreenhouseMap
  context?: AreaMapContext
  loading: boolean
  lt: boolean
  unassignedNodes: AreaMapNode[]
  inventoryError?: string
  onSelect: (id: string) => void
  onAdd: (node: AreaMapNode) => void
  onConnect: (devEui: string, sectionId: string) => Promise<AreaMapNode>
}

export default function FarmNodePicker({ map, context, loading, lt, unassignedNodes, inventoryError, onSelect, onAdd, onConnect }: Props) {
  const [query, setQuery] = useState(''), [filter, setFilter] = useState<Filter>('area')
  const [connect, setConnect] = useState(''), [section, setSection] = useState('')
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const placedNodes = map.objects.filter(object => object.type === 'sensor-node')
  const placed = new Set(placedNodes.flatMap(object => object.metadata.sensor?.devEui?.toLowerCase() || []))
  const available = (context?.nodes || []).filter(node => node.devEui && !placed.has(node.devEui.toLowerCase()))
  const rows = [
    ...placedNodes.map(object => ({ key: object.id, name: object.name, node: object.metadata.sensor, state: 'placed' as const, objectId: object.id })),
    ...available.map(node => ({ key: node.devEui!, name: node.displayName || node.nodeId || node.devEui!, node, state: 'available' as const, objectId: '' })),
    ...unassignedNodes.filter(node => node.devEui && !placed.has(node.devEui.toLowerCase())).map(node => ({ key: node.devEui!, name: node.displayName || node.nodeId || node.devEui!, node, state: 'unassigned' as const, objectId: '' })),
  ]
  const normalizedQuery = query.trim().toLowerCase()
  const visible = rows.filter(row => {
    const inArea = row.state !== 'unassigned'
    const matchesFilter = filter === 'all' || (filter === 'area' ? inArea : filter === 'height' ? inArea && row.node?.installationHeightM == null : row.state === filter)
    return matchesFilter && `${row.name} ${row.node?.displayName || ''} ${row.node?.nodeId || ''} ${row.node?.devEui || ''}`.toLowerCase().includes(normalizedQuery)
  })
  const filters: Record<Filter, string> = {
    area: lt ? 'Šios Area jutikliai' : 'Nodes in this Area',
    placed: lt ? 'Jau plane' : 'Placed in plan',
    available: lt ? 'Dar neįdėti' : 'Not placed yet',
    height: lt ? 'Be nurodyto aukščio' : 'Height not set',
    unassigned: lt ? 'Nepriskirti Area' : 'Unassigned Nodes',
    all: lt ? 'Visi jutikliai' : 'All Nodes',
  }
  const connection = unassignedNodes.find(node => node.devEui === connect)
  const groups = context?.sections.filter(group => !group.isAreaDefault) || []

  return <section className="nfa-node-picker" aria-label={lt ? 'Pasirinkti Node' : 'Choose a Node'}>
    <div className="nfa-node-picker-toolbar">
      <input type="search" aria-label={lt ? 'Rasti Node pagal pavadinimą, ID ar DevEUI' : 'Find a Node by name, ID or DevEUI'} placeholder={lt ? 'Rasti Node…' : 'Find a Node…'} value={query} onChange={event => { setQuery(event.target.value); if (event.target.value.trim()) setFilter('all') }} />
      <select aria-label={lt ? 'Jutiklių filtras' : 'Node filter'} value={filter} onChange={event => setFilter(event.target.value as Filter)}>{(Object.keys(filters) as Filter[]).map(value => <option value={value} key={value}>{filters[value]}</option>)}</select>
      <span role="status">{loading ? (lt ? 'Kraunama…' : 'Loading…') : `${visible.length} Nodes`}</span>
    </div>
    {!loading && <div className="nfa-node-tray" key={`${filter}-${query}`} role="group" aria-label={lt ? 'Jutikliai' : 'Nodes'}>{visible.map(row => {
      const action = row.state === 'placed' ? (lt ? 'Keisti vietą ir aukštį' : 'Edit position and height') : row.state === 'available' ? (lt ? 'Pridėti į brėžinį' : 'Place in drawing') : (lt ? 'Priskirti šiai Area' : 'Assign to this Area')
      const height = row.node?.installationHeightM
      const detail = row.state === 'placed' ? `${lt ? 'Plane' : 'In plan'} · ${height == null ? (lt ? 'Be aukščio' : 'No height') : `${height} m`}` : row.state === 'available' ? (lt ? 'Pridėti' : 'Place') : (lt ? 'Priskirti' : 'Assign')
      return <button type="button" key={row.key} disabled={busy || (row.state === 'unassigned' && !context?.cultivation)} aria-label={`${row.name} — ${action}`} title={`${row.name} · ${row.node?.devEui || ''} · ${action}`} onClick={() => {
        if (row.state === 'placed') onSelect(row.objectId)
        else if (row.state === 'available') onAdd(row.node as AreaMapNode)
        else { setConnect(row.node!.devEui!); setError('') }
      }}><i className="fa-solid fa-microchip" aria-hidden="true" /><span>{row.name}</span><small>{detail}</small><i className={`fa-solid ${row.state === 'placed' ? 'fa-pen' : row.state === 'available' ? 'fa-plus' : 'fa-link'}`} aria-hidden="true" /></button>
    })}</div>}
    {!loading && !visible.length && <p className="nfa-node-picker-empty">{!context ? (lt ? 'Išsaugokite Area, kad galėtumėte priskirti jutiklius.' : 'Save this Area to assign Nodes.') : normalizedQuery || filter !== 'area' ? (lt ? 'Pagal šią paiešką ar filtrą jutiklių nerasta.' : 'No Nodes match this search or filter.') : (lt ? 'Šiai Area dar nepriskirta jutiklių.' : 'No Nodes assigned to this Area yet.')}</p>}
    {connection && <form className="nfa-node-connect" onSubmit={async event => {
      event.preventDefault();setBusy(true);setError('')
      try { const node = await onConnect(connect, section); onAdd(node); setConnect('') }
      catch (reason) { setError(reason instanceof Error ? reason.message : 'Node could not be assigned.') }
      finally { setBusy(false) }
    }}>
      <span>{connection.displayName || connection.nodeId || connection.devEui}</span>
      {groups.length > 0 && <select aria-label={lt ? 'Auginimo grupė' : 'Growing group'} value={section} disabled={busy} onChange={event => setSection(event.target.value)}><option value="">{lt ? 'Visa Area' : 'Whole Area'}</option>{groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select>}
      <button type="submit" disabled={busy || !context?.cultivation}>{busy ? (lt ? 'Saugoma…' : 'Saving…') : (lt ? 'Priskirti ir pridėti' : 'Assign and place')}</button>
      <button type="button" disabled={busy} onClick={() => { setConnect(''); setError('') }}>{lt ? 'Atšaukti' : 'Cancel'}</button>
    </form>}
    {inventoryError && <p className="nfa-message" role="alert">{inventoryError}</p>}
    {error && <p className="nfa-message" role="alert">{error}</p>}
    <footer className="nfa-node-picker-footer"><span>{lt ? 'Pasirinkite Node jo vietai ir aukščiui keisti.' : 'Select a Node to edit its position and height.'}</span><Link to="/nodes">{lt ? 'Registruoti Node' : 'Register a Node'} →</Link></footer>
  </section>
}
