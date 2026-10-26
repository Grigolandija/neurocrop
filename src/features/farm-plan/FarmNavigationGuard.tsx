import { useCallback } from 'react'
import { useBlocker } from 'react-router'
import FarmUnsavedDialog from './FarmUnsavedDialog'
import { leavingFarmEditor } from './farmNavigation'

export default function FarmNavigationGuard({dirty,saving,canSave,lt,onSave,onPreserve,onDownload}:{dirty:boolean;saving:boolean;canSave:boolean;lt:boolean;onSave:()=>Promise<boolean>;onPreserve:()=>void;onDownload:()=>void}){
  const blocker=useBlocker(useCallback(({currentLocation,nextLocation})=>(dirty || saving) && leavingFarmEditor(currentLocation,nextLocation),[dirty,saving]))
  return blocker.state==='blocked' ? <FarmUnsavedDialog lt={lt} mode="leave" busy={saving} canSave={canSave} onStay={()=>blocker.reset()} onLeave={()=>{onPreserve();blocker.proceed()}} onSaved={()=>blocker.proceed()} onSave={onSave} onDownload={onDownload} /> : null
}
