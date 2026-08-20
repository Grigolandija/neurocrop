import { useState } from 'react'
import type { GreenhouseMap } from '../model'
import type { AreaMapNode, AreaSummary } from '../services/areaMapRepository'
import NumericInput from './NumericInput'

type Props = {
  area: AreaSummary
  map: GreenhouseMap
  nodes: AreaMapNode[]
  language: 'en' | 'lt'
  onMapChange: (map: GreenhouseMap) => void
  onOpenNodes: () => void
  onClose: () => void
}

export default function MapSetupGuide({ area, map, nodes, language, onMapChange, onOpenNodes, onClose }: Props) {
  const [step, setStep] = useState(0)
  const tr = (english: string, lithuanian: string) => language === 'lt' ? lithuanian : english
  const steps = [tr('Dimensions', 'Matmenys'), tr('Node placement', 'Mazgų išdėstymas')]

  return <div className="gh-setup-backdrop" role="presentation">
    <section className="gh-setup-guide" role="dialog" aria-modal="true" aria-labelledby="gh-setup-title">
      <header>
        <div><small>{tr('AREA MAP SETUP', 'ERDVĖS ŽEMĖLAPIO PARUOŠIMAS')}</small><h2 id="gh-setup-title">{tr('Prepare', 'Paruošti')} {area.name}</h2></div>
        <button type="button" onClick={onClose} aria-label={tr('Close setup guide', 'Uždaryti paruošimo vedlį')}><i className="fa-solid fa-xmark" /></button>
      </header>
      <ol>{steps.map((label, index) => <li key={label} className={index === step ? 'active' : index < step ? 'done' : ''}><span>{index < step ? <i className="fa-solid fa-check" /> : index + 1}</span>{label}</li>)}</ol>

      {step === 0 ? <div className="gh-setup-step">
        <span className="gh-setup-icon"><i className="fa-solid fa-vector-square" /></span>
        <h3>{tr('Confirm physical dimensions', 'Patvirtinkite fizinius matmenis')}</h3>
        <p>{tr('Use the inside dimensions of the room or greenhouse. The grid and node marker scale adapt automatically.', 'Naudokite vidinius patalpos arba šiltnamio matmenis. Tinklelio ir mazgų žymeklių mastelis prisitaikys automatiškai.')}</p>
        <div className="gh-field-row">
          <label className="gh-field"><span>{tr('Width', 'Plotis')} <em>m</em></span><NumericInput min=".5" max="10000" step=".1" value={map.dimensions.widthM} onCommit={(value) => onMapChange({ ...map, dimensions: { ...map.dimensions, widthM: value ?? map.dimensions.widthM } })} /></label>
          <label className="gh-field"><span>{tr('Length', 'Ilgis')} <em>m</em></span><NumericInput min=".5" max="10000" step=".1" value={map.dimensions.lengthM} onCommit={(value) => onMapChange({ ...map, dimensions: { ...map.dimensions, lengthM: value ?? map.dimensions.lengthM } })} /></label>
        </div>
      </div> : null}

      {step === 1 ? <div className="gh-setup-step">
        <span className="gh-setup-icon"><i className="fa-solid fa-location-dot" /></span>
        <h3>{nodes.length ? tr(`${nodes.length} Area nodes ready to place`, `Paruošta išdėstyti erdvės mazgų: ${nodes.length}`) : tr('No nodes assigned to this Area', 'Šiai erdvei nepriskirta mazgų')}</h3>
        <p>{tr('After closing this guide, drag each node to its real installation point. Section assignments are managed outside Area Map.', 'Uždarę vedlį nutempkite kiekvieną mazgą į tikrą montavimo vietą. Priskyrimai sekcijoms valdomi ne erdvės žemėlapyje.')}</p>
        <div className="gh-setup-list gh-setup-node-list">{nodes.map((node) => <span key={node.devEui || node.nodeId}><i className={`fa-solid fa-circle gh-node-${node.status}`} /><b>{node.displayName || node.nodeId || node.devEui}</b><small>{node.sectionName || tr('No Section', 'Be sekcijos')}</small></span>)}</div>
        <button className="primary" type="button" onClick={onOpenNodes}><i className="fa-solid fa-microchip" /> {tr('Manage nodes', 'Valdyti mazgus')}</button>
      </div> : null}

      <footer>
        <button type="button" disabled={step === 0} onClick={() => setStep((current) => current - 1)}>{tr('Back', 'Atgal')}</button>
        <span />
        {step < steps.length - 1
          ? <button className="primary" type="button" onClick={() => setStep((current) => current + 1)}>{tr('Continue', 'Tęsti')} <i className="fa-solid fa-arrow-right" /></button>
          : <button className="primary" type="button" onClick={onClose}>{tr('Start placing nodes', 'Pradėti dėlioti mazgus')} <i className="fa-solid fa-check" /></button>}
      </footer>
    </section>
  </div>
}
