export function directionsUrl(location: { latitude: number; longitude: number }) {
  const url = new URL('https://www.google.com/maps/dir/')
  url.searchParams.set('api', '1')
  url.searchParams.set('destination', `${location.latitude},${location.longitude}`)
  url.searchParams.set('dir_action', 'navigate')
  return url.href
}
