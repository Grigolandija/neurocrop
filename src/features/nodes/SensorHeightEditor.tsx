import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { ModalPortal } from '../../components/ModalPortal'
import { translateInterfaceText as tx } from '../../i18n'

export default function SensorHeightEditor({ name, heightCm, busy, error, onClose, onSave }: {
  name: string; heightCm?: number | null; busy: boolean; error: string
  onClose: () => void; onSave: (height: number | null) => Promise<boolean>
}) {
  const [height,setHeight]=useState(heightCm == null ? '' : String(heightCm))
  const input=useRef<HTMLInputElement>(null)
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement | null
    input.current?.focus({preventScroll:true})
    return ()=>{if(previous?.isConnected)previous.focus({preventScroll:true})}
  },[])
  const value=height.trim()==='' ? null : Number(height)
  const valid=value===null || (Number.isFinite(value) && value>=0 && value<=10000)
  async function submit(e:FormEvent) { e.preventDefault(); if(valid && await onSave(value))onClose() }
  function keyboard(e:KeyboardEvent<HTMLElement>) {
    if(e.key==='Escape' && !busy){e.stopPropagation();onClose()}
    if(e.key!=='Tab')return
    const controls=Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)'))
    const first=controls[0],last=controls.at(-1)
    if(e.shiftKey && document.activeElement===first){e.preventDefault();last?.focus()}
    else if(!e.shiftKey && document.activeElement===last){e.preventDefault();first?.focus()}
  }
  return <ModalPortal><div className="nc-nodes-modal-layer"><button className="nc-nodes-modal-backdrop" tabIndex={-1} disabled={busy} onClick={onClose} aria-label={tx('Close')} /><section className="management-modal-shell nc-sensor-height-modal" role="dialog" aria-modal="true" aria-labelledby="sensor-height-title" onKeyDown={keyboard}>
    <header className="node-edit-modal-head"><div><p className="eyebrow">{name}</p><h2 id="sensor-height-title">{tx('Measurement height')}</h2></div><button type="button" className="node-edit-close" onClick={onClose} aria-label={tx('Close')}><i className="fa-solid fa-xmark" /></button></header>
    <form onSubmit={e=>void submit(e)}><p>{tx('Measure from the floor to the sensor itself. A connected sensor may be at a different height from the Node enclosure.')}</p><label className="node-edit-field"><span>{tx('Sensor height above floor, cm')}</span><input ref={input} type="number" min="0" max="10000" step="0.1" value={height} placeholder={tx('e.g. 150')} onChange={e=>setHeight(e.target.value)} /></label><small>{tx('Leave empty if unknown. An unknown height is not guessed in the 3D layout.')}</small>
      {error ? <p role="alert" className="management-modal-error">{error}</p> : null}
      <footer className="node-edit-footer"><button type="button" className="button-new secondary" onClick={onClose}>{tx('Cancel')}</button><button type="submit" className="button-new primary" disabled={busy || !valid}>{busy ? tx('Saving…') : tx('Save height')}</button></footer>
    </form>
  </section></div></ModalPortal>
}
