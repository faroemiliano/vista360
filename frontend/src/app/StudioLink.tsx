import { createContext, useContext } from 'react'
import type { ComponentProps } from 'react'
import { defaultRoute, routeUrl } from './routes'
import type { StudioRoute } from './routes'
import type { useStudioNavigation } from './navigation'

export const StudioNavigationContext = createContext<ReturnType<typeof useStudioNavigation> | null>(null)

export function StudioLink({ to, reset = false, onClick, ...props }: Omit<ComponentProps<'a'>, 'href'> & {
  to: Partial<StudioRoute>; reset?: boolean
}) {
  const navigation = useContext(StudioNavigationContext)
  if (!navigation) throw new Error('StudioLink requiere StudioNavigationContext')
  const route = { ...(reset ? { ...defaultRoute, studioId: navigation.route.studioId } : navigation.route), ...to }
  return <a {...props} href={routeUrl(route)} onClick={event => {
    onClick?.(event)
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || props.target === '_blank' || props.download !== undefined) return
    event.preventDefault()
    navigation.navigate(route)
  }} />
}
