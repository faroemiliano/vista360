import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { publicPlan } from '../features/subscriptions/selection'
import type { PublicPlanCode } from '../features/subscriptions/selection'
import { workSteps } from '../components/WorkSteps'
import type { WorkStep } from '../components/WorkSteps'

export type StudioRoute = {
  view: 'jobs' | 'organizations' | 'clients' | 'requests' | 'accounts'; requestId: string; requestScope: 'studio' | 'platform'; group: 'companies' | 'individuals';
  selectedPlan: PublicPlanCode | ''; studioId: string; organizationId: string; jobId: string; step: WorkStep;
  creating: boolean; tab: 'tours' | 'properties' | 'members'; tourId: string;
  query: string; kind: string; status: string; offset: number;
}
export const defaultRoute: StudioRoute = {
  view: 'jobs', selectedPlan: '', requestId: '', requestScope: 'studio', group: 'companies', studioId: '', organizationId: '', jobId: '', step: 'visit',
  creating: false, tab: 'tours', tourId: '', query: '', kind: 'all', status: '', offset: 0,
}
const uuid = (value: string | null) => value && /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(value) ? value : ''
function readRoute(): StudioRoute {
  const url = new URL(window.location.href)
  const parts = url.pathname.split('/').filter(Boolean)
  const view = parts[1] === 'usuarios' ? 'accounts' : parts[1] === 'solicitudes' ? 'requests' : parts[1] === 'clientes' ? 'clients' : ['organizaciones', 'particulares'].includes(parts[1]) ? 'organizations' : 'jobs'
  const step = url.searchParams.get('paso')
  const tab = url.searchParams.get('vista')
  const offset = Number(url.searchParams.get('pagina') || 0)
  return { ...defaultRoute, selectedPlan: publicPlan(url.searchParams.get('plan')), view, requestScope: url.searchParams.get('origen') === 'vision360' || (url.searchParams.has('solicitud') && !url.searchParams.has('estudio')) ? 'platform' : 'studio', requestId: view === 'requests' ? uuid(url.searchParams.get('solicitud')) : '', group: parts[1] === 'particulares' ? 'individuals' : 'companies',
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
  const section = route.view === 'accounts' ? 'usuarios' : route.view === 'requests' ? 'solicitudes' : route.view === 'jobs' ? 'trabajos' : route.view === 'clients' ? 'clientes' : route.group === 'individuals' ? 'particulares' : 'organizaciones'
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
    if (route.view === 'accounts' && route.offset) query.set('pagina', String(route.offset / 50))
  }
  return `/studio/${section}${route.view === 'jobs' && route.jobId ? `/${route.jobId}` : ''}${query.size ? `?${query}` : ''}`
}

type Entry = { id: string; index: number; scroll: number }
function entry(): Entry | undefined { return window.history.state?.vision360Navigation }
function maxIndex(id: string, fallback: number) {
  try { return Math.max(fallback, Number(sessionStorage.getItem(`vision360-history:${id}`)) || 0) } catch { return fallback }
}
function rememberMax(id: string, index: number) {
  try { sessionStorage.setItem(`vision360-history:${id}`, String(index)) } catch { /* Historial funcional también sin almacenamiento. */ }
}
type Guard = (discard?: boolean) => boolean
export const NavigationGuardContext = createContext<((guard: Guard) => () => void) | null>(null)

export function useBlockNavigation(dirty: boolean, onDiscard?: () => void) {
  const register = useContext(NavigationGuardContext)
  const dirtyRef = useRef(dirty)
  const discardRef = useRef(onDiscard)
  dirtyRef.current = dirty
  discardRef.current = onDiscard
  useEffect(() => register?.((discard) => { if (discard) discardRef.current?.(); return dirtyRef.current }), [register])
}

export function useNavigationDirty(): [boolean, Dispatch<SetStateAction<boolean>>] {
  const register = useContext(NavigationGuardContext)
  const [dirty, setState] = useState(false)
  const dirtyRef = useRef(false)
  useEffect(() => register?.(() => dirtyRef.current), [register])
  const setDirty = useCallback<Dispatch<SetStateAction<boolean>>>((next) => {
    const value = typeof next === 'function' ? next(dirtyRef.current) : next
    dirtyRef.current = value; setState(value)
  }, [])
  return [dirty, setDirty]
}

export function useStudioNavigation() {
  const [route, setRoute] = useState(readRoute)
  const current = useRef<Entry | null>(null)
  const [position, setPosition] = useState({ index: 0, max: 0 })
  const guards = useRef(new Set<Guard>())
  const restoring = useRef(false)
  const focusChange = useRef(true)
  const register = useCallback((guard: Guard) => { guards.current.add(guard); return () => { guards.current.delete(guard) } }, [])
  const canLeave = useCallback(() => {
    if (![...guards.current].some((guard) => guard())) return true
    if (!window.confirm('¿Descartar los cambios sin guardar y cambiar de página?')) return false
    for (const guard of guards.current) guard(true)
    return true
  }, [])
  useLayoutEffect(() => {
    const previousRestoration = window.history.scrollRestoration
    window.history.scrollRestoration = 'manual'
    const initial = entry() || { id: crypto.randomUUID(), index: 0, scroll: window.scrollY }
    current.current = initial
    const max = maxIndex(initial.id, initial.index)
    setPosition({ index: initial.index, max })
    window.history.replaceState({ ...window.history.state, vision360Navigation: initial }, '', window.location.href)
    rememberMax(initial.id, max)
    function pop() {
      const next = entry()
      const previous = current.current!
      if (restoring.current) { restoring.current = false; return }
      if (!canLeave() && next?.id === previous.id && next.index !== previous.index) {
        restoring.current = true
        window.history.go(previous.index - next.index)
        return
      }
      current.current = next || { id: crypto.randomUUID(), index: 0, scroll: 0 }
      if (!next) window.history.replaceState({ ...window.history.state, vision360Navigation: current.current }, '')
      setPosition({ index: current.current.index, max: maxIndex(current.current.id, current.current.index) })
      focusChange.current = true
      setRoute(readRoute())
    }
    function unload(event: BeforeUnloadEvent) {
      if ([...guards.current].some((guard) => guard())) { event.preventDefault(); event.returnValue = '' }
    }
    let scrollTimer: number | undefined
    function saveScroll() {
      const value = current.current
      if (value && entry()?.id === value.id && entry()?.index === value.index) {
        value.scroll = window.scrollY
        if (scrollTimer !== undefined) window.clearTimeout(scrollTimer)
        scrollTimer = window.setTimeout(() => {
          if (entry()?.id === value.id && entry()?.index === value.index) window.history.replaceState({ ...window.history.state, vision360Navigation: value }, '')
        }, 150)
      }
    }
    window.addEventListener('popstate', pop)
    window.addEventListener('beforeunload', unload)
    window.addEventListener('scroll', saveScroll, { passive: true })
    return () => {
      window.removeEventListener('popstate', pop); window.removeEventListener('beforeunload', unload)
      window.clearTimeout(scrollTimer)
      window.removeEventListener('scroll', saveScroll); window.history.scrollRestoration = previousRestoration
    }
  }, [canLeave])
  useLayoutEffect(() => {
    const target = current.current?.scroll || 0
    let observer: ResizeObserver | undefined
    let timeout: number | undefined
    function stop() { observer?.disconnect(); window.clearTimeout(timeout) }
    function restore() {
      window.scrollTo({ top: target, behavior: 'instant' })
      if (document.documentElement.scrollHeight - window.innerHeight >= target) stop()
    }
    const frame = requestAnimationFrame(() => {
      if (target > 0) {
        observer = new ResizeObserver(restore)
        observer.observe(document.querySelector('main') || document.body)
        timeout = window.setTimeout(stop, 3000)
      }
      restore()
      if (focusChange.current) document.querySelector<HTMLElement>('main')?.focus({ preventScroll: true })
    })
    window.addEventListener('wheel', stop, { passive: true })
    window.addEventListener('pointerdown', stop, { passive: true })
    return () => { cancelAnimationFrame(frame); stop(); window.removeEventListener('wheel', stop); window.removeEventListener('pointerdown', stop) }
  }, [route])
  const navigate = useCallback((next: StudioRoute, options: { replace?: boolean; force?: boolean; keepScroll?: boolean } = {}) => {
    const target = routeUrl(next)
    if (target === window.location.pathname + window.location.search) return true
    if (!options.force && !canLeave()) return false
    const old = current.current!
    old.scroll = window.scrollY
    window.history.replaceState({ ...window.history.state, vision360Navigation: old }, '')
    const index = options.replace ? old.index : old.index + 1
    const value = { id: old.id, index, scroll: options.keepScroll ? window.scrollY : 0 }
    const max = options.replace ? maxIndex(old.id, index) : index
    window.history[options.replace ? 'replaceState' : 'pushState']({ ...window.history.state, vision360Navigation: value }, '', target)
    focusChange.current = !options.keepScroll
    current.current = value; rememberMax(value.id, max); setPosition({ index, max }); setRoute(next)
    return true
  }, [canLeave])
  return { route, navigate, register, canLeave, back: () => window.history.back(), forward: () => window.history.forward(),
    canBack: position.index > 0, canForward: position.index < position.max }
}
