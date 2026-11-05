import type { Coordinates } from './types'

export type MotionState = { mode: 'off' | 'waiting' | 'active'; message: string }
type OrientationAPI = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<string> }
const normalize = (angle: number) => ((angle + 180) % 360 + 360) % 360 - 180
const clampPitch = (pitch: number) => Math.max(-85, Math.min(85, pitch))

export function motionAvailability() {
  if (!window.isSecureContext) return 'Para mirar con el celular, abrí el recorrido desde un enlace HTTPS.'
  if (!window.DeviceOrientationEvent) return 'Este navegador no ofrece acceso a los sensores. Podés mirar arrastrando la imagen.'
  return ''
}

// Dirección de la cámara trasera (-Z) en el marco del sensor: Rz(alpha) Rx(beta) Ry(gamma).
// Al usar el vector, el mismo cálculo sirve al sostener el teléfono vertical u horizontal.
// No se aplica roll al panorama: el horizonte se mantiene nivelado.
export function phoneDirection(event: Pick<DeviceOrientationEvent, 'alpha' | 'beta' | 'gamma'>, previousYaw = 0): Coordinates | null {
  const { alpha, beta, gamma } = event
  if (![alpha, beta, gamma].every((value) => typeof value === 'number' && Number.isFinite(value))) return null
  const a = alpha! * Math.PI / 180, b = beta! * Math.PI / 180, g = gamma! * Math.PI / 180
  const x = -Math.cos(a) * Math.sin(g) - Math.sin(a) * Math.sin(b) * Math.cos(g)
  const y = -Math.sin(a) * Math.sin(g) + Math.cos(a) * Math.sin(b) * Math.cos(g)
  const z = -Math.cos(b) * Math.cos(g)
  return { yaw: Math.hypot(x, y) < .02 ? previousYaw : normalize(Math.atan2(x, y) * 180 / Math.PI),
    pitch: Math.asin(Math.max(-1, Math.min(1, z))) * 180 / Math.PI }
}

export function createMotionControl(options: {
  getView: () => Coordinates | null; setView: (view: Coordinates) => void;
  canUpdate: () => boolean; onState: (state: MotionState) => void
}) {
  let disposed = false
  let enabled = false
  let suspended = false
  let generation = 0
  let frame: number | undefined
  let timeout: number | undefined
  let lastTime = 0
  let previousYaw = 0
  let baseline: { phone: Coordinates; view: Coordinates } | null = null
  let target: Coordinates | null = null

  function cancelFrame() { if (frame !== undefined) cancelAnimationFrame(frame); frame = undefined; lastTime = 0 }
  function recenter() { baseline = null; target = null; cancelFrame() }
  function stop(message = '') {
    generation++; enabled = false
    window.removeEventListener('deviceorientation', receive)
    window.clearTimeout(timeout); timeout = undefined
    recenter()
    if (!disposed) options.onState({ mode: 'off', message })
  }
  function animate(time: number) {
    frame = undefined
    if (!enabled || suspended || !target) return
    if (!options.canUpdate()) { recenter(); return }
    const view = options.getView()
    if (!view) { recenter(); return }
    const amount = 1 - Math.exp(-(lastTime ? Math.min(100, time - lastTime) : 16) / 65)
    lastTime = time
    const yawDelta = normalize(target.yaw - view.yaw), pitchDelta = target.pitch - view.pitch
    options.setView({ yaw: normalize(view.yaw + yawDelta * amount), pitch: clampPitch(view.pitch + pitchDelta * amount) })
    if (Math.abs(yawDelta) + Math.abs(pitchDelta) > .02) frame = requestAnimationFrame(animate)
    else lastTime = 0
  }
  function receive(event: DeviceOrientationEvent) {
    if (!enabled || suspended || document.hidden) return
    const point = phoneDirection(event, previousYaw)
    if (!point) return
    previousYaw = point.yaw
    if (!options.canUpdate()) { recenter(); return }
    const view = options.getView()
    if (!view) return
    if (!baseline) {
      baseline = { phone: point, view }
      window.clearTimeout(timeout); timeout = undefined
      options.onState({ mode: 'active', message: 'Mové el celular para mirar. Arrastrar la imagen vuelve al control manual.' })
    }
    target = { yaw: normalize(baseline.view.yaw + normalize(point.yaw - baseline.phone.yaw)),
      pitch: clampPitch(baseline.view.pitch + point.pitch - baseline.phone.pitch) }
    if (frame === undefined) frame = requestAnimationFrame(animate)
  }
  function visibility() { if (document.hidden) stop() }
  document.addEventListener('visibilitychange', visibility)

  return {
    // Llamar directamente desde el click: los permisos de iOS requieren ese gesto.
    async start() {
      if (disposed) return
      stop()
      const unavailable = motionAvailability()
      if (unavailable) { options.onState({ mode: 'off', message: unavailable }); return }
      const request = generation
      options.onState({ mode: 'waiting', message: 'Si el teléfono pide permiso de movimiento, elegí Permitir.' })
      try {
        const api = window.DeviceOrientationEvent as OrientationAPI
        if (api.requestPermission && await api.requestPermission() !== 'granted') {
          if (!disposed && request === generation) stop('No se habilitó el permiso de movimiento. Podés seguir usando el control táctil.')
          return
        }
        if (disposed || request !== generation) return
        enabled = true; suspended = false
        window.addEventListener('deviceorientation', receive)
        options.onState({ mode: 'waiting', message: 'Apuntá el celular hacia adelante y movelo suavemente…' })
        timeout = window.setTimeout(() => stop('No recibimos datos del sensor. Revisá los permisos del navegador o seguí mirando con el dedo.'), 6000)
      } catch {
        if (!disposed && request === generation) stop('El navegador no permitió usar el movimiento. Revisá sus permisos o usá el control táctil.')
      }
    },
    stop, recenter,
    pause() { suspended = true; recenter() },
    resume() { suspended = false; recenter() },
    destroy() { disposed = true; stop(); document.removeEventListener('visibilitychange', visibility) },
  }
}
