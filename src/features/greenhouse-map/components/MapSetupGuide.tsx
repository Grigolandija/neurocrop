import { useState } from 'react'
import type { GreenhouseMap } from '../model'
import type { AreaMapNode, AreaMapProfile, AreaMapSection, AreaSummary } from '../services/areaMapRepository'

type Props = {
  area: AreaSummary
  map: GreenhouseMap
  sections: AreaMapSection[]
  nodes: AreaMapNode[]
  profiles: AreaMapProfile[]
  language: 'en' | 'lt'
  onMapChange: (map: GreenhouseMap) => void
  onCreateSection: (name: string, profileId: string) => Promise<void>
  onAssignNode: (node: AreaMapNode, sectionId: string) => Promise<void>
  onClaimNode: (devEui: string, sectionId: string) => Promise<void>
  onClose: () => void
  onOpenSections: () => void
}

export default function MapSetupGuide({ area, map, sections, nodes, profiles, language, onMapChange, onCreateSection, onAssignNode, onClaimNode, onClose, onOpenSections }: Props) {
  const [step, setStep] = useState(0)
  const [sectionName, setSectionName] = useState('')
  const [profileId, setProfileId] = useState(profiles[0]?.id || 'default')
  const [busy, setBusy] = useState('')
  const [devEui, setDevEui] = useState('')
  const [claimSectionId, setClaimSectionId] = useState(sections[0]?.id || '')
  const tr = (english: string, lithuanian: string) => language === 'lt' ? lithuanian : english
  const steps = [tr('Greenhouse', 'Šiltnamis'), 'Sections', 'Nodes']
  const number = (value: string, fallback: number) => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : fallback

  return <div className="gh-setup-backdrop" role="presentation">
    <section className="gh-setup-guide" role="dialog" aria-modal="true" aria-labelledby="gh-setup-title">
      <header>
        <div><small>{tr('AREA MAP SETUP', 'AREA ŽEMĖLAPIO PARUOŠIMAS')}</small><h2 id="gh-setup-title">{tr('Prepare', 'Paruošti')} {area.name}</h2></div>
        <button type="button" onClick={onClose} aria-label="Close setup guide"><i className="fa-solid fa-xmark" /></button>
      </header>
      <ol>{steps.map((label, index) => <li key={label} className={index === step ? 'active' : index < step ? 'done' : ''}><span>{index < step ? <i className="fa-solid fa-check" /> : index + 1}</span>{label}</li>)}</ol>

      {step === 0 ? <div className="gh-setup-step">
        <span className="gh-setup-icon"><i className="fa-solid fa-vector-square" /></span>
        <h3>{tr('Confirm physical dimensions', 'Patvirtinkite fizinius matmenis')}</h3>
        <p>{tr('Use the inside dimensions of the growing space. Node and grid scale will adapt automatically.', 'Naudokite vidinius auginimo erdvės matmenis. Node ir tinklelio mastelis prisitaikys automatiškai.')}</p>
        <div className="gh-field-row">
          <label className="gh-field"><span>{tr('Width', 'Plotis')} <em>m</em></span><input type="number" min=".5" step=".1" value={map.dimensions.widthM} onChange={(event) => onMapChange({ ...map, dimensions: { ...map.dimensions, widthM: number(event.target.value, map.dimensions.widthM) } })} /></label>
          <label className="gh-field"><span>{tr('Length', 'Ilgis')} <em>m</em></span><input type="number" min=".5" step=".1" value={map.dimensions.lengthM} onChange={(event) => onMapChange({ ...map, dimensions: { ...map.dimensions, lengthM: number(event.target.value, map.dimensions.lengthM) } })} /></label>
        </div>
      </div> : null}

      {step === 1 ? <div className="gh-setup-step">
        <span className="gh-setup-icon"><i className="fa-solid fa-border-all" /></span>
        <h3>{sections.length ? tr(`${sections.length} Sections ready`, `Paruošta Sections: ${sections.length}`) : tr('Create at least one Section', 'Sukurkite bent vieną Section')}</h3>
        <p>{tr('Sections are the real growing zones used by crop profiles, alerts and node assignments.', 'Sections yra realios auginimo zonos, naudojamos augalų profiliams, perspėjimams ir node priskyrimams.')}</p>
        <div className="gh-setup-list">{sections.map((section) => <span key={section.id}><i className="fa-solid fa-square" /><b>{section.name}</b><small>{section.nodes} node{section.nodes === 1 ? '' : 's'}</small></span>)}</div>
        <div className="gh-setup-inline-form">
          <input value={sectionName} onChange={(event) => setSectionName(event.target.value)} placeholder={tr('New Section name', 'Naujos Section pavadinimas')} />
          <select value={profileId} onChange={(event) => setProfileId(event.target.value)}>{profiles.map((profile) => <option value={profile.id} key={profile.id}>{profile.name}</option>)}</select>
          <button className="primary" type="button" disabled={!sectionName.trim() || Boolean(busy)} onClick={() => { setBusy('section'); void onCreateSection(sectionName.trim(), profileId).then(() => setSectionName('')).finally(() => setBusy('')) }}>{busy === 'section' ? '…' : tr('Create', 'Sukurti')}</button>
        </div>
        {!profiles.length ? <button className="primary" type="button" onClick={onOpenSections}>{tr('Open Sections', 'Atidaryti Sections')}</button> : null}
      </div> : null}

      {step === 2 ? <div className="gh-setup-step">
        <span className="gh-setup-icon"><i className="fa-solid fa-microchip" /></span>
        <h3>{nodes.length ? tr(`${nodes.length} nodes placed`, `Išdėstyta nodes: ${nodes.length}`) : tr('No nodes assigned yet', 'Dar nėra priskirtų nodes')}</h3>
        <p>{tr('Nodes are placed inside their linked Sections. Choose an assignment here or drag a node while editing.', 'Nodes išdėstomi susietose Sections. Priskirkite čia arba nutempkite node redagavimo režime.')}</p>
        <div className="gh-setup-list gh-setup-node-list">{nodes.map((node) => <span key={node.devEui || node.nodeId}><i className={`fa-solid fa-circle gh-node-${node.status}`} /><b>{node.displayName || node.nodeId || node.devEui}</b><select value={node.sectionId || ''} disabled={!node.devEui || Boolean(busy)} onChange={(event) => { setBusy(node.devEui || 'node'); void onAssignNode(node, event.target.value).finally(() => setBusy('')) }}><option value="">{tr('Unassigned', 'Nepriskirtas')}</option>{sections.map((section) => <option value={section.id} key={section.id}>{section.name}</option>)}</select></span>)}</div>
        <div className="gh-setup-inline-form">
          <input value={devEui} maxLength={16} onChange={(event) => setDevEui(event.target.value.replace(/[^0-9a-f]/gi, '').toUpperCase())} placeholder="DevEUI · 16 HEX" />
          <select value={claimSectionId} onChange={(event) => setClaimSectionId(event.target.value)}><option value="">{tr('Choose Section', 'Pasirinkite Section')}</option>{sections.map((section) => <option value={section.id} key={section.id}>{section.name}</option>)}</select>
          <button className="primary" type="button" disabled={devEui.length !== 16 || !claimSectionId || Boolean(busy)} onClick={() => { setBusy('claim'); void onClaimNode(devEui, claimSectionId).then(() => setDevEui('')).finally(() => setBusy('')) }}>{tr('Connect', 'Prijungti')}</button>
        </div>
      </div> : null}

      <footer>
        <button type="button" disabled={step === 0} onClick={() => setStep((current) => current - 1)}>Back</button>
        <span />
        {step < steps.length - 1
          ? <button className="primary" type="button" onClick={() => setStep((current) => current + 1)}>{tr('Continue', 'Tęsti')} <i className="fa-solid fa-arrow-right" /></button>
          : <button className="primary" type="button" onClick={onClose}>{tr('Start editing map', 'Pradėti redaguoti')} <i className="fa-solid fa-check" /></button>}
      </footer>
    </section>
  </div>
}
