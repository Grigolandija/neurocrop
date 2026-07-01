import { useState } from 'react'
import { metricDefinitions } from '../data/mock'
import type { Block } from '../types'

const profiles = ['Tomatoes, vegetative', 'Lettuce, leaf growth', 'Strawberries, fruiting']

export function CropProfilesPage({ blocks }: { blocks: Block[] }) {
  const [profile, setProfile] = useState(profiles[0])
  const [saved, setSaved] = useState(false)

  return <>
    <header className="page-head"><div><p className="eyebrow">Agronomy</p><h1>Crop profiles</h1><p>Define the target ranges used by scores, alerts and Trends.</p></div></header>
    <section className="profile-selector">
      <label>Profile<select value={profile} onChange={(event) => { setProfile(event.target.value); setSaved(false) }}>{profiles.map((item) => <option key={item}>{item}</option>)}</select></label>
      <span>{blocks.filter((block) => block.cropProfile === profile).length} assigned sections</span>
      <button className="secondary-button">Duplicate profile</button>
    </section>
    <section className="profile-editor">
      <div className="section-head"><div><p className="eyebrow">Target ranges</p><h2>{profile}</h2></div><span className="count-chip">{metricDefinitions.length} growth metrics</span></div>
      <div className="target-list">{metricDefinitions.map((metric) => <article key={metric.key}><div><strong>{metric.label}</strong><span>{metric.unit}</span></div><label>Optimal minimum<input type="number" defaultValue={metric.target[0]} /></label><label>Optimal maximum<input type="number" defaultValue={metric.target[1]} /></label></article>)}</div>
      <div className="editor-actions"><button className="primary-button" onClick={() => setSaved(true)}>Save profile targets</button>{saved && <span>Profile saved.</span>}</div>
    </section>
  </>
}
