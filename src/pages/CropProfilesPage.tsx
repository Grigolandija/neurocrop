import { useState } from 'react'
import { metricDefinitions } from '../data/mock'
import type { Block } from '../types'

const profiles = [
  { id: 'tomato-veg', name: 'Tomatoes, vegetative', crop: 'Tomato', stage: 'Vegetative' },
  { id: 'lettuce-leaf', name: 'Lettuce, leaf growth', crop: 'Lettuce', stage: 'Leaf growth' },
  { id: 'strawberry-fruit', name: 'Strawberries, fruiting', crop: 'Strawberry', stage: 'Fruiting' },
]

export function CropProfilesPage({ blocks }: { blocks: Block[] }) {
  const [profileId, setProfileId] = useState(profiles[0].id)
  const [saved, setSaved] = useState(false)
  const profile = profiles.find((item) => item.id === profileId) || profiles[0]

  return <>
    <header className="surface rounded-[30px] p-5 md:p-6"><div><p className="text-[11px] uppercase tracking-[0.28em] text-pine/56">Agronomy</p><h1 className="mt-1.5 font-display text-[1.65rem] font-bold text-ink">Crop profiles</h1><p className="mt-2 text-sm leading-6 text-ink/66">Define the ranges used by scores, alerts and Trends.</p></div></header>
    <section className="profile-selector">
      <label>Profile<select value={profileId} onChange={(event) => { setProfileId(event.target.value); setSaved(false) }}>{profiles.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <span>{blocks.filter((block) => block.cropProfile === profile.name).length} assigned sections</span>
      <button className="secondary-button">Duplicate profile</button>
    </section>
    <section className="profile-editor">
      <div className="section-head"><div><p className="eyebrow">Edit profile and target ranges</p><h2>{profile.name}</h2></div><span className="count-chip">{metricDefinitions.length} growth metrics</span></div>
      <div className="profile-identity">
        <label>Profile name<input defaultValue={profile.name} /></label>
        <label>Crop<input defaultValue={profile.crop} /></label>
        <label>Growth stage<input defaultValue={profile.stage} /></label>
      </div>
      <p className="range-help">Each pair is minimum / maximum. Warning sits outside optimal, and critical sits outside warning.</p>
      <div className="target-list">{metricDefinitions.map((metric) => {
        const spread = metric.target[1] - metric.target[0]
        return <article key={`${profile.id}-${metric.key}`}>
          <div className="target-title"><strong>{metric.label}</strong><span>{metric.unit}</span></div>
          <div className="range-group" data-tone="optimal"><span>Optimal</span><input aria-label={`${metric.label} optimal minimum`} type="number" defaultValue={metric.target[0]} /><input aria-label={`${metric.label} optimal maximum`} type="number" defaultValue={metric.target[1]} /></div>
          <div className="range-group" data-tone="warning"><span>Warning</span><input aria-label={`${metric.label} warning minimum`} type="number" defaultValue={Number((metric.target[0] - spread * .35).toFixed(2))} /><input aria-label={`${metric.label} warning maximum`} type="number" defaultValue={Number((metric.target[1] + spread * .35).toFixed(2))} /></div>
          <div className="range-group" data-tone="critical"><span>Critical</span><input aria-label={`${metric.label} critical minimum`} type="number" defaultValue={Number((metric.target[0] - spread * .7).toFixed(2))} /><input aria-label={`${metric.label} critical maximum`} type="number" defaultValue={Number((metric.target[1] + spread * .7).toFixed(2))} /></div>
        </article>
      })}</div>
      <div className="editor-actions"><button className="primary-button" onClick={() => setSaved(true)}>Save profile targets</button>{saved && <span>Profile saved.</span>}</div>
    </section>
  </>
}
