// Superficie mínima de la API usada; no expone tipos de Pannellum al dominio.
declare module 'pannellum'

interface PannellumHotspotConfig {
  id: string
  pitch: number
  yaw: number
  type: 'info' | 'scene'
  cssClass: string
  createTooltipFunc: (element: HTMLElement) => void
}

interface PannellumViewer {
  on: (name: string, callback: () => void) => PannellumViewer
  off: (name: string, callback?: () => void) => PannellumViewer
  loadScene: (sceneId: string) => PannellumViewer
  addScene: (sceneId: string, config: Record<string, unknown>) => PannellumViewer
  removeScene: (sceneId: string) => boolean
  getConfig: () => Record<string, unknown>
  setUpdate: (enabled: boolean) => PannellumViewer
  isLoaded: () => boolean
  mouseEventToCoords: (event: MouseEvent) => [number, number]
  lookAt: (pitch: number, yaw: number, hfov?: number, animated?: boolean) => void
  getHfov: () => number
  getYaw: () => number
  getPitch: () => number
  setHfov: (hfov: number, animated?: boolean) => void
  addHotSpot: (hotspot: PannellumHotspotConfig) => void
  removeHotSpot: (id: string) => boolean
  stopMovement: () => void
  resize: () => void
  destroy: () => void
}

interface Window {
  pannellum: {
    viewer: (element: HTMLElement, config: Record<string, unknown>) => PannellumViewer
  }
}
