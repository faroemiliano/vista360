import { t, useLanguage } from '../i18n'
import { lazy, Suspense } from 'react'
import { AccountActionPage } from '../features/auth/AccountActionPage'
import { Workspace } from './Workspace'
import { resolvePage } from './routes'
import { NotFound } from './NotFound'
import { FloatingWhatsApp } from '../components/FloatingWhatsApp'
import { ViewerDemo } from '../viewer/ViewerDemo'
import { PublicTour } from '../features/tours/PublicTour'
import { StudioRequestPage } from '../features/commercial/StudioRequestPage'
const Landing = lazy(() => import('../features/commercial/Landing').then(module => ({ default: module.Landing })))

export function App() {
  useLanguage()
  return <><CurrentPage />{resolvePage(window.location.pathname) !== 'embed' && <FloatingWhatsApp />}</>
}

function CurrentPage() {
  const path = window.location.pathname
  switch (resolvePage(path)) {
    case 'email': return <AccountActionPage reset={false} changeEmail />
    case 'verify': return <AccountActionPage reset={false} />
    case 'reset': return <AccountActionPage reset />
    case 'request': return <StudioRequestPage token={path.slice(11)} />
    case 'landing': return <Suspense fallback={<p role="status">{t('Cargando')}</p>}><Landing /></Suspense>
    case 'tour': return <PublicTour slug={path.slice(6)} />
    case 'embed': return <PublicTour slug={path.slice(7)} embedded />
    case 'viewer': return <ViewerDemo />
    case 'studio': return <Workspace />
    default: return <main className="py-10"><NotFound /></main>
  }
}
