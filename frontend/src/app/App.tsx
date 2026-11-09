import { AccountActionPage } from '../features/auth/AccountActionPage'
import { Workspace } from './Workspace'
import { ViewerDemo } from '../viewer/ViewerDemo'
import { PublicTour } from '../features/tours/PublicTour'
import { StudioRequestPage } from '../features/commercial/StudioRequestPage'
import { Landing } from '../features/commercial/Landing'

export function App() {
  if (window.location.pathname === '/cuenta/email') return <AccountActionPage reset={false} changeEmail />
  if (['/cuenta/verificar', '/cuenta/restablecer'].includes(window.location.pathname)) return <AccountActionPage reset={window.location.pathname === '/cuenta/restablecer'} />
  if (window.location.pathname.startsWith('/solicitar/')) return <StudioRequestPage token={window.location.pathname.slice(11)} />
  if (window.location.pathname === '/inicio') return <Landing />
  if (window.location.pathname.startsWith('/tour/')) return <PublicTour slug={window.location.pathname.slice(6)} />
  return window.location.pathname === '/visor' ? <ViewerDemo /> : <Workspace />
}
