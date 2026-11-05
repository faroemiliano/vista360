export interface Coordinates {
  yaw: number
  pitch: number
}

export interface PanoramaSource {
  url: string
  width: number
  height: number
  credentials?: RequestCredentials
}

export type Hotspot = Coordinates & { id: string; label: string } & (
  | { type: 'navigation'; targetSceneId: string }
  | { type: 'info'; text: string }
)

export interface PanoramaScene {
  id: string
  name: string
  sources: readonly PanoramaSource[]
  initialView: Coordinates & { hfov: number }
  hotspots: readonly Hotspot[]
}

export interface ViewerDiagnostics {
  source: PanoramaSource
  maxTextureSize: number
  decodedBytes: number
  transferBytes: number
  loadMilliseconds: number
}

export interface ViewerCallbacks {
  onLoading: (sceneId: string) => void
  onReady: (sceneId: string, diagnostics: ViewerDiagnostics) => void
  onNavigate: (sceneId: string) => void
  onInfo: (label: string, text: string) => void
  onCoordinates: (coordinates: Coordinates) => void
  onManualInteraction?: () => void
  onError: (message: string) => void
}

export interface PanoramaAdapter {
  loadScene: (scene: PanoramaScene) => Promise<void>
  setView: (view: Coordinates & { hfov?: number }) => void
  getView: () => (Coordinates & { hfov: number }) | null
  zoom: (delta: number) => void
  setPicking: (enabled: boolean) => void
  coordinatesAt: (event: MouseEvent) => Coordinates | null
  addHotspot: (hotspot: Hotspot) => void
  removeHotspot: (id: string) => void
  resize: () => void
  destroy: () => void
}
