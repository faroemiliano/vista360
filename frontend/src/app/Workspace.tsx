import { useEffect, useState } from 'react'
import { getSession, logout } from '../api/client'
import type { SessionState } from '../api/client'
import { businessApi } from '../api/business'
import type { BusinessWorkspace, Organization } from '../api/business'
import { AuthForm } from '../features/auth/AuthForm'
import { Icon } from '../components/Icon'
import { BrandMark } from '../components/BrandMark'
import { OrganizationsPanel } from '../features/business/OrganizationsPanel'
import { ClientsPanel } from '../features/business/ClientsPanel'
import { JobsPanel } from '../features/business/JobsPanel'
import { StudioIdentity } from '../features/business/StudioIdentity'
import { defaultRoute, NavigationGuardContext, useStudioNavigation } from './navigation'
import type { StudioRoute } from './navigation'

type View = 'organizations' | 'jobs' | 'clients'

export function Workspace() {
  const [session, setSession] = useState<SessionState | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const navigation = useStudioNavigation()
  const { route } = navigation
  const view = route.view
  const [staff, setStaff] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [activeOrganizationId, setActiveOrganizationId] = useState('')
  const [studioState, setStudioState] = useState<{ userId: string; rows: BusinessWorkspace[]; selectedId: string } | null>(null)
  const [studioError, setStudioError] = useState('')
  const [studioVersion, setStudioVersion] = useState(0)
  const studios = studioState?.userId === session?.user?.id ? studioState?.rows || [] : []
  const activeStudio = studios.find((row) => row.id === (route.studioId || studioState?.selectedId))
  function goRoute(changes: Partial<StudioRoute>, options?: { replace?: boolean; force?: boolean; keepScroll?: boolean }) {
    const moved = navigation.navigate({ ...defaultRoute, studioId: activeStudio?.id || route.studioId, ...changes }, options)
    if (moved) setMobileMenuOpen(false)
    return moved
  }

  function selectStudio(id: string) {
    if (studios.some((row) => row.id === id) && goRoute({ studioId: id })) setActiveOrganizationId('')
  }
  function openPanel(next: View) {
    goRoute({ view: next, organizationId: next === 'jobs' ? activeOrganizationId : '' })
  }
  function navigateOrganization(org: string, tab: string) {
    if (tab === 'clients') { openPanel('clients'); return }
    goRoute({ view: 'organizations', organizationId: org, tab: tab === 'properties' || tab === 'members' ? tab : 'tours' })
  }
  function openOrganizations(group: 'companies' | 'individuals' = 'companies') {
    goRoute({ view: 'organizations', group })
  }
  function openClient(client: Organization) {
    if (goRoute({ view: 'organizations', organizationId: client.id, group: client.kind === 'individual' ? 'individuals' : 'companies' })) setActiveOrganizationId(client.id)
  }
  function clientJobs(id: string) {
    if (goRoute({ view: 'jobs', organizationId: id })) setActiveOrganizationId(id)
  }
  function newWork(org: string) {
    if (goRoute({ organizationId: org, creating: true })) setActiveOrganizationId(org)
  }
  function handleSession(next: SessionState) {
    setActiveOrganizationId(''); setMobileMenuOpen(false)
    if (!next.user) navigation.navigate({ ...defaultRoute }, { replace: true, force: true })
    setSession(next)
  }
  function refreshSession() {
    void getSession().then(setSession).catch((cause: Error) => setError(cause.message))
  }
  const activeSection = view === 'organizations' ? route.group === 'individuals' ? 'individuals' : 'organizations' : view
  function navigationProps(section: string) {
    const active = activeSection === section
    return {
      'aria-current': active ? 'page' as const : undefined,
      className: `mt-2 !w-full !justify-start !border-0 ${active ? '!bg-accent/12 !text-accent' : '!bg-transparent !text-white/70 hover:!bg-accent/5'}`,
    }
  }
  useEffect(() => {
    let active = true
    const userId = session?.user?.id
    setStudioError('')
    if (!userId) { setStudioState(null); return }
    businessApi.workspaces().then((rows) => {
      if (!active) return
      if (!rows.length) { setStudioError('No se encontró tu estudio. Volvé a iniciar sesión.'); return }
      setStudioState({ userId, rows, selectedId: rows.find((row) => row.is_owner)?.id || rows[0].id })
    }).catch((cause: Error) => { if (active) setStudioError(cause.message) })
    return () => { active = false }
  }, [session?.user?.id, studioVersion])
  useEffect(() => {
    if (!session?.user || studioState?.userId !== session.user.id || !studios.length) return
    const permitted = studios.find((row) => row.id === route.studioId)
    const preferred = permitted || studios.find((row) => row.is_owner) || studios[0]
    if (!permitted) navigation.navigate({ ...(route.studioId ? defaultRoute : route), studioId: preferred.id }, { replace: true, force: true, keepScroll: true })
  }, [studioState, session?.user?.id, route.studioId])
  useEffect(() => {
    let active = true
    setStaff(false)
    if (session?.user) businessApi.access().then((access) => { if (active) setStaff(access.platform_admin) }).catch(() => { if (active) setStaff(false) })
    return () => { active = false }
  }, [session?.user?.id])
  useEffect(() => {
    let active = true
    getSession().then((state) => { if (active) setSession(state) }).catch((cause: Error) => { if (active) setError(cause.message) })
    return () => { active = false }
  }, [])
  return <NavigationGuardContext.Provider value={navigation.register}><div className="min-h-screen lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
    <aside className="studio-sidebar flex flex-col bg-canvas px-5 py-5 text-white lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto lg:px-6 lg:py-8">
      <div className="flex items-center justify-between gap-3">
        <a href="/inicio" className="flex items-center gap-3 text-xl font-bold tracking-tight"><BrandMark className="size-10 shrink-0" />Vision360</a>
        <button className="!border-line !bg-transparent !px-3 lg:!hidden" aria-label={mobileMenuOpen ? 'Cerrar menú' : 'Abrir menú'} aria-expanded={mobileMenuOpen} aria-controls="studio-navigation" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}><Icon name="grid" className="size-4" /><span className="text-xs">Menú</span></button>
      </div>
      <nav id="studio-navigation" aria-label="Navegación principal" className={`${mobileMenuOpen ? 'block' : 'hidden'} mt-6 lg:mt-10 lg:block`}>
        <p className="mb-3 text-[10px] font-semibold tracking-[.2em] text-subtle">TU ESPACIO</p>
        <button {...navigationProps('jobs')} onClick={() => openPanel('jobs')}><Icon name="camera" />Trabajos</button>
        {session?.user && <>
          <button {...navigationProps('organizations')} onClick={() => openOrganizations()}><Icon name="globe" />Organizaciones</button>
          <button {...navigationProps('individuals')} onClick={() => openOrganizations('individuals')}><Icon name="camera" />Particulares</button>
          <button aria-label="Gestionar clientes" {...navigationProps('clients')} onClick={() => openPanel('clients')}><Icon name="link" />Clientes</button>
        </>}
            </nav>
      <div className="mt-auto hidden pt-10 lg:block">
        <div className="rounded-2xl border border-white/10 bg-surface-900/5 p-4"><Icon name="image" className="mb-3 size-6 text-accent" /><p className="text-sm font-semibold">Un espacio. Otra perspectiva.</p><p className="mt-2 text-xs leading-relaxed text-muted">Convertí tus fotos 360° en una visita que se puede recorrer.</p></div>
        <a href="/visor" className="mt-5 flex items-center gap-2 text-xs text-subtle hover:text-white"><Icon name="eye" className="size-4" />Abrir prueba del visor 360°</a>
      </div>
    </aside>
    <div className="min-w-0">
      <header className="studio-header flex min-h-20 flex-wrap items-center justify-between gap-3 border-b border-line/70 bg-surface-900/70 px-5 py-4 sm:px-8 lg:px-10">
        {activeStudio ? <StudioIdentity key={activeStudio.id} workspace={activeStudio} workspaces={studios} onSelect={selectStudio} onRenamed={(workspace) => setStudioState((current) => current ? { ...current, rows: current.rows.map((row) => row.id === workspace.id ? workspace : row) } : null)} /> : <div><p className="eyebrow">Tu estudio virtual</p><h1 className="mt-1 text-base font-semibold tracking-normal sm:text-base">Tu estudio de digitalización</h1></div>}
        {session?.user && <div className="account-bar flex min-w-0 items-center gap-3"><span className="hidden size-9 shrink-0 items-center justify-center rounded-full bg-accent/10 text-xs font-bold text-accent sm:flex">{session.user.email_normalized.slice(0, 2).toUpperCase()}</span><span className="max-w-44 truncate text-xs text-muted">{session.user.email_normalized}</span><button className="btn-quiet" disabled={busy} onClick={async () => {
          if (!navigation.canLeave()) return
          setBusy(true); setError('')
          try { handleSession(await logout()) }
          catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo cerrar sesión') }
          finally { setBusy(false) }
        }}><Icon name="exit" className="size-4" /><span>Cerrar sesión</span></button></div>}
      </header>
      <main tabIndex={-1} className="max-w-7xl py-6 outline-none lg:px-10 lg:py-9">
        {session?.user && activeStudio && <nav aria-label="Historial de navegación" className="mb-6 flex flex-wrap items-center gap-2">
          <button className="btn-quiet !min-h-9 !px-3 !py-1.5 !text-xs" disabled={!navigation.canBack} onClick={navigation.back}><Icon name="arrow" className="size-4 rotate-180" />Atrás</button>
          <button className="btn-quiet !min-h-9 !px-3 !py-1.5 !text-xs" disabled={!navigation.canForward} onClick={navigation.forward}>Adelante<Icon name="arrow" className="size-4" /></button>
          <span className="ml-auto text-xs text-muted">{view === 'jobs' ? route.jobId ? 'Trabajos / Detalle' : route.creating ? 'Trabajos / Nuevo trabajo' : 'Trabajos' : view === 'clients' ? 'Clientes' : `${route.group === 'individuals' ? 'Particulares' : 'Organizaciones'}${route.organizationId ? ' / Recorridos' : ''}`}</span>
        </nav>}
        {error && <p role="alert">{error}</p>}
        {!session && !error && <p role="status">Cargando sesión…</p>}
        {!session && error && <button onClick={() => { setError(''); refreshSession() }}>Reintentar conexión</button>}
        {session && (session.user ? activeStudio ? <div key={`${session.user.id}-${activeStudio.id}`}>
          {view === 'clients' ? <ClientsPanel workspaceId={activeStudio.id} query={route.query} kind={route.kind} onFilterChange={(query, kind) => navigation.navigate({ ...route, query, kind }, { replace: true, keepScroll: true })} key={session.user.id} onOpen={openClient} onJobs={clientJobs} onRemoved={(id) => { if (activeOrganizationId === id) setActiveOrganizationId('') }} onExpired={refreshSession} /> : view === 'jobs' ? <JobsPanel workspaceId={activeStudio.id} key={session.user.id} initialCreate={route.creating} staff={staff} initialJobId={route.jobId} initialStep={route.step} initialFilter={route.status} initialOffset={route.offset} initialOrganizationId={route.organizationId} onOrganizationChange={setActiveOrganizationId} onRouteChange={(changes, replace = false) => navigation.navigate({ ...route, ...changes }, { replace, force: replace, keepScroll: replace })} onExpired={refreshSession} onNavigate={navigateOrganization} />
              : <OrganizationsPanel workspaceId={activeStudio.id} canCreateClients={activeStudio.is_owner} key={`${session.user.id}-${route.group}-${route.organizationId}-${route.tab}`} group={route.tab === 'tours' ? route.group : 'all'} onNewWork={newWork} initialOrganizationId={route.organizationId} initialTab={route.tab} initialTourId={route.tourId} autoSelect={false} onOpenOrganization={(id) => navigation.navigate({ ...route, organizationId: id, tourId: '' })} onDirectory={() => navigation.navigate({ ...route, organizationId: '', tourId: '', tab: 'tours' })} onTourChange={(id) => navigation.navigate({ ...route, tourId: id })} onOrganizationChange={setActiveOrganizationId} onSectionChange={(tab) => navigation.navigate({ ...route, tourId: '', tab: tab === 'properties' || tab === 'members' ? tab : 'tours' })} onExpired={refreshSession} />}
        </div> : studioError ? <div role="alert"><p>{studioError}</p><button className="mt-3" onClick={() => setStudioVersion((value) => value + 1)}>Reintentar estudio</button></div> : <p role="status">Abriendo tu estudio…</p> : <AuthForm onSession={handleSession} />)}
      </main>
    </div>
  </div></NavigationGuardContext.Provider>
}
