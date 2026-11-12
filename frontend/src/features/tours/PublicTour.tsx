import { LanguageSwitcher } from '../../i18n/LanguageSwitcher'
import { t } from '../../i18n'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { apiResourceUrl, publicationsApi } from '../../api/client'
import type { PublicTourData } from '../../api/client'
import { PanoramaViewer } from '../../viewer/PanoramaViewer'
import type { PanoramaScene } from '../../viewer/types'
import { directionsUrl } from '../../lib/maps'
import { BrandMark } from '../../components/BrandMark'

export function PublicTour({ slug, embedded = false }: { slug: string; embedded?: boolean }) {
  const container = useRef<HTMLElement>(null)
  const roomId = useId()
  const [fullscreen, setFullscreen] = useState(false)
  const [fullscreenError, setFullscreenError] = useState('')
  useEffect(() => {
    const changed = () => setFullscreen(document.fullscreenElement === container.current)
    document.addEventListener('fullscreenchange', changed)
    return () => document.removeEventListener('fullscreenchange', changed)
  }, [])
  const [tour, setTour] = useState<PublicTourData | null>(null)
  const [activeId, setActiveId] = useState('')
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    setTour(null); setError('')
    publicationsApi.publicTour(slug).then((data) => {
      if (active) { setTour(data); setActiveId(data.start_scene_id) }
    }).catch((cause: Error) => { if (active) setError(cause.message) })
    return () => { active = false }
  }, [slug, attempt])
  const scene = tour?.scenes.find((item) => item.id === activeId)
  const panorama = useMemo<PanoramaScene | null>(() => scene ? {
    id: scene.id, name: scene.name, initialView: scene.initial_view,
    sources: scene.sources.map((source) => ({ ...source, url: apiResourceUrl(source.url), credentials: 'omit' })),
    hotspots: scene.hotspots.map((point) => point.type === 'navigation'
      ? { id: point.id, type: 'navigation', label: point.label, yaw: point.yaw, pitch: point.pitch, targetSceneId: point.target_scene_id! }
      : { id: point.id, type: 'info', label: point.label, yaw: point.yaw, pitch: point.pitch, text: point.content!.text }),
  } : null, [scene])
  return <main ref={container} className={`public-tour${embedded ? ' tour-embed' : ''}`}>
    <header className="public-tour-header"><LanguageSwitcher compact />
      {!embedded && <a href="/inicio" aria-label={t("Vision360 — Inicio")} className="flex shrink-0 items-center gap-2 font-bold tracking-tight text-accent"><BrandMark className="size-8" /><span className="hidden sm:inline">Vision360</span></a>}
      {tour ? <div className="public-tour-heading min-w-0 flex-1 text-right"><h1>{tour.title}</h1><h2>{scene?.name}</h2></div> : <span className="eyebrow text-right">{t("Un espacio para explorar")}</span>}
      {tour?.public_location && <a className="btn-primary inline-flex min-h-11 shrink-0 items-center rounded-xl px-3 py-2 text-sm font-semibold" href={directionsUrl(tour.public_location)} target="_blank" rel="noopener noreferrer" title={t("Cómo llegar a {0}", [tour.public_location.label])}>{t("Cómo llegar")}</a>}
      {embedded && document.fullscreenEnabled && <button type="button" className="!px-3" aria-label={fullscreen ? t('Salir de pantalla completa') : t('Pantalla completa')} title={fullscreen ? t('Salir de pantalla completa') : t('Pantalla completa')} onClick={async () => {
        setFullscreenError('')
        try {
          if (document.fullscreenElement) await document.exitFullscreen()
          else await container.current?.requestFullscreen()
        } catch { setFullscreenError(t('No se pudo abrir pantalla completa. Revisá los permisos de la página que contiene el recorrido.')) }
      }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" /></svg></button>}
    </header>
    {fullscreenError && <p role="alert">{t(fullscreenError)}</p>}
    {!tour && !error && <p role="status">{t("Cargando recorrido…")}</p>}
    {error && <><h1>{t("Recorrido no disponible")}</h1><p role="alert">{t(error)}</p><button onClick={() => setAttempt((value) => value + 1)}>{t("Reintentar recorrido")}</button></>}
    {tour && <>
      {panorama && <PanoramaViewer scene={panorama} onNavigate={setActiveId} experimentalTools={false} />}
      {embedded && <div className="embed-room"><label htmlFor={roomId}>{t('Ambiente')}</label><select id={roomId} value={activeId} onChange={event => setActiveId(event.target.value)}>{tour.scenes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>}
      {!embedded && <nav className="row-actions" aria-label={t("Ambientes del recorrido")}>{tour.scenes.map((item) => <button key={item.id}
        aria-current={item.id === activeId ? 'true' : undefined} onClick={() => setActiveId(item.id)}>{item.name}</button>)}</nav>
      }
      {!embedded && <>
      {tour.public_location && <p className="break-words text-sm">{t("Ubicación:")} {tour.public_location.label.startsWith('https://') ? t("Ubicación compartida en Google Maps") : tour.public_location.label}</p>}
      {tour.description && <p>{tour.description}</p>}
      <ul className="saved-hotspots">{scene?.hotspots.map((point) => <li key={point.id}>
        {point.type === 'navigation' ? <button onClick={() => setActiveId(point.target_scene_id!)}>{t("Ir:")} {point.label}</button>
          : <><strong>{point.label}</strong><p>{point.content!.text}</p></>}
      </li>)}</ul>
      </>}
    </>}
  </main>
}
