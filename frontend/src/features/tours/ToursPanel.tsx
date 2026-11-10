import { t } from '../../i18n'
import { useEffect, useState } from 'react'
import { ApiError, scenesApi, toursApi } from '../../api/client'
import type { Scene, Tour } from '../../api/client'
import { TourForm } from './TourForm'
import { SceneForm } from './SceneForm'
import { PanoramaUpload } from './PanoramaUpload'
import { TourEditor } from './TourEditor'
import { PublicationPanel } from './PublicationPanel'
import { Icon } from '../../components/Icon'
import { TourCover } from '../../components/CaptureVisual'
import { WorkflowGuide } from '../../components/WorkflowGuide'
import { businessApi } from '../../api/business'
import type { TourStep, WorkStep } from '../../components/WorkSteps'
import type { Organization } from '../../api/business'

export function ToursPanel({ onExpired, organization, initialTourId, guidedStep, onStepChange, onDirtyChange, onPublicationChange, onCreateWork, onOpenTour, onBackToCollection }: {
  onOpenTour?: (id: string) => void; onBackToCollection?: () => void;
  onCreateWork?: () => void;
  onExpired: () => void; organization?: Organization; initialTourId?: string;
  onPublicationChange?: () => Promise<void>;
  guidedStep?: TourStep; onStepChange?: (step: WorkStep) => void; onDirtyChange?: (dirty: boolean) => void
}) {
  const readOnly = organization?.role === 'viewer'
  const listTours = () => organization ? businessApi.tours(organization.id) : toursApi.list()
  const [loading, setLoading] = useState(true)
  const [tours, setTours] = useState<Tour[]>([])
  const [selected, setSelected] = useState<Tour | null>(null)
  const [initialLoading, setInitialLoading] = useState(Boolean(initialTourId))
  const [initialRetry, setInitialRetry] = useState(0)
  const [scenes, setScenes] = useState<Scene[]>([])
  const [editing, setEditing] = useState<Scene | undefined>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [formVersion, setFormVersion] = useState(0)
  const [editor, setEditor] = useState<{ sceneId: string; preview: boolean } | null>(null)
  useEffect(() => { setEditor(null); setEditing(undefined); setNotice('') }, [guidedStep])
  function report(cause: unknown) {
    if (cause instanceof ApiError && (cause.status === 401 || cause.status === 403)) {
      setError(t("La sesión se actualizó. Volvé a intentar la operación."))
      onExpired()
    }
    else setError(cause instanceof Error ? cause.message : t("No se pudo completar la operación"))
  }
  useEffect(() => {
    if (initialTourId) return
    let active = true
    listTours().then((items) => { if (active) setTours(items) }).catch((cause) => { if (active) report(cause) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])
  useEffect(() => {
    if (!initialTourId) return
    let active = true
    setInitialLoading(true); setError('')
    Promise.all([toursApi.get(initialTourId), scenesApi.list(initialTourId)])
      .then(([tour, items]) => {
        if (!active) return
        if (organization && tour.organization_id !== organization.id) throw new Error(t("Recorrido no encontrado para este cliente."))
        setSelected(tour); setScenes(items)
      })
      .catch((cause) => { if (active) report(cause) })
      .finally(() => { if (active) setInitialLoading(false) })
    return () => { active = false }
  }, [initialTourId, initialRetry])
  async function act(action: () => Promise<void>) {
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    try { await action() } catch (cause) { report(cause) } finally { setBusy(false) }
  }
  async function refresh(id: string) {
    const [tour, items] = await Promise.all([toursApi.get(id), scenesApi.list(id)])
    setSelected(tour); setScenes(items)
  }
  async function move(scene: Scene, delta: number) {
    const ids = scenes.map((item) => item.id)
    const index = ids.indexOf(scene.id), target = index + delta
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    await scenesApi.reorder(selected!.id, ids); await refresh(selected!.id)
  }
  const readyScenes = scenes.filter((scene) => scene.panorama_asset_id).length
  const creationPanel = organization?.deleted_at ? <p className="card p-5 text-sm text-muted">{t("Organización eliminada. Los recorridos se conservan; no se crean recorridos nuevos.")}</p> : <section id="nuevo-recorrido" className="card scroll-mt-6 p-5 sm:p-6 xl:sticky xl:top-6"><span className="badge badge-ready mb-4">{t("EMPEZÁ ACÁ")}</span><h3>{t("Nuevo recorrido")}</h3><p className="muted mb-6 mt-2">{t("Primero los datos. Las fotos las agregamos en el siguiente paso.")}</p>
          {readOnly ? <p className="muted">{t("Tu rol permite consultar y previsualizar los recorridos. Un editor o administrador puede modificarlos.")}</p> : <TourForm key={formVersion} busy={busy || loading} onSave={(data) => act(async () => {
            if (organization) await businessApi.createTour(organization.id, data)
            else await toursApi.create(data)
            setTours(await listTours()); setFormVersion((value) => value + 1)
            setNotice(t("Recorrido creado. Abrilo desde tu colección para agregar los ambientes."))
          })} />}
        </section>
  if (initialTourId && !selected) return <section>
    {onBackToCollection && <button onClick={onBackToCollection}>{t("Volver a los recorridos")}</button>}
    {error && <p role="alert">{t(error)}</p>}
    {initialLoading ? <p role="status">{t("Abriendo el recorrido del trabajo…")}</p> : <button onClick={() => setInitialRetry((value) => value + 1)}>{t("Reintentar abrir el recorrido")}</button>}
  </section>
  return <section>
    {error && <p role="alert">{t(error)}</p>}
    {notice && <p role="status" className="mb-5 flex items-center gap-2 rounded-xl border border-accent/25 bg-accent/10 px-4 py-3 text-accent"><Icon name="check" className="size-4 shrink-0" />{t(notice)}</p>}
    {!selected ? <>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div><p className="eyebrow mb-3">{t("Cada espacio tiene una historia")}</p><h2 className="text-3xl sm:text-4xl">{organization ? t("Recorridos de {0}", [organization.name]) : t("Mis recorridos")}</h2><p className="muted mt-3">{t("Prepará una visita que tus clientes puedan explorar desde donde estén.")}</p></div>
        {!readOnly && !organization?.deleted_at && (onCreateWork ? <button className="btn-primary" onClick={onCreateWork}>{t("Nuevo trabajo")}</button> : <a href="#nuevo-recorrido" className="btn-primary inline-flex min-h-11 items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold"><Icon name="plus" className="size-4" />{t("Nuevo recorrido")}</a>)}
      </div>
      {!onCreateWork && <WorkflowGuide />}
      <div className={`mt-8 grid items-start gap-6 ${onCreateWork ? '' : 'xl:grid-cols-[minmax(0,1fr)_22rem]'}`}>
        <div className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center gap-2"><h3 className="mr-auto">{t("Tu colección")}</h3><span className="badge">{tours.length} {tours.length === 1 ? t("recorrido") : t("recorridos")}</span><span className="badge badge-ready">{tours.filter((tour) => tour.status === 'published').length} {tours.filter((tour) => tour.status === 'published').length === 1 ? 'publicado' : t("publicados")}</span></div>
          {loading && <p className="card p-8 text-sm text-muted" role="status">{t("Buscando tus recorridos…")}</p>}
          {!loading && !tours.length && <div className="card grid min-h-80 place-content-center px-6 py-10 text-center"><span className="mx-auto mb-5 grid size-16 place-items-center rounded-2xl bg-accent/10 text-accent"><Icon name="orbit" className="size-8" /></span><h3>{t("Tu primer recorrido empieza con un nombre")}</h3><p className="muted mx-auto mt-3 max-w-sm">{onCreateWork ? t("Creá un trabajo para {0} y prepará su recorrido paso a paso.", [organization?.name]) : t("Completá el formulario y después agregá los ambientes. Podés preparar todo antes de publicarlo.")}</p>{organization?.deleted_at ? null : onCreateWork ? <button className="btn-primary mt-5" onClick={onCreateWork}>{t("Crear primer trabajo")}</button> : <a href="#nuevo-recorrido" className="mt-5 text-sm font-semibold text-accent underline underline-offset-4">{t("Crear mi primer recorrido →")}</a>}</div>}
          <ul className="tour-list grid list-none gap-4 md:grid-cols-2">{tours.map((tour) => <li key={tour.id} className="card flex min-w-0 flex-col overflow-hidden">
            <TourCover />
            <div className="flex flex-1 flex-col p-5"><div className="mb-3"><span className={tour.status === 'published' ? 'badge badge-ready' : 'badge'}><span className={`size-1.5 rounded-full ${tour.status === 'published' ? 'bg-accent' : 'bg-subtle'}`} />{tour.status === 'published' ? t("Publicado") : t("Borrador")}</span></div>
              <h4 className="break-words text-lg">{tour.title}</h4><p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted">{tour.description || t("Agregá ambientes y contá la historia de este espacio.")}</p>
              <div className="mt-auto pt-5"><button className="w-full justify-between" aria-label={t("Abrir {0}", [tour.title])} disabled={busy} onClick={() => { if (onOpenTour) onOpenTour(tour.id); else void act(async () => { setEditing(undefined); await refresh(tour.id) }) }}>{t("Editar recorrido")}<Icon name="arrow" className="size-4" /></button></div>
            </div>
          </li>)}</ul>
        </div>
        {!onCreateWork && <div>{creationPanel}</div>}
      </div>
    </> : editor ? <TourEditor tour={selected} scenes={scenes} initialSceneId={editor.sceneId} preview={editor.preview}
      onRefresh={() => refresh(selected.id)} onDirtyChange={onDirtyChange} onClose={() => setEditor(null)} /> : readOnly ? <TourEditor tour={selected} scenes={scenes} initialSceneId={selected.start_scene_id || scenes[0]?.id || ''} preview={true} onRefresh={() => refresh(selected.id)} onClose={() => { if (onBackToCollection) onBackToCollection(); else setSelected(null) }} /> : <>
      {(!initialTourId || onBackToCollection) && <button className="btn-quiet mb-5 -ml-3" disabled={busy} onClick={() => { if (onBackToCollection) onBackToCollection(); else void act(async () => { setTours(await listTours()); setSelected(null); setEditing(undefined) }) }}><Icon name="arrow" className="size-4 rotate-180" />{t("Volver a mis recorridos")}</button>}
      {!guidedStep && <div className="mb-7 flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><p className="eyebrow mb-2">{t("Editor del recorrido")}</p><h2 className="break-words text-3xl">{selected.title}</h2><div className="mt-3 flex flex-wrap items-center gap-2"><span className={selected.status === 'published' ? 'badge badge-ready' : 'badge'}>{selected.status === 'published' ? t("Tiene versión publicada") : t("Borrador · Sin publicar")}</span><span className="text-xs text-muted">{scenes.length}{' '}{t("ambientes ·")} {readyScenes}{' '}{t("con foto 360°")}</span></div></div>
        <button className="btn-soft" disabled={busy || !scenes.length} onClick={() => setEditor({ sceneId: selected.start_scene_id || scenes[0].id, preview: true })}><Icon name="eye" className="size-4" />{t("Previsualizar recorrido")}</button>
      </div>}
      {!guidedStep && <WorkflowGuide compact />}
      {(!guidedStep || guidedStep === 'review') && <details className="card mt-7 p-5 sm:p-6" id="datos"><summary className="flex flex-wrap items-center justify-between gap-2"><span><span className="eyebrow mb-1 block">{t("01 · La presentación")}</span><span className="text-base font-semibold">{t("Datos del recorrido")}</span></span><span className="text-xs font-semibold text-accent">{t("Editar datos")} <span aria-hidden="true">↓</span></span></summary><p className="muted mb-5 mt-3">{t("Este título y descripción se mostrarán en la visita pública.")}</p>
        <TourForm key={selected.id} tour={selected} busy={busy} onSave={(data) => act(async () => { setSelected(await toursApi.update(selected.id, data)); setNotice(t("Información guardada.")) })} />
      </details>}
      {(!guidedStep || guidedStep !== 'review') && <section id="ambientes" className="mt-9 scroll-mt-6"><div className="mb-5"><p className="eyebrow mb-2">{t("02 · Los espacios")}</p><h3 className="text-2xl">{guidedStep === 'connections' ? t("Conectá los ambientes") : t("Fotos de los ambientes")}</h3><p className="muted mt-2">{guidedStep === 'connections' ? t("Elegí un ambiente para crear o editar sus conexiones. Después podrás agregar la vuelta.") : t("Creá cada ambiente y cargá una panorámica 360° por posición.")}</p></div>
      <div className={guidedStep === 'connections' ? '' : 'grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_21rem]'}>
      <div className="min-w-0">
        {!scenes.length && <div className="card border-dashed p-8 text-center"><Icon name="image" className="mx-auto mb-4 size-9 text-subtle" /><h4>{t("Todavía no hay ambientes")}</h4><p className="muted mx-auto mt-2 max-w-xs">{t("Empezá con «Living», «Cocina» o el primer espacio que quieras mostrar.")}</p></div>}
        <ol className="scene-items">{scenes.map((scene, index) => <li key={scene.id}>
          <div className="flex flex-wrap items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-surface-850 text-sm font-semibold text-muted">{String(index + 1).padStart(2, '0')}</span><strong className="mr-auto break-words text-lg">{scene.name}</strong>{scene.id === selected.start_scene_id && <span className="badge badge-ready">{t("Ambiente inicial")}</span>}</div>
          {guidedStep !== 'connections' && <PanoramaUpload scene={scene} onReady={() => refresh(selected.id)} />}
          <div className="row-actions">
            {guidedStep !== 'photos' && <button className="btn-primary" disabled={busy || !scene.panorama_asset_id} onClick={() => setEditor({ sceneId: scene.id, preview: false })}><Icon name="link" className="size-4" />{t("Conectar")} {scene.name}</button>}
            {guidedStep !== 'connections' && <button disabled={busy} onClick={() => setEditing(scene)}>{t("Editar")} {scene.name}</button>}
            <button className="btn-quiet text-xs" disabled={busy || scene.id === selected.start_scene_id} onClick={() => void act(async () => {
              await toursApi.startScene(selected.id, scene.id); await refresh(selected.id)
              setNotice(t("El recorrido comenzará en {0}.{1}", [scene.name, selected.status === 'published' ? ' Volvé a publicar para actualizar el enlace compartido.' : '']))
            })}>{t("Usar")} {scene.name}{' '}{t("como inicial")}</button>
          </div>
          {!scene.panorama_asset_id && <p className="text-xs text-subtle">{t("Para conectar este ambiente, cargá y validá primero su panorámica.")}</p>}
          {guidedStep !== 'connections' && <div className="mt-4 flex flex-wrap items-center gap-1 border-t border-line/60 pt-3">
            <button className="btn-quiet px-3" disabled={busy || index === 0} aria-label={t("Subir {0}", [scene.name])} onClick={() => void act(() => move(scene, -1))}>↑</button>
            <button className="btn-quiet px-3" disabled={busy || index === scenes.length - 1} aria-label={t("Bajar {0}", [scene.name])} onClick={() => void act(() => move(scene, 1))}>↓</button>
            <button className="btn-quiet ml-auto text-xs text-rose-300" disabled={busy} onClick={() => void act(async () => {
              const impact = await scenesApi.deletionImpact(selected.id, scene.id)
              const detail = impact.incoming_connections ? t(" También se eliminarán {0} conexiones que llegan a este ambiente.", [impact.incoming_connections]) : ''
              if (!window.confirm(t("¿Eliminar el ambiente {0} y sus puntos?{1}", [scene.name, detail]))) return
              await scenesApi.remove(selected.id, scene.id, impact.incoming_connections > 0)
              setEditing(undefined); await refresh(selected.id)
            })}>{t("Eliminar")} {scene.name}</button>
          </div>}
        </li>)}</ol>
      </div>
      {guidedStep !== 'connections' && <aside className="card order-first p-5 xl:sticky xl:top-6 xl:order-last"><p className="eyebrow mb-2">{t("Agregá una parada")}</p><h3 className="mb-2">{editing ? t("Editar ambiente") : t("Nuevo ambiente")}</h3><p className="muted mb-5">{t("Un ambiente es una posición desde donde el visitante puede mirar alrededor.")}</p>
        <SceneForm key={editing?.id || `new-${formVersion}`} scene={editing} busy={busy} onCancel={() => setEditing(undefined)} onSave={(data) => act(async () => {
          if (editing) await scenesApi.update(selected.id, editing.id, data)
          else await scenesApi.create(selected.id, data)
          setEditing(undefined); setFormVersion((value) => value + 1); await refresh(selected.id)
          setNotice(editing ? t("Ambiente actualizado.") : t("Ambiente agregado. Elegí su foto 360° para continuar."))
        })} />
        <div className="mt-5 rounded-xl bg-surface-950 p-3"><p className="text-xs font-semibold text-muted">{t("¿Qué foto necesito?")}</p><p className="mt-1 text-xs leading-relaxed text-muted">{t("JPEG 360° completo, proporción 2:1, hasta 50 MiB. Una foto común o panorámica parcial del celular no cubre toda la esfera.")}</p></div>
      </aside>}
      </div></section>}
      {!guidedStep && <section className="my-8 rounded-2xl bg-canvas p-5 text-white sm:flex sm:items-center sm:justify-between sm:gap-6 sm:p-6"><div><p className="mb-2 text-[10px] font-bold tracking-[.16em] text-accent">{t("03 · CONECTÁ Y REVISÁ")}</p><h3>{t("Recorré tu espacio antes de compartirlo")}</h3><p className="mt-2 max-w-xl text-sm text-white/60">{t("Desde cada ambiente podés agregar puntos de paso e información. Creá también la conexión de vuelta.")}</p></div><button className="mt-4 shrink-0 border-transparent bg-accent text-canvas hover:bg-accent/90 sm:mt-0" disabled={busy || !readyScenes} onClick={() => { const first = scenes.find((scene) => scene.panorama_asset_id); if (first) setEditor({ sceneId: first.id, preview: false }) }}><Icon name="link" className="size-4" />{t("Abrir editor de conexiones")}</button></section>}
      {guidedStep === 'review' && <section className="card my-6 p-6"><h3>{t("Revisá antes de publicar")}</h3><p className="muted my-4">{t("Recorré los ambientes y comprobá las conexiones de ida y vuelta.")}</p><button className="btn-primary" disabled={!readyScenes || busy} onClick={() => setEditor({ sceneId: selected.start_scene_id || scenes[0].id, preview: true })}>{t("Previsualizar recorrido")}</button></section>}
      {(!guidedStep || guidedStep === 'review') && <div id="publicacion" className="scroll-mt-6"><p className="eyebrow mb-3">{t("04 · Tu recorrido, listo para visitar")}</p><PublicationPanel tour={selected} onChanged={async () => { await refresh(selected.id); await onPublicationChange?.() }} /></div>}
      {!guidedStep && <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-5"><p className="text-xs text-subtle">{t("Tus cambios se conservan al cerrar sesión. Sólo se muestran al público cuando publicás.")}</p><button className="btn-quiet text-xs text-rose-300" disabled={busy} onClick={() => {
        if (window.confirm(t("¿Eliminar {0} y todos sus ambientes?", [selected.title]))) void act(async () => {
          await toursApi.remove(selected.id); setSelected(null); setTours(await listTours())
        })
      }}>{t("Eliminar recorrido")}</button></div>}
      {guidedStep && <div className="my-6 border-t border-line pt-5">
        <p className="mb-3 text-sm text-muted">{guidedStep === 'photos' ? t("{0} de {1} ambientes con foto validada.", [readyScenes, scenes.length]) : guidedStep === 'connections' ? t("Probá los puntos y agregá la vuelta desde el ambiente de destino.") : selected.status === 'published' ? t("El enlace ya está disponible. Continuá para registrar la entrega.") : t("Publicá el recorrido para habilitar el enlace de entrega.")}</p>
        <button className="btn-primary" disabled={busy || (guidedStep === 'photos' && (!scenes.length || readyScenes !== scenes.length)) || (guidedStep === 'review' && selected.status !== 'published')}
          onClick={() => onStepChange?.(guidedStep === 'photos' ? 'connections' : guidedStep === 'connections' ? 'review' : 'delivery')}>
          {guidedStep === 'photos' ? t("Continuar a conexiones") : guidedStep === 'connections' ? t("Revisar recorrido") : t("Continuar a entrega")}
        </button>
      </div>}
    </>}
  </section>
}
