import { Workspace } from './Workspace'
import { ViewerDemo } from '../viewer/ViewerDemo'
import { PublicTour } from '../features/tours/PublicTour'
import { Landing } from '../features/commercial/Landing'

export function App() {
  if (window.location.pathname === '/inicio') return <Landing />
  if (window.location.pathname.startsWith('/tour/')) return <PublicTour slug={window.location.pathname.slice(6)} />
  return window.location.pathname === '/visor' ? <ViewerDemo /> : <Workspace />
}
