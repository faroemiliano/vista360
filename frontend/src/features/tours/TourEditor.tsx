import { t } from '../../i18n'
import { useEffect, useRef, useState } from 'react'
import { apiResourceUrl, assetsApi, hotspotsApi, scenesApi, toursApi } from '../../api/client'
import type { HotspotInput, Panorama, SavedHotspot, Scene, Tour } from '../../api/client'
import { PanoramaViewer } from '../../viewer/PanoramaViewer'
import type { Coordinates, PanoramaScene } from '../../viewer/types'
import { useBlockNavigation } from '../../app/navigation'
import { Icon } from '../../components/Icon'

type Draft = { id?: string; type: 'navigation' | 'info'; label: string; target: string; text: string; yaw: number; pitch: number; needsPosition?: boolean }

export function TourEditor({ tour, scenes, initialSceneId, preview, onRefresh, onClose, onDirtyChange }: {
  tour: Tour; scenes: Scene[]; initialSceneId: string; preview: boolean
  onRefresh: () => Promise<void>; onClose: () => void; onDirtyChange?: (dirty: boolean) => void
}) {
  const [activeId, setActiveId] = useState(initialSceneId)
  const scene = scenes.find((item) => item.id === activeId)
  const [data, setData] = useState<{ panorama: Panorama; hotspots: SavedHotspot[] } | null>(null)
  const [panoramaScene, setPanoramaScene] = useState<PanoramaScene | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  useBlockNavigation(Boolean(draft))
  const [version, setVersion] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [returnOffer, setReturnOffer] = useState<{ from: string; to: string } | null>(null)
  const pendingReturn = useRef<{ sceneId: string; target: string; label: string } | null>(null)
  useEffect(() => { onDirtyChange?.(Boolean(draft)) }, [draft, onDirtyChange])
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange])

  useEffect(() => {
    let active = true
    setData(null); setDraft(null); setError('')
    if (scene?.panorama_asset_id) {
      Promise.all([assetsApi.panorama(tour.id, scene.id), hotspotsApi.list(tour.id, scene.id)])
        .then(([panorama, hotspots]) => {
          if (!active) return
          setData({ panorama, hotspots })
          setPanoramaScene({
            id: scene.id, name: scene.name,
            sources: panorama.sources.map((source) => ({ ...source, url: apiResourceUrl(source.url) })),
            initialView: { yaw: scene.initial_yaw ?? 0, pitch: scene.initial_pitch ?? 0, hfov: scene.initial_hfov ?? 90 },
            hotspots: hotspots.map((point) => point.type === 'navigation'
              ? { id: point.id, type: 'navigation', label: point.label, yaw: point.yaw, pitch: point.pitch, targetSceneId: point.target_scene_id! }
              : { id: point.id, type: 'info', label: point.label, yaw: point.yaw, pitch: point.pitch, text: point.content!.text }),
          })
          const back = pendingReturn.current
          if (back?.sceneId === scene.id) {
            const existing = hotspots.find((point) => point.type === 'navigation' && point.target_scene_id === back.target)
            setDraft(existing ? { id: existing.id, type: 'navigation', label: existing.label, target: back.target, text: '', yaw: existing.yaw, pitch: existing.pitch }
              : { type: 'navigation', label: back.label, target: back.target, text: '', yaw: 0, pitch: 0, needsPosition: true })
            pendingReturn.current = null
            setMessage(existing ? t("Ya existe una vuelta. Podés editar este punto.") : t("Ubicá la vuelta en esta foto y guardá el punto."))
          }
        })
        .catch((cause: Error) => { if (active) setError(cause.message) })
    }
    return () => { active = false }
  }, [tour.id, scene, version])

  function navigate(id: string) {
    if (busy) return false
    if (draft && !window.confirm(t("¿Descartar los cambios del punto sin guardar?"))) return false
    setActiveId(id); setDraft(null); setMessage(''); setReturnOffer(null)
    return true
  }
  async function act(action: () => Promise<void>, success: string) {
    if (busy) return
    setBusy(true); setError(''); setMessage('')
    try { await action(); setMessage(success) }
    catch (cause) { setError(cause instanceof Error ? cause.message : t("No se pudo guardar.")) }
    finally { setBusy(false) }
  }
  function pick(point: Coordinates) {
    if (busy) return
    setDraft((current) => ({ id: current?.id, type: current?.type || 'navigation', label: current?.label || '',
      target: current?.target || scenes.find((item) => item.id !== activeId)?.id || '', text: current?.text || '', ...point, needsPosition: false }))
    setMessage(t("Punto seleccionado. Completá el formulario y guardá."))
  }
  function close() {
    if (!draft || window.confirm(t("¿Descartar los cambios del punto sin guardar?"))) onClose()
  }
  const pointsList = <div className="mt-5 rounded-xl border border-line p-4">    {data && <>
      <h4 className="mb-3">{preview ? t("Puntos de este ambiente") : t("Conexiones guardadas")}</h4>
      {data.hotspots.length === 0 && <p>{t("No hay puntos todavía.")}</p>}
      <ul className="saved-hotspots">{data.hotspots.map((point) => <li key={point.id}>
        <strong>{point.label}</strong>{' · '}{point.type === 'navigation'
          ? `${scene?.name} → ${scenes.find((item) => item.id === point.target_scene_id)?.name || 'ambiente'}` : t("Información")}
        <div className="row-actions">
          {point.type === 'navigation' && <button disabled={busy} onClick={() => navigate(point.target_scene_id!)}>{t("Ir:")} {point.label}</button>}
          {!preview && <>
            <button disabled={busy} onClick={() => {
              if (draft && !window.confirm(t("¿Descartar los cambios del punto sin guardar?"))) return
              setReturnOffer(null); setDraft({ id: point.id, type: point.type, label: point.label, target: point.target_scene_id || '',
                text: point.content?.text || '', yaw: point.yaw, pitch: point.pitch })
            }}>{t("Editar punto")} {point.label}</button>
            <button disabled={busy} onClick={() => {
              if (window.confirm(t("¿Eliminar el punto {0}?", [point.label]))) void act(async () => {
                await hotspotsApi.remove(tour.id, scene!.id, point.id)
                setDraft(null); setVersion((value) => value + 1)
              }, t("Punto eliminado."))
            }}>{t("Eliminar punto")} {point.label}</button>
          </>}
        </div>
        {preview && point.type === 'info' && <p>{point.content!.text}</p>}
      </li>)}</ul>
    </>}
</div>
  return <section id="guia" className="tour-editor" aria-label={preview ? t("Previsualización privada") : t("Editor del recorrido")}>
    <div className="row-actions">
      <div><p className="eyebrow mb-2">{tour.title}</p><h3 className="text-2xl">{preview ? t("Previsualización privada") : t("Editor del recorrido")}</h3></div>
      <button className="btn-quiet" disabled={busy} onClick={close}>{t("Cerrar")} {preview ? t("previsualización") : 'editor'} <span aria-hidden="true">×</span></button>
    </div>
    <p>{preview ? t("Estás viendo el borrador. Sólo vos podés acceder con tu sesión.") : t("Girá para mirar. Activá «Ubicar punto» y tocá la imagen para crear una conexión o información.")}</p>
    <nav className="row-actions" aria-label={t("Ambientes del recorrido")}>{scenes.map((item) => <button
      key={item.id} aria-current={activeId === item.id ? 'true' : undefined} disabled={busy}
      onClick={() => navigate(item.id)}>{item.name}{!item.panorama_asset_id ? t(" (sin panorama)") : ''}</button>)}</nav>
    <h4>{t("Ambiente actual:")} {scene?.name || t("Ambiente eliminado")}</h4>
    {!preview && scene && <div className="row-actions">
      {tour.start_scene_id === scene.id ? <span className="badge badge-ready">{t("Ambiente inicial")}</span> : <button
        disabled={busy || Boolean(draft)} onClick={() => void act(async () => {
          await toursApi.startScene(tour.id, scene.id)
          await onRefresh()
        }, t("El recorrido comenzará en {0}.{1}", [scene.name, tour.status === 'published' ? ' Volvé a publicar para actualizar el enlace compartido.' : '']))}
      >{t("Usar")} {scene.name}{' '}{t("como inicial")}</button>}
      {draft && tour.start_scene_id !== scene.id && <p className="text-xs text-muted">{t("Guardá o cancelá el punto antes de cambiar el ambiente inicial.")}</p>}
    </div>}
    {error && <p role="alert">{t(error)}</p>}
    {message && <p role="status">{t(message)}</p>}
    {!scene?.panorama_asset_id && <p>{t("Este ambiente todavía no tiene una panorámica validada. Cargala desde la lista de ambientes.")}</p>}
    {error && !data && <button onClick={() => setVersion((value) => value + 1)}>{t("Reintentar ambiente")}</button>}
    <div className={preview ? '' : 'grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]'}><div className="relative min-w-0">
    {scene?.panorama_asset_id && !data && !error && <p className="viewer-switching-message" role="status">{t("Cargando")} {scene.name}…</p>}
    {scene?.panorama_asset_id && panoramaScene && <PanoramaViewer scene={panoramaScene} onNavigate={navigate} experimentalTools={false}
      onPick={!preview && data ? pick : undefined}
      onSaveView={!preview && data ? (view) => {
        if (draft && !window.confirm(t("¿Descartar el punto sin guardar y guardar la vista inicial?"))) return
        void act(async () => {
        await scenesApi.update(tour.id, scene!.id, { name: scene!.name, initial_yaw: view.yaw,
          initial_pitch: view.pitch, initial_hfov: view.hfov })
        await onRefresh()
      }, t("Vista inicial guardada.")) } : undefined} />}
    {preview && pointsList}
    </div>{!preview && <aside className="order-first min-w-0 xl:sticky xl:top-6 xl:order-last">{returnOffer && <div className="mb-5 rounded-xl border border-accent/40 bg-accent/10 p-5"><h4>{t("Prepará también la vuelta")}</h4><p className="muted my-3">{t("Abrí")} {scenes.find((item) => item.id === returnOffer.to)?.name}{' '}{t("y elegí desde dónde volver.")}</p><button onClick={() => {
      const back = returnOffer; pendingReturn.current = { sceneId: back.to, target: back.from, label: t("Volver a {0}", [scenes.find((item) => item.id === back.from)?.name || 'ambiente anterior']) }; navigate(back.to)
    }}>{t("Crear también la vuelta")}</button></div>}
    {!draft && pointsList}
    {!draft && !returnOffer && <div className="rounded-xl border border-dashed border-line bg-surface-950 p-5"><Icon name="link" className="mb-4 size-7 text-accent" /><h4>{t("Crear una conexión")}</h4><p className="muted mt-3">{t("En el visor, activá «Ubicar punto» y tocá el lugar por donde pasarías al siguiente ambiente.")}</p></div>}
    {draft && <form className="hotspot-form !mt-0" onSubmit={(event) => {
      event.preventDefault()
      if (draft.needsPosition) return
      const input: HotspotInput = { type: draft.type, yaw: draft.yaw, pitch: draft.pitch, label: draft.label,
        target_scene_id: draft.type === 'navigation' ? draft.target : null,
        content: draft.type === 'info' ? { text: draft.text } : null }
      void act(async () => {
        if (draft.id) await hotspotsApi.update(tour.id, scene!.id, draft.id, input)
        else await hotspotsApi.create(tour.id, scene!.id, input)
        setReturnOffer(draft.type === 'navigation' ? { from: scene!.id, to: draft.target } : null)
        setDraft(null); setVersion((value) => value + 1)
      }, t("Punto guardado."))
    }}>
      <p className="eyebrow !text-accent">{t("Conectá la visita")}</p><h4>{draft.id ? t("Editar punto") : t("Nuevo punto")}</h4>
      {draft.needsPosition && <p role="status" className="my-3 text-sm text-accent">{t("Primero activá «Ubicar punto» y tocá la puerta de regreso en la foto, o usá «Nuevo punto en el centro».")}</p>}
      <fieldset disabled={busy}>
        <label>{t("Tipo de punto")}<select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as Draft['type'] })}>
          <option value="navigation">{t("Ir a otro ambiente")}</option><option value="info">{t("Información")}</option>
        </select></label>
        <label>{t("Etiqueta del punto")}<input required maxLength={120} value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.target.value })} /></label>
        {draft.type === 'navigation' ? <label>{t("Ambiente de destino")}<select required value={draft.target} onChange={(event) => setDraft({ ...draft, target: event.target.value })}>
          <option value="">{t("Elegí un ambiente")}</option>{scenes.filter((item) => item.id !== activeId).map((item) => <option key={item.id} value={item.id}>{item.name}{!item.panorama_asset_id ? t(" (sin panorama)") : ''}</option>)}
        </select></label> : <label>{t("Texto informativo")}<textarea required maxLength={2000} value={draft.text} onChange={(event) => setDraft({ ...draft, text: event.target.value })} /></label>}
        <details className="mb-4 rounded-lg border border-line bg-surface-900 p-3"><summary>{t("Ajustar coordenadas manualmente")}</summary><div className="angle-fields mt-4 sm:grid-cols-1">
          <label>{t("Yaw del punto (°)")}<input type="number" required min={-180} max={179.999999} step="any" value={draft.yaw} onChange={(event) => setDraft({ ...draft, yaw: Number(event.target.value), needsPosition: false })} /></label>
          <label>{t("Pitch del punto (°)")}<input type="number" required min={-90} max={90} step="any" value={draft.pitch} onChange={(event) => setDraft({ ...draft, pitch: Number(event.target.value), needsPosition: false })} /></label>
        </div></details>
        <p>{t("Para cambiar la ubicación, activá «Ubicar punto» y tocá otra posición. La conexión de vuelta se crea desde el ambiente de destino.")}</p>
        <button className="btn-primary" type="submit" disabled={draft.needsPosition}>{t("Guardar punto")}</button>{' '}
        <button type="button" onClick={() => setDraft(null)}>{t("Cancelar punto")}</button>
      </fieldset>
    </form>}{draft && pointsList}</aside>}</div>
  </section>
}
