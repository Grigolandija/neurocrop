import { useEffect,useId,useRef,useState } from 'react'

type Props={name:string;saved:boolean;objects:number;sections:number;nodes:number;lt:boolean;onCancel:()=>void;onConfirm:()=>Promise<void>}
export default function FarmAreaDeleteDialog({name,saved,objects,sections,nodes,lt,onCancel,onConfirm}:Props){
  const dialog=useRef<HTMLDialogElement>(null),title=useId(),description=useId()
  const [busy,setBusy]=useState(false),[error,setError]=useState('')
  const pending=useRef(false)
  useEffect(()=>{
    const el=dialog.current,previous=document.activeElement instanceof HTMLElement ? document.activeElement : null
    el?.showModal()
    return ()=>{el?.close();if(previous?.isConnected)previous.focus()}
  },[])
  return <dialog ref={dialog} className="nfa-delete-dialog" aria-labelledby={title} aria-describedby={description} aria-busy={busy} onCancel={event=>{event.preventDefault();if(!pending.current)onCancel()}} onClick={event=>{if(event.target===event.currentTarget && !pending.current)onCancel()}}>
    <form onSubmit={async event=>{
      event.preventDefault();if(pending.current)return
      pending.current=true;setBusy(true);setError('')
      try{await onConfirm()}catch(reason){setError(reason instanceof Error ? reason.message : (lt ? 'Area ištrinti nepavyko. Bandykite dar kartą.' : 'The Area could not be deleted. Try again.'))}
      finally{pending.current=false;setBusy(false)}
    }}>
      <header><span><i className="fa-solid fa-trash-can" aria-hidden="true" /></span><h2 id={title}>{lt ? 'Ištrinti' : 'Delete'} „{name}“?</h2></header>
      <p id={description}>{saved ? (lt ? 'Area bus ištrinta iš paskyros iškart po patvirtinimo. Jos kontūras, įrangos išdėstymas ir išdėstymo istorija bus pašalinti.' : 'The Area will be deleted from your account immediately after confirmation. Its outline, equipment layout and layout history will be removed.') : (lt ? 'Ši Area ir jos objektai bus pašalinti iš juodraščio. Pakeitimą galėsite atšaukti.' : 'This Area and its objects will be removed from your draft. You can undo this change.')}</p>
      <dl><div><dt>{lt ? 'Objektai plane' : 'Placed objects'}</dt><dd>{objects}</dd></div>{saved && <><div><dt>Sections</dt><dd>{sections}</dd></div><div><dt>Nodes</dt><dd>{nodes}</dd></div></>}</dl>
      {saved && <p className="nfa-delete-preserve"><i className="fa-solid fa-shield" aria-hidden="true" />{lt ? 'Sections, Nodes ir jutiklių matavimai nebus ištrinti. Sections ir Nodes liks paskyroje, nepriskirti šiai Area.' : 'Sections, Nodes and sensor measurements will be kept. Sections and Nodes will remain in your account, unassigned to this Area.'}</p>}
      {error && <p className="nfa-delete-error" role="alert">{error}</p>}
      <footer><button type="button" disabled={busy} onClick={onCancel}>{lt ? 'Atšaukti' : 'Cancel'}</button><button type="submit" className="nfa-delete-confirm" disabled={busy}>{busy ? (lt ? 'Trinama…' : 'Deleting…') : (lt ? 'Ištrinti Area' : 'Delete Area')}</button></footer>
    </form>
  </dialog>
}
