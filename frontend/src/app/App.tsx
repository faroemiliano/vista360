import { t, useLanguage } from '../i18n'
import { lazy, Suspense } from 'react'
import { AccountActionPage } from '../features/auth/AccountActionPage'
import { Workspace } from './Workspace'
import { ViewerDemo } from '../viewer/ViewerDemo'
import { PublicTour } from '../features/tours/PublicTour'
import { StudioRequestPage } from '../features/commercial/StudioRequestPage'
const Landing = lazy(() => import('../features/commercial/Landing').then(module => ({ default: module.Landing })))

export function App() {
  useLanguage()
  if (window.location.pathname === '/cuenta/email') return <AccountActionPage reset={false} changeEmail />
  if (['/cuenta/verificar', '/cuenta/restablecer'].includes(window.location.pathname)) return <AccountActionPage reset={window.location.pathname === '/cuenta/restablecer'} />
  if (window.location.pathname.startsWith('/solicitar/')) return <StudioRequestPage token={window.location.pathname.slice(11)} />
  if (window.location.pathname === '/inicio') return <Suspense fallback={<p role="status">{t('Cargando')}</p>}><Landing /></Suspense>
  if (window.location.pathname.startsWith('/tour/')) return <PublicTour slug={window.location.pathname.slice(6)} />
  return window.location.pathname === '/visor' ? <ViewerDemo /> : <Workspace />
}
