import { describe,expect,it,vi } from 'vitest'
import { createMemoryRouter } from 'react-router'
import { leavingFarmEditor,saveFarmAndLeave } from './farmNavigation'

describe('navigation with unsaved farm changes',()=>{
  it('keeps Area/query selection in the editor, but blocks leaving for another page',()=>{
    expect(leavingFarmEditor({pathname:'/farm-plan'},{pathname:'/farm-plan'})).toBe(false)
    expect(leavingFarmEditor({pathname:'/farm-plan'},{pathname:'/nodes'})).toBe(true)
  })
  it('handles menu navigation, staying in the editor, and then saving before proceeding',async()=>{
    const router=createMemoryRouter([{path:'*',element:null}],{initialEntries:['/farm-plan']})
    try{
      router.getBlocker('farm',({currentLocation,nextLocation})=>leavingFarmEditor(currentLocation,nextLocation))
      await router.navigate('/nodes')
      expect(router.state.location.pathname).toBe('/farm-plan')
      const first=router.state.blockers.get('farm')!
      expect(first.state).toBe('blocked')
      first.reset!()
      expect(router.state.location.pathname).toBe('/farm-plan')
      await router.navigate('/areas')
      const blocked=router.state.blockers.get('farm')!
      await saveFarmAndLeave(async()=>false,()=>blocked.proceed!())
      expect(router.state.location.pathname).toBe('/farm-plan')
      await saveFarmAndLeave(async()=>true,()=>blocked.proceed!())
      await vi.waitFor(()=>expect(router.state.location.pathname).toBe('/areas'))
    }finally{router.dispose()}
  })
  it('also guards the history Back button and replace navigation',async()=>{
    const router=createMemoryRouter([{path:'*',element:null}],{initialEntries:['/','/farm-plan']})
    try{
      router.getBlocker('farm',()=>true)
      await router.navigate(-1)
      await vi.waitFor(()=>expect(router.state.blockers.get('farm')?.state).toBe('blocked'))
      expect(router.state.location.pathname).toBe('/farm-plan')
      router.state.blockers.get('farm')!.reset!()
      await router.navigate('/areas',{replace:true})
      expect(router.state.location.pathname).toBe('/farm-plan')
      router.state.blockers.get('farm')!.proceed!()
      await vi.waitFor(()=>expect(router.state.location.pathname).toBe('/areas'))
    }finally{router.dispose()}
  })
  it('never leaves on a failed save and proceeds only after the server has confirmed',async()=>{
    const leave=vi.fn()
    await expect(saveFarmAndLeave(async()=>{throw new Error('Offline')},leave)).rejects.toThrow('Offline')
    expect(leave).not.toHaveBeenCalled()
    const events:string[]=[]
    await saveFarmAndLeave(async()=>{events.push('saved');return true},()=>events.push('leave'))
    expect(events).toEqual(['saved','leave'])
  })
})
