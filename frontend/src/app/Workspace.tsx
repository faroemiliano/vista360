import { LanguageSwitcher } from '../i18n/LanguageSwitcher'
import { t } from '../i18n'
import { Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { getSession, logout } from '../api/client'
import type { SessionState } from '../api/client'
import { businessApi } from '../api/business'
import type { BusinessWorkspace } from '../api/business'
import { VerificationPending } from '../features/auth/AccountSecurity'
import { PlanReminder } from '../features/subscriptions/PlanReminder'
import { MyAccount } from '../features/auth/MyAccount'
import { UserAvatar } from '../features/auth/UserAvatar'
import { AuthForm } from '../features/auth/AuthForm'
import { Icon } from '../components/Icon'
import { StudioIdentity } from '../features/business/StudioIdentity'
import { defaultRoute, NavigationGuardContext, useStudioNavigation } from './navigation'
import type { StudioRoute } from './navigation'

import { NotFound } from './NotFound'
import { StudioSidebar } from './StudioSidebar'
import { StudioContent } from './StudioContent'
import { StudioLink, StudioNavigationContext } from './StudioLink'

export function Workspace() {
  const [session, setSession] = useState<SessionState | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const verificationPending = Boolean(session?.user?.email_verification_required && !session?.user?.email_verified_at)
  const navigation = useStudioNavigation()
  const { route } = navigation
  const view = route.view
  const securityOpen = view === 'account'
  const accountReturn = useRef<StudioRoute>({ ...defaultRoute, studioId: route.studioId })
  const [staff, setStaff] = useState<boolean | null>(null)
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
  function newWork(org: string) {
    if (goRoute({ organizationId: org, creating: true })) setActiveOrganizationId(org)
  }
  function handleSession(next: SessionState) {
    setActiveOrganizationId(''); setMobileMenuOpen(false)
    if (!next.user) navigation.navigate({ ...defaultRoute }, { replace: true, force: true })
    setSession(next)
  }
  async function signOut() {
    if (!navigation.canLeave()) return
    setBusy(true); setError('')
    try { handleSession(await logout()) }
    catch (cause) { setError(cause instanceof Error ? cause.message : t("No se pudo cerrar sesión")) }
    finally { setBusy(false) }
  }
  function refreshSession() {
    void getSession().then(setSession).catch((cause: Error) => setError(cause.message))
  }
  useEffect(() => {
    if (session?.user && !verificationPending && route.selectedPlan && view !== 'account') {
      navigation.navigate({ ...route, view: 'account', accountTab: 'plan' }, { replace: true, force: true })
    }
  }, [session?.user?.id, verificationPending, route.selectedPlan, view])
  useLayoutEffect(() => { setMobileMenuOpen(false) }, [view, route.group, route.profileId, route.accountTab, route.jobId, route.tourId])
  useEffect(() => { if (view !== 'account') accountReturn.current = route }, [route, view])
  function closeAccount() {
    navigation.navigate({ ...accountReturn.current, studioId: activeStudio?.id || route.studioId, selectedPlan: '' }, { force: true })
  }
  function updateWorkspace(workspace: BusinessWorkspace) {
    setStudioState(current => current ? { ...current, rows: current.rows.map(row => row.id === workspace.id ? workspace : row) } : null)
  }
  useEffect(() => {
    let active = true
    const userId = session?.user?.id
    setStudioError('')
    if (!userId || verificationPending) { setStudioState(null); return }
    businessApi.workspaces().then((rows) => {
      if (!active) return
      if (!rows.length) { setStudioError(t("No se encontró tu estudio. Volvé a iniciar sesión.")); return }
      setStudioState({ userId, rows, selectedId: rows.find((row) => row.is_owner)?.id || rows[0].id })
    }).catch((cause: Error) => { if (active) setStudioError(cause.message) })
    return () => { active = false }
  }, [session?.user?.id, studioVersion, verificationPending])
  useEffect(() => {
    if (!session?.user || studioState?.userId !== session.user.id || !studios.length) return
    const permitted = studios.find((row) => row.id === route.studioId)
    const preferred = permitted || studios.find((row) => row.is_owner) || studios[0]
    if (!permitted) navigation.navigate({ ...(route.studioId ? defaultRoute : route), studioId: preferred.id }, { replace: true, force: true, keepScroll: true })
  }, [studioState, session?.user?.id, route.studioId])
  useEffect(() => {
    let active = true
    setStaff(null)
    if (session?.user && !verificationPending) businessApi.access().then((access) => { if (active) setStaff(access.platform_admin) }).catch(() => { if (active) setStaff(false) })
    return () => { active = false }
  }, [session?.user?.id, verificationPending])
  useEffect(() => {
    let active = true
    getSession().then((state) => { if (active) setSession(state) }).catch((cause: Error) => { if (active) setError(cause.message) })
    return () => { active = false }
  }, [])
  const linkNavigation = { ...navigation, navigate: (...args: Parameters<typeof navigation.navigate>) => {
    const moved = navigation.navigate(...args)
    if (moved) setMobileMenuOpen(false)
    return moved
  } }
  if (verificationPending && session?.user) return <main className="py-10"><LanguageSwitcher /><VerificationPending user={session.user} onSession={handleSession} /></main>
  return <NavigationGuardContext.Provider value={navigation.register}><StudioNavigationContext.Provider value={linkNavigation}><div className="min-h-screen lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
    <StudioSidebar route={route} signedIn={Boolean(session?.user)} staff={staff === true} owner={Boolean(activeStudio?.is_owner)} organizationId={activeOrganizationId} open={mobileMenuOpen} onToggle={() => setMobileMenuOpen(value => !value)} />
    <div className="min-w-0">
      <header className="studio-header flex min-h-20 flex-wrap items-center justify-between gap-3 border-b border-line/70 bg-surface-900/70 px-5 py-4 sm:px-8 lg:px-10">
        {activeStudio ? <StudioIdentity key={activeStudio.id} workspace={activeStudio} workspaces={studios} onSelect={selectStudio} onRenamed={updateWorkspace} /> : <div><p className="eyebrow">{t("Tu estudio virtual")}</p><h1 className="mt-1 text-base font-semibold tracking-normal sm:text-base">{t("Tu estudio de digitalización")}</h1></div>}
        <LanguageSwitcher />
        {session?.user && <div className="account-bar flex min-w-0 items-center gap-3"><StudioLink reset to={{ view: 'account', accountTab: 'profile' }} className="nav-action btn-quiet min-w-0 !px-2" aria-label={t("Mi cuenta")}><UserAvatar user={session.user} /><span className="min-w-0 text-left"><span className="block max-w-40 truncate text-sm">{session.user.display_name || session.user.email_normalized}</span><span className="block text-xs text-muted">{t("Mi cuenta")}</span></span></StudioLink><button className="btn-quiet" disabled={busy} onClick={() => void signOut()}><Icon name="exit" className="size-4" /><span>{t("Cerrar sesión")}</span></button></div>}
      </header>
      <main tabIndex={-1} className="studio-main max-w-7xl py-6 outline-none lg:px-10 lg:py-9">
        {session?.user && activeStudio && <nav aria-label={t("Historial de navegación")} className="mb-6 flex flex-wrap items-center gap-2">
          <button className="btn-quiet !min-h-9 !px-3 !py-1.5 !text-xs" disabled={!navigation.canBack} onClick={navigation.back}><Icon name="arrow" className="size-4 rotate-180" />{t("Atrás")}</button>
          <button className="btn-quiet !min-h-9 !px-3 !py-1.5 !text-xs" disabled={!navigation.canForward} onClick={navigation.forward}>{t("Adelante")}<Icon name="arrow" className="size-4" /></button>
          <span className="ml-auto text-xs text-muted">{view === 'account' ? t("Mi cuenta") : view === 'not-found' ? t("Página no encontrada") : view === 'contacts' ? t("Consultas del sistema") : view === 'accounts' ? t("Administración / Usuarios registrados") : view === 'requests' ? route.requestScope === 'platform' ? t("Consultas de Vision360") : t("Solicitudes web") : view === 'jobs' ? route.jobId ? t("Trabajos / Detalle") : route.creating ? t("Trabajos / Nuevo trabajo") : t("Trabajos") : view === 'clients' ? t("Clientes") : `${route.group === 'individuals' ? t("Particulares") : t("Organizaciones")}${route.organizationId ? ' / Recorridos' : ''}`}</span>
        </nav>}
        {session?.user && activeStudio?.is_owner && <PlanReminder key={`recordatorio-${session.user.id}-${activeStudio.id}`} workspaceId={activeStudio.id} refreshKey={securityOpen} onOpen={() => goRoute({ view: 'account', accountTab: 'plan' })} />}
        {error && <p role="alert">{t(error)}</p>}
        {!session && !error && <p role="status">{t("Cargando sesión…")}</p>}
        {!session && error && <button onClick={() => { setError(''); refreshSession() }}>{t("Reintentar conexión")}</button>}
        {session && (view === 'not-found' ? <NotFound studio /> : session.user ? activeStudio ? <div key={`${session.user.id}-${activeStudio.id}`}>
          <Suspense fallback={<p role="status">{t("Cargando")}</p>}><StudioContent route={route} navigation={navigation} studio={activeStudio} user={session.user} staff={staff} onExpired={refreshSession} onWorkspace={updateWorkspace} onRemoved={id => { if (activeOrganizationId === id) setActiveOrganizationId('') }} onNewWork={newWork} onOrganizationChange={setActiveOrganizationId} /></Suspense>
        </div> : studioError ? <div role="alert"><p>{t(studioError)}</p><button className="mt-3" onClick={() => setStudioVersion((value) => value + 1)}>{t("Reintentar estudio")}</button></div> : <p role="status">{t("Abriendo tu estudio…")}</p> : <AuthForm onSession={handleSession} selectedPlan={route.selectedPlan} initialMode={route.selectedPlan || new URLSearchParams(window.location.search).get('registro') === '1' ? 'register' : 'login'} />)}
      </main>
    </div>
    {securityOpen && session?.user && <MyAccount user={session.user} onClose={closeAccount} tab={route.accountTab} selectedPlan={route.selectedPlan} onSession={setSession} onLogout={signOut} onUser={user => setSession(current => current ? { ...current, user } : current)} />}
  </div></StudioNavigationContext.Provider></NavigationGuardContext.Provider>
}
