import { useEffect, useMemo, useState } from 'react'
import { apiResourceUrl, publicationsApi } from '../../api/client'
import type { PublicTourData } from '../../api/client'
import { PanoramaViewer } from '../../viewer/PanoramaViewer'
import type { PanoramaScene } from '../../viewer/types'
import { BrandMark } from '../../components/BrandMark'

export function PublicTour({ slug }: { slug: string }) {
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
  return <main className="public-tour">
    <header className="public-tour-header">
      <a href="/inicio" aria-label="Vision360 — Inicio" className="flex shrink-0 items-center gap-2 font-bold tracking-tight text-accent"><BrandMark className="size-8" /><span className="hidden sm:inline">Vision360</span></a>
      {tour ? <div className="min-w-0 text-right"><h1>{tour.title}</h1><h2>{scene?.name}</h2></div> : <span className="eyebrow text-right">Un espacio para explorar</span>}
    </header>
    {!tour && !error && <p role="status">Cargando recorrido…</p>}
    {error && <><h1>Recorrido no disponible</h1><p role="alert">{error}</p><button onClick={() => setAttempt((value) => value + 1)}>Reintentar recorrido</button></>}
    {tour && <>
      {panorama && <PanoramaViewer scene={panorama} onNavigate={setActiveId} experimentalTools={false} />}
      <nav className="row-actions" aria-label="Ambientes del recorrido">{tour.scenes.map((item) => <button key={item.id}
        aria-current={item.id === activeId ? 'true' : undefined} onClick={() => setActiveId(item.id)}>{item.name}</button>)}</nav>
      {tour.description && <p>{tour.description}</p>}
      <ul className="saved-hotspots">{scene?.hotspots.map((point) => <li key={point.id}>
        {point.type === 'navigation' ? <button onClick={() => setActiveId(point.target_scene_id!)}>Ir: {point.label}</button>
          : <><strong>{point.label}</strong><p>{point.content!.text}</p></>}
      </li>)}</ul>
    </>}
  </main>
}
