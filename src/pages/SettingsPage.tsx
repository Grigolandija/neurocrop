import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

export function SettingsPage() {
  const [notice, setNotice] = useState('')
  function save(event: FormEvent) {
    event.preventDefault()
    setNotice('Settings saved in this browser workspace.')
  }

  return <>
    <header className="surface rounded-[30px] p-5 md:p-6 flex items-end justify-between gap-4"><div><p className="text-[11px] uppercase tracking-[0.28em] text-pine/56">Workspace settings</p><h1 className="mt-1.5 font-display text-[1.65rem] font-bold text-ink">Settings</h1><p className="mt-2 text-sm leading-6 text-ink/66">Manage agronomic rules, people, notifications and organization preferences.</p></div><Link className="primary-link" to="/crop-profiles">Manage crop profiles</Link></header>
    {notice && <div className="success-notice">{notice}</div>}
    <form className="settings-grid" onSubmit={save}>
      <section className="settings-card"><p className="eyebrow">Crop profiles</p><h2>Targets by crop and stage</h2><p>Profiles control scores, alert thresholds and Trends target ranges.</p><Link to="/crop-profiles">Open crop profiles →</Link></section>
      <section className="settings-card"><p className="eyebrow">Alert rules</p><h2>Deviation rules</h2><label>Warning delay<select defaultValue="30"><option value="15">15 minutes</option><option value="30">30 minutes</option><option value="60">1 hour</option></select></label><label>Critical delay<select defaultValue="60"><option value="30">30 minutes</option><option value="60">1 hour</option><option value="120">2 hours</option></select></label></section>
      <section className="settings-card"><p className="eyebrow">Notifications</p><h2>Who gets notified</h2><label>Email recipients<input defaultValue="admin@neurocrop.lt" /></label><label className="check"><input type="checkbox" defaultChecked />Critical alerts bypass quiet hours</label></section>
      <section className="settings-card"><p className="eyebrow">Team & access</p><h2>Workspace roles</h2><label>Default new member role<select><option>Grower</option><option>Technician</option><option>View only</option></select></label><label className="check"><input type="checkbox" defaultChecked />Growers can acknowledge alerts</label></section>
      <section className="settings-card"><p className="eyebrow">Units & time</p><h2>Regional preferences</h2><label>Temperature<select><option>Celsius (°C)</option><option>Fahrenheit (°F)</option></select></label><label>Time zone<select><option>Europe/Vilnius</option></select></label></section>
      <section className="settings-card"><p className="eyebrow">Data retention</p><h2>History storage</h2><label>Raw sensor data<select><option>12 months</option><option>24 months</option><option>36 months</option></select></label><label>Aggregated history<select><option>Keep indefinitely</option><option>5 years</option></select></label></section>
      <section className="settings-card"><p className="eyebrow">Organization</p><h2>Farm workspace</h2><label>Organization name<input defaultValue="NeuroCrop Demo Farm" /></label><label>Billing email<input defaultValue="admin@neurocrop.lt" /></label></section>
      <section className="settings-card"><p className="eyebrow">Account</p><h2>Personal preferences</h2><label>Display name<input defaultValue="Admin" /></label><label className="check"><input type="checkbox" defaultChecked />Weekly growing conditions summary</label></section>
      <button className="primary-button settings-save">Save settings</button>
    </form>
  </>
}
