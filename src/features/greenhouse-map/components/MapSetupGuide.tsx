import { useState } from 'react'
import type { GreenhouseMap } from '../model'
import type { AreaMapNode, AreaMapSection, AreaSummary } from '../services/areaMapRepository'

type Props = {
  area: AreaSummary
  map: GreenhouseMap
  sections: AreaMapSection[]
  nodes: AreaMapNode[]
  onMapChange: (map: GreenhouseMap) => void
  onClose: () => void
  onOpenSections: () => void
}

export default function MapSetupGuide({ area, map, sections, nodes, onMapChange, onClose, onOpenSections }: Props) {
  const [step, setStep] = useState(0)
  const steps = ['Greenhouse', 'Sections', 'Nodes']
  const number = (value: string, fallback: number) => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : fallback

  return <div className="gh-setup-backdrop" role="presentation">
    <section className="gh-setup-guide" role="dialog" aria-modal="true" aria-labelledby="gh-setup-title">
      <header>
        <div><small>AREA MAP SETUP</small><h2 id="gh-setup-title">Prepare {area.name}</h2></div>
        <button type="button" onClick={onClose} aria-label="Close setup guide"><i className="fa-solid fa-xmark" /></button>
      </header>
      <ol>{steps.map((label, index) => <li key={label} className={index === step ? 'active' : index < step ? 'done' : ''}><span>{index < step ? <i className="fa-solid fa-check" /> : index + 1}</span>{label}</li>)}</ol>

      {step === 0 ? <div className="gh-setup-step">
        <span className="gh-setup-icon"><i className="fa-solid fa-vector-square" /></span>
        <h3>Confirm physical dimensions</h3>
        <p>Use the inside dimensions of the growing space. Node and grid scale will adapt automatically.</p>
        <div className="gh-field-row">
          <label className="gh-field"><span>Width <em>m</em></span><input type="number" min=".5" step=".1" value={map.dimensions.widthM} onChange={(event) => onMapChange({ ...map, dimensions: { ...map.dimensions, widthM: number(event.target.value, map.dimensions.widthM) } })} /></label>
          <label className="gh-field"><span>Length <em>m</em></span><input type="number" min=".5" step=".1" value={map.dimensions.lengthM} onChange={(event) => onMapChange({ ...map, dimensions: { ...map.dimensions, lengthM: number(event.target.value, map.dimensions.lengthM) } })} /></label>
        </div>
      </div> : null}

      {step === 1 ? <div className="gh-setup-step">
        <span className="gh-setup-icon"><i className="fa-solid fa-border-all" /></span>
        <h3>{sections.length ? `${sections.length} Section${sections.length === 1 ? '' : 's'} ready` : 'Create at least one Section'}</h3>
        <p>Sections are the real growing zones used by crop profiles, alerts and node assignments.</p>
        <div className="gh-setup-list">{sections.map((section) => <span key={section.id}><i className="fa-solid fa-square" /><b>{section.name}</b><small>{section.nodes} node{section.nodes === 1 ? '' : 's'}</small></span>)}</div>
        {!sections.length ? <button className="primary" type="button" onClick={onOpenSections}>Open Sections</button> : null}
      </div> : null}

      {step === 2 ? <div className="gh-setup-step">
        <span className="gh-setup-icon"><i className="fa-solid fa-microchip" /></span>
        <h3>{nodes.length ? `${nodes.length} node${nodes.length === 1 ? '' : 's'} placed` : 'No nodes assigned yet'}</h3>
        <p>Nodes are placed inside their linked Sections. In Edit map mode, drag a node into another Section to update its assignment.</p>
        <div className="gh-setup-list">{nodes.map((node) => <span key={node.devEui || node.nodeId}><i className={`fa-solid fa-circle gh-node-${node.status}`} /><b>{node.displayName || node.nodeId || node.devEui}</b><small>{node.sectionName || 'Unassigned'}</small></span>)}</div>
      </div> : null}

      <footer>
        <button type="button" disabled={step === 0} onClick={() => setStep((current) => current - 1)}>Back</button>
        <span />
        {step < steps.length - 1
          ? <button className="primary" type="button" onClick={() => setStep((current) => current + 1)}>Continue <i className="fa-solid fa-arrow-right" /></button>
          : <button className="primary" type="button" onClick={onClose}>Start editing map <i className="fa-solid fa-check" /></button>}
      </footer>
    </section>
  </div>
}
