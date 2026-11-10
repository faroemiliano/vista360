import { useSyncExternalStore } from 'react'

export type Language = 'es' | 'pt-BR'
let language: Language = 'es'
let messages: Record<string, string> = {}
let reverse = new Map<string, string>()
const listeners = new Set<() => void>()
let catalog: Promise<void> | undefined
const interpolate = (text: string, values: readonly unknown[]) => text.replace(/\{(\d+)\}/g, (match, index: string) => Number(index) < values.length ? String(values[Number(index)] ?? '') : match)
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
let patterns: { source: string; es: RegExp; pt: RegExp; slots: number[] }[] = []
function matcher(text: string) { return new RegExp(`^${text.split(/\{\d+\}/g).map(escape).join('([\\s\\S]*?)')}$`) }
async function loadPortuguese() {
  catalog ??= import('./pt-BR.json').then(module => {
    messages = module.default
    reverse = new Map(Object.entries(messages).map(([es, pt]) => [pt, es]))
    patterns = Object.entries(messages).filter(([es]) => /\{\d+\}/.test(es)).map(([es, pt]) => ({ source: es, es: matcher(es), pt: matcher(pt), slots: [...es.matchAll(/\{(\d+)\}/g)].map(match => Number(match[1])) }))
  }).catch(error => { catalog = undefined; throw error })
  await catalog
}

/** Sólo textos de interfaz: nunca aplicar a nombres o contenido ingresado por usuarios. */
export function t(source: string, values: readonly unknown[] = []): string {
  const canonical = reverse.get(source) ?? source
  if (messages[canonical]) return interpolate(language === 'pt-BR' ? messages[canonical] : canonical, values)
  if (!values.length) {
    for (const pattern of patterns) {
      const match = pattern.es.exec(source) || pattern.pt.exec(source)
      if (match) {
        const slots: unknown[] = []
        pattern.slots.forEach((slot, index) => { slots[slot] = match[index + 1] })
        return interpolate(language === 'pt-BR' ? messages[pattern.source] : pattern.source, slots)
      }
    }
  }
  return interpolate(canonical, values)
}

export function translateError(message: string) {
  const source = message.replace(/^Value error, /, '')
  if (/^value is not a valid email address/i.test(source)) return t('Ingresá un email válido.')
  const minimum = /^String should have at least (\d+) characters/.exec(source)
  if (minimum) return t('Usá al menos {0} caracteres.', [minimum[1]])
  const maximum = /^String should have at most (\d+) characters/.exec(source)
  if (maximum) return t('Usá como máximo {0} caracteres.', [maximum[1]])
  return t(source)
}

export const dateLocale = () => language === 'pt-BR' ? 'pt-BR' : 'es-AR'
export const getLanguage = () => language
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
export const useLanguage = () => useSyncExternalStore(subscribe, getLanguage, () => 'es' as Language)

export async function setLanguage(next: Language) {
  if (next !== 'es' && next !== 'pt-BR') return
  if (next === 'pt-BR') await loadPortuguese()
  language = next
  document.documentElement.lang = next
  try { localStorage.setItem('vision360-language', next) } catch { /* Funciona también sin almacenamiento. */ }
  for (const listener of listeners) listener()
}

export async function initializeLanguage() {
  let saved: string | null = null
  try { saved = localStorage.getItem('vision360-language') } catch { /* Español predeterminado. */ }
  try { await setLanguage(saved === 'pt-BR' ? 'pt-BR' : 'es') }
  catch { await setLanguage('es') }
  window.addEventListener('storage', event => {
    if (event.key === 'vision360-language') void setLanguage(event.newValue === 'pt-BR' ? 'pt-BR' : 'es').catch(() => {})
  })
}
