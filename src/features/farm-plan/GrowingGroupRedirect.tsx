import { Navigate,useLocation } from 'react-router'
import { useDashboardState } from '../../state/dashboardStore'
export default function GrowingGroupRedirect(){
  const location=useLocation(),dashboard=useDashboardState(),query=new URLSearchParams(location.search),target=new URLSearchParams({cultivation:'1'})
  const area=query.get('area') || dashboard.context.areaId
  if(area)target.set('area',area)
  if(location.pathname!=='/sections')return null
  return <Navigate replace to={`/farm-plan?${target}`} />
}
