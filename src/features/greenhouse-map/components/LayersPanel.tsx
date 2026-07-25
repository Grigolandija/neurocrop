import type { MapLayer } from '../model'

const ltNames: Record<string, string> = {
  sections: 'Auginimo Sections', structure: 'Šiltnamio konstrukcija', cultivation: 'Auginimo infrastruktūra',
  irrigation: 'Laistymas', climate: 'Klimato įranga', lighting: 'Apšvietimas', sensors: 'Jutiklių nodes',
  labels: 'Etiketės', coverage: 'Jutiklių aprėptis', environment: 'Klimato žemėlapis',
  signal: 'LoRa signalas', confidence: 'Neapibrėžtumas',
}

export default function LayersPanel({ layers, language = 'en', onChange }: { layers: MapLayer[]; language?: 'en' | 'lt'; onChange: (layers: MapLayer[]) => void }) {
  const patch = (id: string, update: Partial<MapLayer>) => onChange(layers.map((layer) => layer.id === id ? { ...layer, ...update } : layer))
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= layers.length) return
    const next = [...layers]
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }
  return <section className="gh-panel-section gh-layers">
    <header><div><small>{language === 'lt' ? 'ATVAIZDAVIMO TVARKA' : 'RENDER STACK'}</small><h2>{language === 'lt' ? 'Sluoksniai' : 'Layers'}</h2></div><span>{layers.filter((layer) => layer.visible).length}/{layers.length}</span></header>
    <div className="gh-layer-list">{layers.map((layer, index) => <div key={layer.id}>
      <button onClick={() => patch(layer.id, { visible: !layer.visible })} title="Toggle visibility"><i className={`fa-regular ${layer.visible ? 'fa-eye' : 'fa-eye-slash'}`} /></button>
      <button onClick={() => patch(layer.id, { locked: !layer.locked })} title="Toggle lock"><i className={`fa-solid ${layer.locked ? 'fa-lock' : 'fa-lock-open'}`} /></button>
      <span title={language === 'lt' ? ltNames[layer.id] || layer.name : layer.name}>{language === 'lt' ? ltNames[layer.id] || layer.name : layer.name}</span>
      <input aria-label={`${layer.name} opacity`} type="range" min="0" max="1" step=".05" value={layer.opacity} onChange={(event) => patch(layer.id, { opacity: Number(event.target.value) })} />
      <button disabled={index === 0} onClick={() => move(index, -1)} title="Move up"><i className="fa-solid fa-chevron-up" /></button>
      <button disabled={index === layers.length - 1} onClick={() => move(index, 1)} title="Move down"><i className="fa-solid fa-chevron-down" /></button>
    </div>)}</div>
  </section>
}
