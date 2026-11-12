import { publicPlan } from '../features/subscriptions/selection'
import type { PublicPlanCode } from '../features/subscriptions/selection'
import { workSteps } from '../components/WorkSteps'
import type { WorkStep } from '../components/WorkSteps'

export type StudioRoute = {
  view: 'jobs' | 'organizations' | 'clients' | 'requests' | 'accounts' | 'contacts' | 'account' | 'not-found'; requestId: string; requestScope: 'studio' | 'platform'; group: 'companies' | 'individuals';
  selectedPlan: PublicPlanCode | ''; studioId: string; organizationId: string; jobId: string; step: WorkStep;
  creating: boolean; tab: 'tours' | 'properties' | 'members'; tourId: string;
  profileId: string; accountTab: 'profile' | 'access' | 'plan'; notFoundPath: string;
  query: string; kind: string; status: string; offset: number;
}
export const defaultRoute: StudioRoute = {
  view: 'jobs', selectedPlan: '', requestId: '', requestScope: 'studio', group: 'companies', studioId: '', organizationId: '', jobId: '', step: 'visit',
  profileId: '', accountTab: 'profile', notFoundPath: '', creating: false, tab: 'tours', tourId: '', query: '', kind: 'all', status: '', offset: 0,
}
const uuid = (value: string | null) => value && /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(value) ? value : ''
export function readRoute(href = window.location.href): StudioRoute {
  const url = new URL(href)
  const parts = url.pathname.split('/').filter(Boolean)
  const sections: Record<string, StudioRoute['view']> = { trabajos: 'jobs', organizaciones: 'organizations', particulares: 'organizations', clientes: 'clients', solicitudes: 'requests', usuarios: 'accounts', consultas: 'contacts', 'mi-cuenta': 'account' }
  let view: StudioRoute['view'] = sections[parts[1]] || 'not-found'
  if (!parts.length || (parts[0] === 'studio' && parts.length === 1)) view = 'jobs'
  const detail = parts[2]
  const validDetail = view === 'jobs' || view === 'clients' ? Boolean(uuid(detail || null))
    : view === 'account' && ['perfil', 'seguridad', 'plan'].includes(detail)
  if (parts.length > 3 || (detail && !validDetail) || (parts.length && parts[0] !== 'studio')) view = 'not-found'
  const step = url.searchParams.get('paso')
  const tab = url.searchParams.get('vista')
  const offset = Number(url.searchParams.get('pagina') || 0)
  return { ...defaultRoute, selectedPlan: view === 'not-found' ? '' : publicPlan(url.searchParams.get('plan')), view, profileId: view === 'clients' ? uuid(detail || null) : '', accountTab: detail === 'plan' ? 'plan' : detail === 'seguridad' ? 'access' : 'profile', notFoundPath: view === 'not-found' ? url.pathname : '', requestScope: url.searchParams.get('origen') === 'vision360' || (url.searchParams.has('solicitud') && !url.searchParams.has('estudio')) ? 'platform' : 'studio', requestId: view === 'requests' ? uuid(url.searchParams.get('solicitud')) : '', group: parts[1] === 'particulares' ? 'individuals' : 'companies',
    studioId: uuid(url.searchParams.get('estudio')), organizationId: uuid(url.searchParams.get('cliente')),
    jobId: view === 'jobs' ? uuid(parts[2] || null) : '',
    step: workSteps.some(([id]) => id === step) ? step as WorkStep : 'visit',
    creating: view === 'jobs' && url.searchParams.get('nuevo') === '1',
    tab: tab === 'properties' || tab === 'members' ? tab : 'tours',
    tourId: view === 'organizations' ? uuid(url.searchParams.get('recorrido')) : '',
    query: url.searchParams.get('buscar') || '', kind: ['individual', 'organization', 'company'].includes(url.searchParams.get('tipo') || '') ? url.searchParams.get('tipo')! : 'all',
    status: url.searchParams.get('estado') || '', offset: Number.isSafeInteger(offset) && offset >= 0 ? offset * 50 : 0,
  }
}
export function routeUrl(route: StudioRoute) {
  const section = route.view === 'account' ? 'mi-cuenta' : route.view === 'contacts' ? 'consultas' : route.view === 'accounts' ? 'usuarios' : route.view === 'requests' ? 'solicitudes' : route.view === 'jobs' ? 'trabajos' : route.view === 'clients' ? 'clientes' : route.group === 'individuals' ? 'particulares' : 'organizaciones'
  const query = new URLSearchParams()
  if (route.selectedPlan) query.set('plan', route.selectedPlan)
  if (route.studioId) query.set('estudio', route.studioId)
  if (route.organizationId) query.set('cliente', route.organizationId)
  if (route.view === 'requests') {
    if (route.requestScope === 'platform') query.set('origen', 'vision360')
    if (route.requestId) query.set('solicitud', route.requestId)
  } else if (route.view === 'jobs') {
    if (route.jobId) query.set('paso', route.step)
    else if (route.creating) query.set('nuevo', '1')
    if (route.status) query.set('estado', route.status)
    if (route.offset) query.set('pagina', String(route.offset / 50))
  } else if (route.view === 'organizations') {
    if (route.tab !== 'tours') query.set('vista', route.tab)
    if (route.tourId) query.set('recorrido', route.tourId)
  } else {
    if (route.query) query.set('buscar', route.query)
    if (route.kind !== 'all') query.set('tipo', route.kind)
    if ((route.view === 'accounts' || route.view === 'contacts') && route.offset) query.set('pagina', String(route.offset / 50))
  }
  const suffix = route.view === 'account' ? `/${{ profile: 'perfil', access: 'seguridad', plan: 'plan' }[route.accountTab]}` : route.view === 'clients' && route.profileId ? `/${route.profileId}` : ''
  if (route.view === 'not-found') return `/${route.notFoundPath.replace(/^\/+/, '')}${query.size ? `?${query}` : ''}`
  return `/studio/${section}${suffix}${route.view === 'jobs' && route.jobId ? `/${route.jobId}` : ''}${query.size ? `?${query}` : ''}`
}


export function resolvePage(path: string) {
  if (path === '/' || path === '/studio' || path.startsWith('/studio/')) return 'studio'
  if (path === '/inicio') return 'landing'
  if (path === '/visor') return 'viewer'
  if (/^\/tour\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(path)) return 'tour'
  if (/^\/embed\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(path)) return 'embed'
  if (/^\/solicitar\/[^/]+$/.test(path)) return 'request'
  if (path === '/cuenta/email') return 'email'
  if (path === '/cuenta/verificar') return 'verify'
  if (path === '/cuenta/restablecer') return 'reset'
  return 'not-found'
}
