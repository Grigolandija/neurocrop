import { activeEquipmentInspectorSection,equipmentInspectorSections,type EquipmentInspector } from '../equipmentInspector'
import type { GreenhouseObject } from '../model'

export default function EquipmentInspectorTabs({object,inspector,lt,onChange}:{object:GreenhouseObject;inspector:EquipmentInspector;lt:boolean;onChange:(section:EquipmentInspector['section'])=>void}){
  const sections=equipmentInspectorSections(object),active=activeEquipmentInspectorSection(object,inspector.section)
  const labels={size:lt ? 'Matmenys' : 'Dimensions',position:lt ? 'Padėtis' : 'Position',mounting:object.type==='door' ? (lt ? 'Durys' : 'Door') : (lt ? 'Montavimas' : 'Mounting'),details:lt ? 'Nustatymai' : 'Settings'}
  return <nav className="gh-inspector-tabs" role="tablist" aria-label={lt ? 'Įrangos savybės' : 'Equipment properties'}>{sections.map((section,index)=><button type="button" role="tab" id={`${inspector.idPrefix}-tab-${section}`} aria-controls={`${inspector.idPrefix}-panel-${section}`} aria-selected={section===active} tabIndex={section===active ? 0 : -1} key={section} onClick={()=>onChange(section)} onKeyDown={event=>{
    const next=event.key==='ArrowRight' ? sections[(index+1)%sections.length] : event.key==='ArrowLeft' ? sections[(index+sections.length-1)%sections.length] : event.key==='Home' ? sections[0] : event.key==='End' ? sections.at(-1) : null
    if(!next)return
    event.preventDefault();onChange(next);document.getElementById(`${inspector.idPrefix}-tab-${next}`)?.focus()
  }}>{labels[section]}</button>)}</nav>
}
