import type { PanoramaScene } from './types'

// Sólo fixtures propias; sin datos de negocio ni persistencia.
const mediaBase = (import.meta.env.VITE_DEMO_MEDIA_BASE_URL || '').replace(/\/$/, '')
const sources = (name: string) => [4096, 2048].map((width) => ({
  url: `${mediaBase}/panoramas/${name}-${width}.png`, width, height: width / 2,
}))

export const demoScenes: readonly PanoramaScene[] = [
  {
    id: 'atrio', name: 'Atrio de prueba', sources: sources('atrio'),
    initialView: { yaw: 0, pitch: 0, hfov: 90 },
    hotspots: [
      { id: 'to-sala', type: 'navigation', yaw: 25, pitch: -10, label: 'Ir a Sala de prueba', targetSceneId: 'sala' },
      { id: 'atrio-info', type: 'info', yaw: -25, pitch: 0, label: 'Sobre este panorama', text: 'Grilla sintética propia. Cada franja representa 30° de longitud; no es una fotografía de una propiedad.' },
    ],
  },
  {
    id: 'sala', name: 'Sala de prueba', sources: sources('sala'),
    initialView: { yaw: 0, pitch: 0, hfov: 90 },
    hotspots: [
      { id: 'to-atrio', type: 'navigation', yaw: -25, pitch: -10, label: 'Volver a Atrio de prueba', targetSceneId: 'atrio' },
      { id: 'sala-info', type: 'info', yaw: 25, pitch: 0, label: 'Referencia de orientación', text: 'El horizonte está en pitch 0°. Los hotspots usan grados y conexiones independientes en cada dirección.' },
    ],
  },
]
