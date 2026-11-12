import { t } from '../i18n'
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { readRoute, routeUrl } from './routes'
import type { StudioRoute } from './routes'
export { defaultRoute, routeUrl } from './routes'
export type { StudioRoute } from './routes'

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
    if (!window.confirm(t("¿Descartar los cambios sin guardar y cambiar de página?"))) return false
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
