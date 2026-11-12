import { lazy } from 'react'
import { t } from '../i18n'
import type { BusinessWorkspace } from '../api/business'
import type { User } from '../api/client'
import { OrganizationsPanel } from '../features/business/OrganizationsPanel'
import { ClientsPanel } from '../features/business/ClientsPanel'
import { ClientProfilePage } from '../features/business/ClientProfilePage'
import { JobsPanel } from '../features/business/JobsPanel'
import { RequestPageLink } from '../features/business/RequestPageLink'
import type { useStudioNavigation } from './navigation'
import { defaultRoute } from './routes'
import type { StudioRoute } from './routes'
import { NotFound } from './NotFound'

const PlatformContacts = lazy(() => import('../features/platform/PlatformContacts').then(module => ({ default: module.PlatformContacts })))
const RegisteredAccounts = lazy(() => import('../features/platform/RegisteredAccounts').then(module => ({ default: module.RegisteredAccounts })))

export function StudioContent({ route, navigation, studio, user, staff, onExpired, onWorkspace, onRemoved, onNewWork, onOrganizationChange }: {
  route: StudioRoute; navigation: ReturnType<typeof useStudioNavigation>; studio: BusinessWorkspace; user: User; staff: boolean | null;
  onExpired: () => void; onWorkspace: (workspace: BusinessWorkspace) => void; onRemoved: (id: string) => void;
  onNewWork: (id: string) => void; onOrganizationChange: (id: string) => void
}) {
  const { navigate } = navigation
  if (route.view === 'not-found') return <NotFound studio />
  if (route.view === 'account') return null
  if (route.view === 'contacts' || route.view === 'accounts') {
    if (staff !== true) return <p role={staff === null ? 'status' : 'alert'}>{staff === null ? t('Verificando acceso…') : t('Acceso reservado a administración de Vision360.')}</p>
    return route.view === 'contacts'
      ? <PlatformContacts query={route.query} offset={route.offset} onFilter={query => navigate({ ...route, query, offset: 0 })} onPage={offset => navigate({ ...route, offset })} onExpired={onExpired} />
      : <RegisteredAccounts query={route.query} kind={route.kind} offset={route.offset} onFilter={(query, kind) => navigate({ ...route, query, kind, offset: 0 })} onPage={offset => navigate({ ...route, offset })} onExpired={onExpired} />
  }
  if (route.view === 'clients') {
    if (route.profileId) return <ClientProfilePage key={route.profileId} id={route.profileId} workspaceId={studio.id} onClose={() => navigate({ ...route, profileId: '' }, { force: true })} onExpired={onExpired} />
    return <ClientsPanel workspaceId={studio.id} query={route.query} kind={route.kind} onFilterChange={(query, kind) => navigate({ ...route, query, kind }, { replace: true, keepScroll: true })} onRemoved={onRemoved} onExpired={onExpired} />
  }
  if (route.view === 'jobs' || route.view === 'requests') {
    if (route.view === 'requests' && !(route.requestScope === 'platform' ? staff : studio.is_owner)) return <p role={staff === null ? 'status' : 'alert'}>{staff === null ? t('Verificando acceso…') : route.requestScope === 'platform' ? t('Las consultas de Vision360 están reservadas a la administración de la plataforma.') : t('Sólo el titular del estudio puede gestionar sus solicitudes.')}</p>
    return <>
      {route.view === 'requests' && staff && <div className="row-actions"><button className="btn-quiet" onClick={() => navigate({ ...defaultRoute, studioId: studio.id, view: 'requests', requestScope: route.requestScope === 'platform' ? 'studio' : 'platform' })}>{route.requestScope === 'platform' ? t('Solicitudes de mi estudio') : t('Consultas de Vision360')}</button></div>}
      {route.view === 'requests' && route.requestScope === 'studio' && studio.is_owner && <RequestPageLink workspace={studio} onChanged={onWorkspace} />}
      <JobsPanel workspaceId={studio.id} key={`${user.id}-${route.view}-${route.requestScope}`} initialCreate={route.creating} staff={staff === true} mode={route.view === 'requests' ? 'requests' : 'work'} requestWorkspaceId={route.requestScope === 'studio' ? studio.id : undefined} initialRequestId={route.requestId} onOpenWork={job => navigate({ ...defaultRoute, studioId: studio.id, view: 'jobs', jobId: job.id, organizationId: job.organization_id || '', step: 'visit' })} initialJobId={route.jobId} initialStep={route.step} initialFilter={route.status} initialOffset={route.offset} initialOrganizationId={route.organizationId} onOrganizationChange={onOrganizationChange} onRouteChange={(changes, replace = false) => navigate({ ...route, ...changes }, { replace, force: replace, keepScroll: replace })} onExpired={onExpired} />
    </>
  }
  return <OrganizationsPanel workspaceId={studio.id} canCreateClients={studio.is_owner} key={`${user.id}-${route.group}-${route.organizationId}-${route.tab}`} group={route.tab === 'tours' ? route.group : 'all'} onNewWork={onNewWork} initialOrganizationId={route.organizationId} initialTab={route.tab} initialTourId={route.tourId} autoSelect={false} onOpenOrganization={id => navigate({ ...route, organizationId: id, tourId: '' })} onDirectory={() => navigate({ ...route, organizationId: '', tourId: '', tab: 'tours' })} onTourChange={id => navigate({ ...route, tourId: id })} onOrganizationChange={onOrganizationChange} onSectionChange={tab => navigate({ ...route, tourId: '', tab: tab === 'properties' || tab === 'members' ? tab : 'tours' })} onExpired={onExpired} />
}
