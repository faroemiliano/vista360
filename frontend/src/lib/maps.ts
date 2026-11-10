import { t } from '../i18n'
type Location = { label: string; latitude?: number | null; longitude?: number | null }

export function isGoogleMapsUrl(value: string) {
  try {
    const url = new URL(value)
    const google = /^(?:www\.|maps\.)?google\.[a-z]{2,3}(?:\.[a-z]{2})?$/.test(url.hostname)
    const validPath = url.pathname === '/maps' || url.pathname.startsWith('/maps/')
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && Boolean(
      (google && (url.hostname.startsWith('maps.') || validPath))
      || (url.hostname === 'maps.app.goo.gl' && url.pathname.replaceAll('/', ''))
      || (url.hostname === 'goo.gl' && url.pathname.startsWith('/maps/')))
  } catch { return false }
}

export function destinationError(value: string) {
  if (!value.trim()) return t("Escribí una dirección o pegá un enlace de Google Maps.")
  if ((/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value) || value.startsWith('//')) && !isGoogleMapsUrl(value)) {
    return t("Pegá un enlace HTTPS de Google Maps o escribí la dirección del lugar.")
  }
  return ''
}

export function directionsUrl(location: Location) {
  const coordinates = location.latitude != null && location.longitude != null
  if (!coordinates && isGoogleMapsUrl(location.label)) return location.label
  const url = new URL('https://www.google.com/maps/dir/')
  url.searchParams.set('api', '1')
  url.searchParams.set('destination', coordinates ? `${location.latitude},${location.longitude}` : location.label)
  url.searchParams.set('dir_action', 'navigate')
  return url.href
}
