import type { components } from './schema'

export type User = components['schemas']['UserResponse']
export type SessionState = components['schemas']['SessionResponse']
export type Credentials = components['schemas']['Credentials']
export type Tour = components['schemas']['TourResponse']
export type TourInput = components['schemas']['TourInput']
export type Scene = components['schemas']['SceneResponse']
export type SceneInput = components['schemas']['SceneInput']

const apiUrl = new URL(import.meta.env.VITE_API_BASE_URL || 'http://localhost:8001', window.location.origin)
// En desarrollo, localhost y 127.0.0.1 deben coincidir para conservar cookies SameSite.
const loopbackHosts = ['localhost', '127.0.0.1']
if (import.meta.env.DEV && loopbackHosts.includes(window.location.hostname) && loopbackHosts.includes(apiUrl.hostname)) {
  apiUrl.hostname = window.location.hostname
}
const base = apiUrl.toString().replace(/\/$/, '')
export const apiResourceUrl = (url: string) => url.startsWith('/') ? `${base}${url}` : url
let csrf: string | null = null
let sessionRequest: Promise<SessionState> | null = null

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

export async function request<T>(path: string, method = 'GET', body?: unknown, credentials: RequestCredentials = 'include'): Promise<T> {
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (method !== 'GET' && csrf) headers['X-CSRF-Token'] = csrf
  let response: Response
  try {
    response = await fetch(`${base}/api/v1${path}`, {
      method, headers, credentials, body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch { throw new ApiError(0, 'No se pudo conectar con la API. Verificá que el backend esté iniciado.') }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    const detail = data.detail
    throw new ApiError(response.status, typeof detail === 'string' ? detail
      : Array.isArray(detail) ? detail.map((item: { msg: string }) => item.msg).join('. ')
      : 'No se pudo completar la operación.')
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>
}

export function getSession(): Promise<SessionState> {
  if (!sessionRequest) sessionRequest = request<SessionState>('/auth/session').then((state) => {
    csrf = state.csrf_token; return state
  }).finally(() => { sessionRequest = null })
  return sessionRequest
}

export async function authenticate(mode: 'login' | 'register', data: Credentials) {
  await getSession()
  const state = await request<SessionState>(`/auth/${mode}`, 'POST', data)
  csrf = state.csrf_token
  return state
}

export async function logout() {
  const current = await getSession()
  if (!current.user) return current
  await request('/auth/logout', 'POST'); csrf = null
  return getSession()
}

export const toursApi = {
  list: () => request<Tour[]>('/tours'),
  get: (id: string) => request<Tour>(`/tours/${id}`),
  create: (data: TourInput) => request<Tour>('/tours', 'POST', data),
  update: (id: string, data: TourInput) => request<Tour>(`/tours/${id}`, 'PUT', data),
  remove: (id: string) => request<void>(`/tours/${id}`, 'DELETE'),
  startScene: (id: string, sceneId: string) => request<Tour>(`/tours/${id}/start-scene`, 'PUT', { scene_id: sceneId }),
}

export type PublicationState = components['schemas']['PublicationState']
export type PublicTourData = components['schemas']['PublicTour']
export const publicationsApi = {
  state: (id: string) => request<PublicationState>(`/tours/${id}/publication`),
  check: (id: string) => request<components['schemas']['PublicationCheck']>(`/tours/${id}/publication/check`),
  publish: (id: string, revision: number, confirm: boolean) => request<PublicationState>(`/tours/${id}/publish`, 'POST', { revision, confirm_unreachable: confirm }),
  unpublish: (id: string) => request<PublicationState>(`/tours/${id}/unpublish`, 'POST'),
  publicTour: (slug: string) => request<PublicTourData>(`/public/tours/${encodeURIComponent(slug)}`, 'GET', undefined, 'omit'),
}

export const scenesApi = {
  list: (tour: string) => request<Scene[]>(`/tours/${tour}/scenes`),
  create: (tour: string, data: SceneInput) => request<Scene>(`/tours/${tour}/scenes`, 'POST', data),
  update: (tour: string, id: string, data: SceneInput) => request<Scene>(`/tours/${tour}/scenes/${id}`, 'PUT', data),
  remove: (tour: string, id: string, deleteConnections = false) => request<void>(`/tours/${tour}/scenes/${id}?delete_connections=${deleteConnections}`, 'DELETE'),
  deletionImpact: (tour: string, id: string) => request<components['schemas']['DeletionImpact']>(`/tours/${tour}/scenes/${id}/deletion-impact`),
  reorder: (tour: string, ids: string[]) => request<Scene[]>(`/tours/${tour}/scenes/order`, 'PUT', { scene_ids: ids }),
}

export type SavedHotspot = components['schemas']['HotspotResponse']
export type HotspotInput = components['schemas']['HotspotInput']
export const hotspotsApi = {
  list: (tour: string, scene: string) => request<SavedHotspot[]>(`/tours/${tour}/scenes/${scene}/hotspots`),
  create: (tour: string, scene: string, data: HotspotInput) => request<SavedHotspot>(`/tours/${tour}/scenes/${scene}/hotspots`, 'POST', data),
  update: (tour: string, scene: string, id: string, data: HotspotInput) => request<SavedHotspot>(`/tours/${tour}/scenes/${scene}/hotspots/${id}`, 'PUT', data),
  remove: (tour: string, scene: string, id: string) => request<void>(`/tours/${tour}/scenes/${scene}/hotspots/${id}`, 'DELETE'),
}

export type AssetState = components['schemas']['AssetResponse']
export type Panorama = components['schemas']['PanoramaResponse']

export const assetsApi = {
  state: (id: string) => request<AssetState>(`/assets/${id}`),
  panorama: (tour: string, scene: string) => request<Panorama>(`/tours/${tour}/scenes/${scene}/panorama`),
}

export async function uploadPanorama(tour: string, scene: string, file: File,
  onProgress: (percent: number) => void, signal: AbortSignal): Promise<AssetState> {
  if (file.type !== 'image/jpeg' || file.size === 0 || file.size > 50 * 1024 * 1024) {
    throw new Error('Seleccioná un JPEG de hasta 50 MiB.')
  }
  await getSession()
  const target = await request<components['schemas']['UploadTarget']>(`/tours/${tour}/scenes/${scene}/uploads`,
    'POST', { size_bytes: file.size, mime_type: file.type })
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const cancel = () => xhr.abort()
    const cleanup = () => signal.removeEventListener('abort', cancel)
    xhr.open(target.method, apiResourceUrl(target.url))
    xhr.withCredentials = target.credentials === 'include'
    for (const [key, value] of Object.entries(target.headers)) xhr.setRequestHeader(key, value)
    if (target.credentials === 'include' && csrf) xhr.setRequestHeader('X-CSRF-Token', csrf)
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round(event.loaded / event.total * 100))
    }
    xhr.onload = () => {
      cleanup()
      if (xhr.status >= 200 && xhr.status < 300) { resolve(); return }
      let detail = 'No se pudo recibir el archivo.'
      try { const data = JSON.parse(xhr.responseText); if (typeof data.detail === 'string') detail = data.detail } catch { /* Sin JSON */ }
      reject(new ApiError(xhr.status, detail))
    }
    xhr.onerror = () => { cleanup(); reject(new Error('No se pudo subir la imagen. Revisá la conexión y CORS.')) }
    xhr.onabort = () => { cleanup(); reject(new Error('Carga cancelada.')) }
    signal.addEventListener('abort', cancel, { once: true })
    if (signal.aborted) { cleanup(); reject(new Error('Carga cancelada.')); return }
    xhr.send(file)
  })
  return request<AssetState>(`/assets/${target.asset_id}/complete`, 'POST')
}
