import 'pannellum'
import 'pannellum/build/pannellum.css'
import type {
  Coordinates, Hotspot, PanoramaAdapter, PanoramaScene, PanoramaSource, ViewerCallbacks,
} from './types'

const normalizeYaw = (yaw: number) => ((yaw + 180) % 360 + 360) % 360 - 180

export function selectSource(sources: readonly PanoramaSource[], maxTextureSize: number) {
  return [...sources]
    .filter((source) => source.width <= maxTextureSize && source.height <= maxTextureSize)
    .sort((a, b) => b.width - a.width)[0]
}

function textureLimit(): number {
  const canvas = document.createElement('canvas')
  const gl = canvas.getContext('webgl')
  if (!gl) throw new Error('Este navegador no tiene WebGL disponible.')
  const limit = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number
  gl.getExtension('WEBGL_lose_context')?.loseContext()
  return limit
}

export function createPannellumAdapter(
  container: HTMLElement, callbacks: ViewerCallbacks,
): PanoramaAdapter {
  const maxTextureSize = textureLimit()
  let viewer: PannellumViewer | null = null
  let controller: AbortController | null = null
  let generation = 0
  let destroyed = false
  let loading = false
  let leaving = false
  let movementFrame: number | null = null
  let renderPending = Promise.resolve()
  let finishRender: (() => void) | null = null
  let activeSceneId: string | null = null
  let picking = false
  let pointer: { id: number; x: number; y: number; moved: boolean } | null = null
  const pointers = new Set<number>()
  const observer = new ResizeObserver(() => viewer?.resize())
  observer.observe(container)

  function cancelTransition() {
    if (movementFrame !== null) cancelAnimationFrame(movementFrame)
    movementFrame = null
    leaving = false
    delete container.dataset.transition
    viewer?.stopMovement()
  }

  function navigateThrough(hotspot: Hotspot & { type: 'navigation' }) {
    if (destroyed || loading || leaving || !viewer?.isLoaded()) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      callbacks.onNavigate(hotspot.targetSceneId)
      return
    }
    const currentViewer = viewer
    currentViewer.stopMovement()
    const currentGeneration = generation
    const start = { yaw: currentViewer.getYaw(), pitch: currentViewer.getPitch(), hfov: currentViewer.getHfov() }
    const yawDelta = normalizeYaw(hotspot.yaw - start.yaw)
    const targetHfov = Math.max(50, start.hfov * .84)
    let started: number | null = null
    leaving = true
    container.dataset.transition = 'departing'
    const step = (time: number) => {
      if (destroyed || generation !== currentGeneration) return
      started ??= time
      const progress = Math.min(1, (time - started) / 240)
      const ease = 1 - (1 - progress) ** 3
      currentViewer.lookAt(start.pitch + (hotspot.pitch - start.pitch) * ease,
        normalizeYaw(start.yaw + yawDelta * ease), start.hfov + (targetHfov - start.hfov) * ease, false)
      if (progress < 1) movementFrame = requestAnimationFrame(step)
      else {
        callbacks.onNavigate(hotspot.targetSceneId)
        if (destroyed || generation !== currentGeneration) return
        // Si el editor cancela la navegación por cambios sin guardar, restaurar la vista.
        movementFrame = requestAnimationFrame(() => {
          movementFrame = null
          if (!destroyed && generation === currentGeneration) {
            currentViewer.lookAt(start.pitch, start.yaw, start.hfov, false)
            leaving = false; delete container.dataset.transition
          }
        })
      }
    }
    movementFrame = requestAnimationFrame(step)
  }

  function coordinatesAt(event: MouseEvent): Coordinates | null {
    if (!viewer?.isLoaded()) return null
    const [pitch, yaw] = viewer.mouseEventToCoords(event)
    return Number.isFinite(yaw) && Number.isFinite(pitch)
      ? { yaw: normalizeYaw(yaw), pitch: Math.max(-90, Math.min(90, pitch)) } : null
  }

  const pointerDown = (event: PointerEvent) => {
    pointers.add(event.pointerId)
    const target = event.target as HTMLElement
    if (!target.closest('button, .pnlm-hotspot-base')) callbacks.onManualInteraction?.()
    if (pointers.size > 1) pointer = null
    else if (picking && event.button === 0 && !target.closest('button, .pnlm-hotspot-base')) {
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false }
    }
  }
  const pointerMove = (event: PointerEvent) => {
    if (pointer?.id === event.pointerId && Math.hypot(
      event.clientX - pointer.x, event.clientY - pointer.y,
    ) > 6) pointer.moved = true
  }
  const pointerUp = (event: PointerEvent) => {
    pointers.delete(event.pointerId)
    if (pointer?.id === event.pointerId && !pointer.moved && picking) {
      const coordinates = coordinatesAt(event)
      if (coordinates) callbacks.onCoordinates(coordinates)
    }
    pointer = null
  }
  const pointerCancel = () => { pointer = null; pointers.clear() }
  container.addEventListener('pointerdown', pointerDown, true)
  container.addEventListener('pointermove', pointerMove, true)
  container.addEventListener('pointerup', pointerUp, true)
  container.addEventListener('pointercancel', pointerCancel, true)
  container.addEventListener('pointerleave', pointerCancel, true)

  function clearViewer() {
    finishRender?.(); finishRender = null
    activeSceneId = null
    if (!viewer) return
    viewer.off('load')
    viewer.off('error')
    viewer.stopMovement()
    viewer.destroy()
    viewer = null
    container.replaceChildren()
    pointerCancel()
  }

  function hotspotConfig(hotspot: Hotspot): PannellumHotspotConfig {
    return {
      id: hotspot.id, yaw: hotspot.yaw, pitch: hotspot.pitch,
      type: hotspot.type === 'navigation' ? 'scene' : 'info',
      cssClass: `tour-hotspot tour-hotspot--${hotspot.type}`,
      createTooltipFunc(element) {
        const button = document.createElement('button')
        button.type = 'button'
        if (hotspot.type === 'navigation') {
          const marker = document.createElement('span')
          marker.className = 'tour-navigation-marker'
          marker.setAttribute('aria-hidden', 'true')
          const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
          icon.setAttribute('viewBox', '0 0 24 24')
          icon.setAttribute('aria-hidden', 'true')
          icon.setAttribute('focusable', 'false')
          const chevrons = document.createElementNS('http://www.w3.org/2000/svg', 'path')
          chevrons.setAttribute('d', 'm6 13 6-6 6 6 M6 19l6-6 6 6')
          icon.append(chevrons)
          marker.append(icon)
          const label = document.createElement('span')
          label.className = 'tour-navigation-label'
          label.setAttribute('aria-hidden', 'true')
          label.textContent = hotspot.label
          button.append(marker, label)
        } else button.textContent = 'i'
        button.setAttribute('aria-label', hotspot.label)
        button.title = hotspot.label
        button.addEventListener('click', (event) => {
          event.stopPropagation()
          if (destroyed || loading || leaving) return
          if (hotspot.type === 'navigation') navigateThrough(hotspot)
          else callbacks.onInfo(hotspot.label, hotspot.text)
        })
        element.replaceChildren(button)
      },
    }
  }

  async function loadScene(scene: PanoramaScene) {
    if (destroyed) return
    const current = ++generation
    cancelTransition()
    controller?.abort()
    loading = true
    callbacks.onLoading(scene.id)
    const source = selectSource(scene.sources, maxTextureSize)
    if (!source) {
      loading = false; clearViewer()
      callbacks.onError('No hay una imagen compatible con el límite de textura del dispositivo.')
      return
    }
    const abort = new AbortController()
    controller = abort
    const started = performance.now()
    let objectUrl: string | null = null
    let renderDone: (() => void) | undefined
    try {
      // Sólo la escena activa. Fetch permite cancelar descargas al navegar/desmontar.
      const response = await fetch(source.url, {
        mode: 'cors', credentials: source.credentials || 'omit', signal: abort.signal,
      })
      if (!response.ok) throw new Error('No se pudo descargar la panorámica.')
      const blob = await response.blob()
      objectUrl = URL.createObjectURL(blob)
      const image = new Image()
      image.src = objectUrl
      await image.decode()
      if (destroyed || current !== generation) return
      if (image.naturalWidth !== source.width || image.naturalHeight !== source.height
        || image.naturalWidth !== image.naturalHeight * 2) {
        throw new Error('La panorámica debe ser completa, 2:1 y tener las dimensiones declaradas.')
      }
      // Serializar el cambio nativo: Pannellum ignora loadScene si aún está cargando.
      await renderPending
      if (destroyed || current !== generation) return
      const previousSceneId = activeSceneId
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const config = {
        type: 'equirectangular', panorama: image, dynamic: true, dynamicUpdate: true,
        yaw: scene.initialView.yaw, pitch: scene.initialView.pitch,
        // Apertura amplia por defecto; se conserva la dirección inicial guardada.
        hfov: 110, minHfov: 50, maxHfov: 110,
        mouseZoom: false, doubleClickZoom: false, sceneFadeDuration: reducedMotion ? 0 : 180,
        hotSpots: scene.hotspots.map(hotspotConfig),
      }
      renderPending = new Promise<void>((resolve) => { renderDone = resolve; finishRender = resolve })
      // Reutilizar el mismo visor, canvas y contexto WebGL. Sólo cambia la escena.
      if (!viewer) {
        const host = document.createElement('div')
        host.className = 'panorama-host'
        container.appendChild(host)
        viewer = window.pannellum.viewer(host, {
          autoLoad: false, showControls: false, escapeHTML: true,
          default: { firstScene: scene.id }, scenes: { [scene.id]: config },
        })
      } else {
        viewer.addScene(scene.id, config)
        viewer.getConfig().sceneFadeDuration = reducedMotion ? 0 : 180
      }
      viewer.off('load'); viewer.off('error')
      viewer.on('load', () => {
        viewer?.setUpdate(false)
        activeSceneId = scene.id
        if (previousSceneId && previousSceneId !== scene.id) viewer?.removeScene(previousSceneId)
        renderDone?.(); finishRender = null
        if (destroyed || current !== generation) return
        loading = false
        callbacks.onReady(scene.id, {
          source, maxTextureSize, decodedBytes: source.width * source.height * 4,
          transferBytes: blob.size, loadMilliseconds: performance.now() - started,
        })
      })
      viewer.on('error', () => {
        clearViewer()
        if (!destroyed && current === generation) {
          loading = false
          callbacks.onError('No se pudo renderizar la panorámica. Probá con la resolución menor.')
        }
      })
      viewer.loadScene(scene.id)
    } catch (error) {
      renderDone?.()
      if (!destroyed && current === generation && !abort.signal.aborted) {
        loading = false
        clearViewer()
        const message = error instanceof TypeError
          ? 'No se pudo descargar la panorámica. Revisá la conexión y los permisos CORS del servidor de imágenes.'
          : error instanceof DOMException
            ? 'No se pudo decodificar la panorámica. Revisá el formato del archivo.'
            : error instanceof Error ? error.message : 'No se pudo cargar la panorámica.'
        callbacks.onError(message)
      }
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      if (controller === abort) controller = null
    }
  }

  return {
    loadScene, coordinatesAt,
    getView: () => viewer?.isLoaded() ? { yaw: normalizeYaw(viewer.getYaw()), pitch: viewer.getPitch(), hfov: viewer.getHfov() } : null,
    setView: (view) => viewer?.lookAt(view.pitch, normalizeYaw(view.yaw), view.hfov, false),
    zoom: (delta) => {
      if (viewer?.isLoaded()) viewer.setHfov(Math.max(50, Math.min(110, viewer.getHfov() + delta)), false)
    },
    setPicking: (enabled) => { picking = enabled; pointerCancel() },
    addHotspot: (hotspot) => {
      if (viewer?.isLoaded()) {
        viewer.removeHotSpot(hotspot.id)
        viewer.addHotSpot(hotspotConfig(hotspot))
      }
    },
    removeHotspot: (id) => { viewer?.removeHotSpot(id) },
    resize: () => viewer?.resize(),
    destroy: () => {
      if (destroyed) return
      destroyed = true
      cancelTransition()
      generation++
      controller?.abort()
      observer.disconnect()
      container.removeEventListener('pointerdown', pointerDown, true)
      container.removeEventListener('pointermove', pointerMove, true)
      container.removeEventListener('pointerup', pointerUp, true)
      container.removeEventListener('pointercancel', pointerCancel, true)
      container.removeEventListener('pointerleave', pointerCancel, true)
      clearViewer()
    },
  }
}
