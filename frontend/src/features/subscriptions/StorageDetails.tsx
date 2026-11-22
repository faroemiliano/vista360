import { useEffect, useState } from 'react'
import { t } from '../../i18n'
import { subscriptionApi } from '../../api/subscriptions'
import type { components } from '../../api/schema'
import { storageBytes } from './storage'

export function StorageDetails({ workspaceId }: { workspaceId: string }) {
  const [data, setData] = useState<components['schemas']['StorageReport'] | null>(null)
  const [error, setError] = useState(false)
  const [offset, setOffset] = useState(0)
  const [version, setVersion] = useState(0)
  useEffect(() => {
    let active = true
    setData(null); setError(false)
    const load = async () => {
      try { const result = await subscriptionApi.storage(workspaceId, offset); if (active) { setData(result); setError(false) } }
      catch { if (active) setError(true) }
    }
    void load()
    const refresh = () => { if (document.visibilityState === 'visible') void load() }
    const interval = window.setInterval(refresh, 15_000)
    window.addEventListener('focus', refresh)
    return () => { active = false; window.clearInterval(interval); window.removeEventListener('focus', refresh) }
  }, [workspaceId, offset, version])
  return <section className="mt-6" aria-label={t('Consumo por proyecto')}>
    <h3 className="text-lg font-semibold">{t('Consumo por proyecto')}</h3>
    <p className="my-3 text-xs leading-relaxed text-muted">{t('Suma los archivos de tus proyectos, sin reservas ni archivos temporales. Las cargas se suman cuando termina su procesamiento.')}</p>
    {error ? <p role="alert">{t('No se pudo actualizar el consumo.')} <button className="btn-quiet" onClick={() => setVersion(value => value + 1)}>{t('Reintentar')}</button></p> : !data && <p role="status">{t('Consultando consumo…')}</p>}
    {data && <>
      <dl className="mb-4 grid grid-cols-2 gap-3 text-xs">
        {([['Originales', data.totals.original_bytes], ['Imágenes procesadas', data.totals.derived_bytes], ['Copias publicadas', data.totals.public_bytes], ['PDF de entrega', data.totals.pdf_bytes]] as const).map(([label, value]) => <div key={label} className="rounded-xl border border-line p-3"><dt className="text-muted">{t(label)}</dt><dd className="mt-1 font-semibold tabular-nums">{storageBytes(value)}</dd></div>)}
      </dl>
      {!data.projects.length ? <p className="text-sm text-muted">{t('No hay proyectos en esta página.')}</p> : <ul className="divide-y divide-line rounded-xl border border-line px-3">
        {data.projects.map(project => <li key={project.tour_id} className="flex min-w-0 items-center justify-between gap-3 py-3 text-sm"><span className="min-w-0 break-words">{project.title}</span><span className="shrink-0 font-semibold tabular-nums">{storageBytes(project.used_bytes)}</span></li>)}
      </ul>}
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
        <button className="btn-quiet" disabled={offset === 0} onClick={() => setOffset(value => Math.max(0, value - data.limit))}>{t('Anterior')}</button>
        <span>{data.projects.length ? `${offset + 1}–${offset + data.projects.length}` : '0'} {t('de')} {data.total}</span>
        <button className="btn-quiet" disabled={offset + data.limit >= data.total} onClick={() => setOffset(value => value + data.limit)}>{t('Siguiente')}</button>
      </div>
    </>}
  </section>
}
