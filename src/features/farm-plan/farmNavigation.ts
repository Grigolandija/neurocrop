export const leavingFarmEditor=(current:{pathname:string},next:{pathname:string})=>current.pathname!==next.pathname

/** Never proceed, discard a draft, or silently leave when a save fails. */
export async function saveFarmAndLeave(save:()=>Promise<boolean>,leave:()=>void){
  if(!await save())return false
  leave()
  return true
}
