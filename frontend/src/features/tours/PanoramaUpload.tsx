import { t } from '../../i18n'
import { useEffect, useRef, useState } from 'react'
import { apiResourceUrl, assetsApi, uploadPanorama } from '../../api/client'
import type { AssetState, Scene } from '../../api/client'
import { PanoramaViewer } from '../../viewer/PanoramaViewer'
import type { PanoramaScene } from '../../viewer/types'
import { useBlockNavigation } from '../../app/navigation'
import { Icon } from '../../components/Icon'

export function PanoramaUpload({ scene, onReady }: { scene: Scene; onReady: () => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null)
  const [progress, setProgress] = useState(0)
  const [busy, setBusy] = useState(false)
  useBlockNavigation(Boolean(file) || busy)
  const [asset, setAsset] = useState<AssetState | null>(null)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<PanoramaScene | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const controller = useRef<AbortController | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; controller.current?.abort() }
  }, [])

  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const id = asset?.id || scene.pending_panorama_asset_id
    if (!id || (asset && ['ready', 'rejected'].includes(asset.status))) return
    async function poll() {
      try {
        const result = await assetsApi.state(id!)
        if (!active) return
        setAsset(result)
        if (result.status === 'ready') {
          setBusy(false); setFile(null)
          if (input.current) input.current.value = ''
          await onReady()
        } else if (result.status === 'rejected') {
          setBusy(false); setError(result.error_message || t("El archivo fue rechazado."))
          await onReady()
        } else timer = setTimeout(poll, 1500)
      } catch (cause) {
        if (active) { setBusy(false); setError(cause instanceof Error ? cause.message : t("No se pudo consultar la carga.")) }
      }
    }
    timer = setTimeout(poll, 1500)
    return () => { active = false; if (timer) clearTimeout(timer) }
  }, [asset?.id, asset?.status, scene.pending_panorama_asset_id])

  useEffect(() => {
    let active = true
    if (!showPreview || !scene.panorama_asset_id) { setPreview(null); return }
    assetsApi.panorama(scene.tour_id, scene.id).then((result) => {
      if (active) setPreview({ id: scene.id, name: scene.name,
        sources: result.sources.map((source) => ({ ...source, url: apiResourceUrl(source.url) })),
        initialView: { yaw: scene.initial_yaw ?? 0, pitch: scene.initial_pitch ?? 0, hfov: scene.initial_hfov ?? 90 }, hotspots: [] })
    }).catch((cause: Error) => { if (active) setError(cause.message) })
    return () => { active = false }
  }, [showPreview, scene.panorama_asset_id, scene.initial_yaw, scene.initial_pitch, scene.initial_hfov, scene.name])

  return <div className="panorama-upload">
    <div className="flex items-center gap-2 text-sm font-semibold"><Icon name={scene.panorama_asset_id ? 'check' : 'image'} className={`size-4 ${scene.panorama_asset_id ? 'text-accent' : 'text-subtle'}`} /><p>{scene.panorama_asset_id ? t("Panorámica validada.") : t("Sin panorámica.")}</p></div>
    <label>{t("Elegí la foto 360° de este ambiente")}<input aria-label={t("Panorámica JPEG para {0}", [scene.name])} ref={input} type="file" accept="image/jpeg,.jpg,.jpeg" disabled={busy}
        onChange={(event) => { setFile(event.target.files?.[0] || null); setError('') }} />
    </label>
    <button className="btn-soft" disabled={!file || busy} onClick={async () => {
      if (!file) return
      controller.current = new AbortController()
      setBusy(true); setError(''); setAsset(null); setProgress(0)
      try {
        const result = await uploadPanorama(scene.tour_id, scene.id, file,
          (value) => { if (mounted.current) setProgress(value) }, controller.current.signal)
        if (!mounted.current) return
        setAsset(result)
        if (result.status === 'rejected') { setBusy(false); setError(result.error_message || t("Archivo rechazado.")) }
      } catch (cause) {
        if (mounted.current) { setBusy(false); setError(cause instanceof Error ? cause.message : t("No se pudo cargar la imagen.")) }
      }
    }}>{scene.panorama_asset_id ? t("Reemplazar panorámica") : t("Subir panorámica")}</button>
    {busy && <>
      <progress max={100} value={progress} aria-label={t("Progreso de {0}", [scene.name])} />
      <p className="mt-2 text-muted" role="status">{progress < 100 ? t("Subiendo {0}%", [progress]) : t("Foto recibida. Estamos comprobando que esté lista para el visor…")}</p>
    </>}
    {asset && asset.status !== 'ready' && !busy && <p className="text-xs text-muted">{asset.status === 'rejected' ? t("La foto no se pudo validar. Revisá el mensaje e intentá otra vez.") : t("Tu foto se está preparando. Podés seguir trabajando.")}</p>}
    {error && <p role="alert">{t(error)}</p>}
    {scene.panorama_asset_id && <button onClick={() => { setError(''); setShowPreview(!showPreview) }}>
      {showPreview ? t("Cerrar panorama de {0}", [scene.name]) : t("Ver panorama de {0}", [scene.name])}
    </button>}
    {preview && <PanoramaViewer scene={preview} onNavigate={() => {}} experimentalTools={false} />}
  </div>
}
