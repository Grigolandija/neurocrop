import { translateInterfaceText as tx } from '../../../i18n'
import type { MapLayer } from '../model'

const ltNames: Record<string, string> = {
  sections: 'Auginimo sekcijos', structure: 'Šiltnamio konstrukcija', cultivation: 'Auginimo infrastruktūra',
  irrigation: 'Laistymas', climate: 'Klimato įranga', lighting: 'Apšvietimas', sensors: 'Jutiklių mazgai',
  labels: 'Etiketės', coverage: 'Jutiklių aprėptis', environment: 'Klimato žemėlapis',
}

const planLayerIds = new Set(['structure', 'cultivation', 'irrigation', 'climate', 'lighting', 'sensors', 'labels'])

export default function LayersPanel({ layers, language = 'en', onChange }: { layers: MapLayer[]; language?: 'en' | 'lt'; onChange: (layers: MapLayer[]) => void }) {
  const patch = (id: string, update: Partial<MapLayer>) => onChange(layers.map((layer) => layer.id === id ? { ...layer, ...update } : layer))
  const planLayers = layers.filter((layer) => planLayerIds.has(layer.id))
  return <section className="gh-panel-section gh-layers">
    <header><div><small>{language === 'lt' ? 'PLANO OBJEKTAI' : 'PLAN OBJECTS'}</small><h2>{language === 'lt' ? 'Sluoksniai' : 'Layers'}</h2></div><span>{planLayers.filter((layer) => layer.visible).length}/{planLayers.length}</span></header>
    <div className="gh-layer-list">{planLayers.map((layer) => <div key={layer.id}>
      <button onClick={() => patch(layer.id, { visible: !layer.visible })} title={tx("Toggle visibility")}><i className={`fa-regular ${layer.visible ? 'fa-eye' : 'fa-eye-slash'}`} /></button>
      <button onClick={() => patch(layer.id, { locked: !layer.locked })} title={tx("Toggle lock")}><i className={`fa-solid ${layer.locked ? 'fa-lock' : 'fa-lock-open'}`} /></button>
      <span title={language === 'lt' ? ltNames[layer.id] || layer.name : layer.name}>{language === 'lt' ? ltNames[layer.id] || layer.name : layer.name}</span>
    </div>)}</div>
  </section>
}
