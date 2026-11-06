import { useEffect, useRef, useState } from 'react'
import { createPannellumAdapter } from './pannellumAdapter'
import type { Coordinates, PanoramaAdapter, PanoramaScene, ViewerCallbacks, ViewerDiagnostics } from './types'
import { createMotionControl, motionAvailability } from './deviceOrientation'
import type { MotionState } from './deviceOrientation'

interface Props {
  scene: PanoramaScene
  onNavigate: ViewerCallbacks['onNavigate']
  experimentalTools?: boolean
  onPick?: (coordinates: Coordinates) => void
  onSaveView?: (view: Coordinates & { hfov: number }) => void
}

export function PanoramaViewer({ scene, onNavigate, experimentalTools = true, onPick, onSaveView }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const adapter = useRef<PanoramaAdapter | null>(null)
  const motion = useRef<ReturnType<typeof createMotionControl> | null>(null)
  const [motionState, setMotionState] = useState<MotionState>({ mode: 'off', message: '' })
  const [motionDevice] = useState(() => navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches)
  const [motionUnavailable] = useState(motionAvailability)
  const [loadStatus, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [readySceneId, setReadySceneId] = useState<string | null>(null)
  const status = loadStatus === 'ready' && readySceneId !== scene.id ? 'loading' : loadStatus
  const [hasPanorama, setHasPanorama] = useState(false)
  const [error, setError] = useState('')
  const [diagnostics, setDiagnostics] = useState<ViewerDiagnostics | null>(null)
  const [picking, setPicking] = useState(false)
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null)
  const [information, setInformation] = useState<{ label: string; text: string } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const navigate = useRef(onNavigate)
  navigate.current = onNavigate
  const pick = useRef(onPick)
  pick.current = onPick

  useEffect(() => {
    motion.current = createMotionControl({
      getView: () => adapter.current?.getView() || null,
      setView: (view) => adapter.current?.setView(view),
      canUpdate: () => Boolean(adapter.current?.getView()),
      onState: setMotionState,
    })
    try {
      adapter.current = createPannellumAdapter(container.current!, {
        onLoading: () => { motion.current?.pause(); setStatus('loading'); setInformation(null); setCoordinates(null); setPicking(false) },
        onReady: (id, result) => { motion.current?.resume(); setHasPanorama(true); setReadySceneId(id); setStatus('ready'); setDiagnostics(result) },
        onNavigate: (id) => navigate.current(id),
        onInfo: (label, text) => setInformation({ label, text }),
        onCoordinates: (point) => { setCoordinates(point); pick.current?.(point) },
        onError: (message) => { motion.current?.stop(); setStatus('error'); setError(message) },
        onManualInteraction: () => motion.current?.stop(),
      })
    } catch (cause) {
      setStatus('error')
      setError(cause instanceof Error ? cause.message : 'No se pudo iniciar el visor.')
    }
    return () => { motion.current?.destroy(); motion.current = null; adapter.current?.destroy(); adapter.current = null }
  }, [attempt])

  useEffect(() => { void adapter.current?.loadScene(scene) }, [scene, attempt])
  useEffect(() => { adapter.current?.setPicking(picking) }, [picking, attempt])

  return (
    <section className="viewer-section" aria-label={`Panorama de ${scene.name}`}>
      <div className="viewer-stage">
      <div className="viewer-frame" data-status={status}>
        <div ref={container} className="panorama" data-testid="panorama" />
        {status === 'loading' && <p className={hasPanorama ? 'viewer-switching-message' : 'viewer-message viewer-loading'} role="status">{hasPanorama ? `Cambiando a ${scene.name}…` : 'Cargando panorama…'}</p>}
        {status === 'error' && (
          <div className="viewer-message" role="alert">
            <p>{error}</p>
            <button onClick={() => {
              if (adapter.current) void adapter.current.loadScene(scene)
              else setAttempt((value) => value + 1)
            }}>Reintentar</button>
          </div>
        )}
      </div>
      <div className="viewer-controls">
      <div className="viewer-toolbar" aria-label="Controles del panorama">
        {motionDevice && <>
          <button disabled={status !== 'ready' || Boolean(motionUnavailable) || motionState.mode === 'waiting'} aria-pressed={motionState.mode === 'active'} onClick={() => {
            if (motionState.mode === 'active') motion.current?.stop()
            else { setPicking(false); void motion.current?.start() }
          }}>{motionState.mode === 'active' ? 'Desactivar movimiento' : 'Mirar con el celular'}</button>
          {motionState.mode === 'active' && <button disabled={status !== 'ready'} onClick={() => motion.current?.recenter()}>Centrar movimiento</button>}
        </>}
        <button disabled={status !== 'ready'} onClick={() => adapter.current?.zoom(-10)} aria-label="Acercar">+ Acercar</button>
        <button disabled={status !== 'ready'} onClick={() => adapter.current?.zoom(10)} aria-label="Alejar">− Alejar</button>
        <button disabled={status !== 'ready'} onClick={() => {
          const view = adapter.current?.getView()
          if (view) adapter.current?.setView({ ...view, hfov: 110 })
        }}>Vista amplia</button>
        <button disabled={status !== 'ready'} onClick={() => { motion.current?.stop(); adapter.current?.setView({ ...scene.initialView, hfov: 110 }) }}>Vista inicial</button>
        {onPick && <button disabled={status !== 'ready'} aria-pressed={picking} onClick={() => { motion.current?.stop(); setPicking(!picking) }}>Ubicar punto</button>}
        {onPick && <button disabled={status !== 'ready'} onClick={() => {
          motion.current?.stop()
          const view = adapter.current?.getView()
          if (view) onPick({ yaw: view.yaw, pitch: view.pitch })
        }}>Nuevo punto en el centro</button>}
        {onSaveView && <button disabled={status !== 'ready'} onClick={() => {
          const view = adapter.current?.getView()
          if (view) onSaveView(view)
        }}>Guardar vista actual como inicial</button>}
        {experimentalTools && <>
        <button disabled={status !== 'ready'} aria-pressed={picking} onClick={() => { motion.current?.stop(); setPicking(!picking) }}>Medir coordenadas</button>
        <button disabled={status !== 'ready' || !coordinates} onClick={() => {
          if (coordinates) adapter.current?.addHotspot({
            ...coordinates, id: 'test-marker', type: 'info', label: 'Punto de prueba',
            text: 'Este marcador es temporal y desaparece al cambiar de ambiente.',
          })
        }}>Mostrar punto</button>
        <button disabled={status !== 'ready'} onClick={() => adapter.current?.removeHotspot('test-marker')}>Quitar punto</button>
        </>}
      </div>
      {motionDevice && <p className="viewer-hint" role="status">{motionUnavailable || motionState.message || 'Activá «Mirar con el celular» para explorar moviendo el teléfono.'}</p>}
      </div>
      </div>
      <p className="viewer-hint">Arrastrá para mirar alrededor. Usá Acercar y Alejar para ajustar el zoom, o Vista amplia para ver más del ambiente.{onSaveView && ' Para conservar ese encuadre, pulsá Guardar vista actual como inicial.'}</p>
      {picking && <p role="status">Tocá un punto sin arrastrar para obtener sus coordenadas.</p>}
      {experimentalTools && <output data-testid="coordinates" aria-live="polite">
        {coordinates ? `Yaw ${coordinates.yaw.toFixed(2)}° · Pitch ${coordinates.pitch.toFixed(2)}°` : 'Sin punto seleccionado.'}
      </output>}
      {information && <aside className="information" aria-live="polite">
        <strong>{information.label}</strong><p>{information.text}</p>
        <button onClick={() => setInformation(null)}>Cerrar información</button>
      </aside>}
      {experimentalTools && diagnostics && status === 'ready' && <details className="diagnostics">
        <summary>Datos de esta prueba</summary>
        <p>Imagen: {diagnostics.source.width} × {diagnostics.source.height} · Límite de textura: {diagnostics.maxTextureSize}</p>
        <p>Archivo: {(diagnostics.transferBytes / 1024).toFixed(1)} KiB · Decodificación estimada RGBA: {(diagnostics.decodedBytes / 1024 / 1024).toFixed(0)} MiB</p>
        <p>Carga hasta visor listo: {diagnostics.loadMilliseconds.toFixed(0)} ms. Medición local, no benchmark de fotografías.</p>
      </details>}
    </section>
  )
}
