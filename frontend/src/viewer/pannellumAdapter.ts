import { t } from '../i18n'
import 'pannellum'
import 'pannellum/build/pannellum.css'
import type {
  Coordinates, Hotspot, PanoramaAdapter, PanoramaScene, PanoramaSource, ViewerCallbacks,
} from './types'

const normalizeYaw = (yaw: number) => ((yaw + 180) % 360 + 360) % 360 - 180

export function selectSource(sources: readonly PanoramaSource[], maxTextureSize: number, preferredWidth = maxTextureSize) {
  const candidates = [...sources]
    .filter((source) => source.width <= maxTextureSize && source.height <= maxTextureSize)
    .sort((a, b) => b.width - a.width)
  return candidates.find(source => source.width <= preferredWidth) ?? candidates.at(-1)
}

function textureLimit(): number {
  const canvas = document.createElement('canvas')
  const gl = canvas.getContext('webgl')
  if (!gl) throw new Error(t("Este navegador no tiene WebGL disponible."))
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
  let renderPending = Promise.resolve()
  let finishRender: (() => void) | null = null
  let activeSceneId: string | null = null
  let walk: { target: string; origin: string | null; x: number; y: number } | null = null
  let walkAnimation: Animation | null = null
  let fadeTimer: number | null = null
  let picking = false
  let sceneHotspots: readonly Hotspot[] = []
  let hiddenHotspot: Hotspot | null = null
  const previewId = 'vision360-unsaved-point'
  let pointer: { id: number; x: number; y: number; moved: boolean } | null = null
  const pointers = new Set<number>()
  const observer = new ResizeObserver(() => viewer?.resize())
  observer.observe(container)

  function navigateThrough(hotspot: Hotspot & { type: 'navigation' }, button: HTMLElement) {
    if (destroyed || loading || !viewer?.isLoaded()) return
    const frame = container.getBoundingClientRect()
    const marker = button.getBoundingClientRect()
    walk = {
      target: hotspot.targetSceneId, origin: activeSceneId,
      x: Math.max(0, Math.min(100, (marker.left + marker.width / 2 - frame.left) / frame.width * 100)),
      y: Math.max(0, Math.min(100, (marker.top + marker.height / 2 - frame.top) / frame.height * 100)),
    }
    // El editor puede rechazar la navegación si hay cambios sin guardar.
    if (callbacks.onNavigate(hotspot.targetSceneId) === false) walk = null
  }

  function clearFade() {
    if (fadeTimer !== null) window.clearTimeout(fadeTimer)
    fadeTimer = null
    walkAnimation?.cancel()
    walkAnimation = null
    delete container.dataset.transition
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
    clearFade()
    walk = null
    finishRender?.(); finishRender = null
    activeSceneId = null
    sceneHotspots = []
    hiddenHotspot = null
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
          if (destroyed || loading) return
          if (hotspot.type === 'navigation') navigateThrough(hotspot, button)
          else callbacks.onInfo(hotspot.label, hotspot.text)
        })
        element.replaceChildren(button)
      },
    }
  }

  function setPreviewPoint(point: Coordinates | null, replacingId?: string) {
    if (!viewer?.isLoaded()) return
    viewer.removeHotSpot(previewId)
    if (hiddenHotspot && (!point || hiddenHotspot.id !== replacingId)) {
      viewer.addHotSpot(hotspotConfig(hiddenHotspot))
      hiddenHotspot = null
    }
    if (!point || loading) return
    if (replacingId && !hiddenHotspot) {
      hiddenHotspot = sceneHotspots.find(hotspot => hotspot.id === replacingId) || null
      if (hiddenHotspot) viewer.removeHotSpot(hiddenHotspot.id)
    }
    viewer.addHotSpot({
      id: previewId, yaw: point.yaw, pitch: point.pitch, type: 'info', cssClass: 'tour-hotspot--preview',
      createTooltipFunc(element) {
        element.setAttribute('role', 'img')
        element.setAttribute('aria-label', t('Ubicación del punto sin guardar'))
        const marker = document.createElement('span')
        marker.className = 'tour-preview-marker'
        marker.setAttribute('aria-hidden', 'true')
        const label = document.createElement('span')
        label.className = 'tour-preview-label'
        label.setAttribute('aria-hidden', 'true')
        label.textContent = t('Sin guardar')
        element.replaceChildren(marker, label)
      },
    })
  }

  async function loadScene(scene: PanoramaScene, options?: { preferredWidth?: number; preserveView?: boolean }) {
    if (destroyed) return
    const preserved = options?.preserveView && activeSceneId === scene.id && viewer?.isLoaded()
      ? { yaw: viewer.getYaw(), pitch: viewer.getPitch(), hfov: viewer.getHfov() } : null
    const current = ++generation
    const departure = walk?.target === scene.id && walk.origin === activeSceneId ? walk : null
    walk = null
    viewer?.stopMovement()
    controller?.abort()
    loading = true
    callbacks.onLoading(scene.id)
    const source = selectSource(scene.sources, maxTextureSize, options?.preferredWidth)
    if (!source) {
      loading = false; clearViewer()
      callbacks.onError(t("No hay una imagen compatible con el límite de textura del dispositivo."))
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
      if (!response.ok) throw new Error(t("No se pudo descargar la panorámica."))
      const blob = await response.blob()
      objectUrl = URL.createObjectURL(blob)
      const image = new Image()
      image.src = objectUrl
      await image.decode()
      if (destroyed || current !== generation) return
      if (image.naturalWidth !== source.width || image.naturalHeight !== source.height
        || image.naturalWidth !== image.naturalHeight * 2) {
        throw new Error(t("La panorámica debe ser completa, 2:1 y tener las dimensiones declaradas."))
      }
      // Serializar el cambio nativo: Pannellum ignora loadScene si aún está cargando.
      await renderPending
      if (destroyed || current !== generation) return
      const previousSceneId = activeSceneId
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const fadeDuration = reducedMotion || !viewer || preserved ? 0 : 420
      const config = {
        // Una foto estática se carga una vez en la GPU. dynamic=true volvería a
        // subir todos sus píxeles en cada frame de arrastre o de los sensores.
        type: 'equirectangular', panorama: objectUrl, dynamic: false, dynamicUpdate: false,
        ignoreGPanoXMP: true,
        yaw: preserved?.yaw ?? scene.initialView.yaw, pitch: preserved?.pitch ?? scene.initialView.pitch,
        // Apertura amplia por defecto; se conserva la dirección inicial guardada.
        hfov: preserved?.hfov ?? 110, minHfov: 50, maxHfov: 110,
        mouseZoom: false, doubleClickZoom: false, sceneFadeDuration: fadeDuration,
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
        viewer.getConfig().sceneFadeDuration = fadeDuration
      }
      viewer.off('load'); viewer.off('error')
      viewer.on('load', () => {
        viewer?.setUpdate(false)
        activeSceneId = scene.id
        sceneHotspots = scene.hotspots
        hiddenHotspot = null
        if (previousSceneId && previousSceneId !== scene.id) viewer?.removeScene(previousSceneId)
        const fade = container.querySelector<HTMLElement>('.pnlm-fade-img')
        if (current === generation && departure && fade && fadeDuration) {
          container.dataset.transition = 'walking'
          // Animar la captura que Pannellum conserva encima del nuevo panorama.
          // Acercamiento y opacidad comparten una sola línea de tiempo, sin pausa intermedia.
          fade.style.transformOrigin = `${departure.x}% ${departure.y}%`
          walkAnimation = fade.animate([
            { transform: 'scale(1)', opacity: 1 },
            { transform: 'scale(1.22)', opacity: 0 },
          ], { duration: fadeDuration, easing: 'cubic-bezier(.22,.61,.36,1)', fill: 'both' })
        }
        const complete = () => {
          clearFade()
          renderDone?.(); finishRender = null
          if (destroyed || current !== generation) return
          loading = false
          callbacks.onReady(scene.id, {
            source, maxTextureSize, decodedBytes: source.width * source.height * 4,
            transferBytes: blob.size, loadMilliseconds: performance.now() - started,
          })
        }
        // No admitir otra transición ni reanudar sensores durante el fundido.
        if (fade && fadeDuration) fadeTimer = window.setTimeout(complete, fadeDuration)
        else complete()
      })
      viewer.on('error', () => {
        clearViewer()
        if (!destroyed && current === generation) {
          loading = false
          callbacks.onError(t("No se pudo renderizar la panorámica. Probá con la resolución menor."))
        }
      })
      viewer.loadScene(scene.id)
      // Pannellum lee la URL de manera asíncrona: conservarla hasta terminar.
      await renderPending
    } catch (error) {
      renderDone?.()
      if (!destroyed && current === generation && !abort.signal.aborted) {
        loading = false
        clearViewer()
        const message = error instanceof TypeError
          ? t("No se pudo descargar la panorámica. Revisá la conexión y los permisos CORS del servidor de imágenes.")
          : error instanceof DOMException
            ? t("No se pudo decodificar la panorámica. Revisá el formato del archivo.")
            : error instanceof Error ? error.message : t("No se pudo cargar la panorámica.")
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
    setView: (view) => {
      // La inercia de un arrastre previo no debe competir con sensores o centrado.
      viewer?.stopMovement()
      viewer?.lookAt(view.pitch, normalizeYaw(view.yaw), view.hfov, false)
    },
    zoom: (delta) => {
      if (viewer?.isLoaded()) viewer.setHfov(Math.max(50, Math.min(110, viewer.getHfov() + delta)), false)
    },
    setPicking: (enabled) => { picking = enabled; pointerCancel() },
    setPreviewPoint,
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
