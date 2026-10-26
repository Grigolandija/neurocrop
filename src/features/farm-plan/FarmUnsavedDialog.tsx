import { useEffect,useId,useRef,useState } from 'react'
import { saveFarmAndLeave } from './farmNavigation'
import './farm-unsaved-dialog.css'

type Props={lt:boolean;mode:'leave'|'reload';busy:boolean;canSave:boolean;onStay:()=>void;onLeave:()=>void;onSaved?:()=>void;onSave:()=>Promise<boolean>;onDownload:()=>void}
export default function FarmUnsavedDialog({lt,mode,busy,canSave,onStay,onLeave,onSaved,onSave,onDownload}:Props){
  const dialog=useRef<HTMLDialogElement>(null),title=useId(),description=useId(),pending=useRef(false)
  const [working,setWorking]=useState(false),[failed,setFailed]=useState(false)
  const locked=busy || working
  useEffect(()=>{
    const previous=document.activeElement instanceof HTMLElement ? document.activeElement : null
    const el=dialog.current;el?.showModal()
    return ()=>{el?.close();if(previous?.isConnected)previous.focus()}
  },[])
  return <dialog ref={dialog} className="nc-farm-unsaved-dialog" aria-labelledby={title} aria-describedby={description} aria-busy={locked} onCancel={event=>{event.preventDefault();if(!locked && !pending.current)onStay()}}>
    <h2 id={title}>{lt ? 'Neišsaugoti pakeitimai' : 'Unsaved changes'}</h2>
    <p id={description}>{mode==='reload' ? (lt ? 'Serverio versija pakeis dabartinį brėžinį ir jo juodraštį. Prieš tęsdami galite atsisiųsti savo darbą.' : 'The server version will replace this drawing and its draft. You can download your work before continuing.') : (lt ? 'Planas arba įrangos išdėstymas dar neišsaugotas serveryje. Išsaugokite prieš išeidami arba likite redaktoriuje.' : 'Your plan or equipment layout has not been saved to the server. Save before leaving, or stay in the editor.')}</p>
    {failed && <p className="nc-farm-unsaved-error" role="alert">{lt ? 'Išsaugoti nepavyko. Likote redaktoriuje; galite bandyti dar kartą arba atsisiųsti juodraštį.' : 'Saving failed. You are still in the editor; retry or download your draft.'}</p>}
    <button type="button" className="nc-farm-draft-download" onClick={onDownload}>{lt ? 'Atsisiųsti juodraštį' : 'Download draft'}</button>
    <footer><button type="button" disabled={locked} onClick={onStay} autoFocus>{lt ? 'Likti redaktoriuje' : 'Stay in editor'}</button><button type="button" disabled={locked} onClick={onLeave}>{mode==='reload' ? (lt ? 'Pakeisti serverio versija' : 'Replace with server version') : (lt ? 'Išeiti neišsaugojus' : 'Leave without saving')}</button>{mode==='leave' && <button type="button" className="nc-farm-save-leave" disabled={locked || !canSave} onClick={async()=>{
      if(pending.current)return
      pending.current=true;setWorking(true);setFailed(false)
      try{if(!await saveFarmAndLeave(onSave,onSaved || onLeave))setFailed(true)}catch{setFailed(true)}finally{pending.current=false;setWorking(false)}
    }}>{locked ? (lt ? 'Saugoma…' : 'Saving…') : (lt ? 'Išsaugoti ir išeiti' : 'Save and leave')}</button>}</footer>
  </dialog>
}
