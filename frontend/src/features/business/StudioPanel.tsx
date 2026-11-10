import { t } from '../../i18n'
import { useEffect, useState } from 'react'
import { businessApi } from '../../api/business'
import type { ServiceJob } from '../../api/business'
import type { components } from '../../api/schema'

import { statusName, statuses } from './workflow'

export function StudioPanel({ onPrepare, embedded = false, requestId = '', onShowAll, workspaceId }: { onPrepare?: (job: ServiceJob) => void; embedded?: boolean; workspaceId?: string; requestId?: string; onShowAll?: () => void } = {}) {
  const [jobs, setJobs] = useState<ServiceJob[]>([])
  const [offset, setOffset] = useState(0)
  const [version, setVersion] = useState(0)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [history, setHistory] = useState<Record<string, components['schemas']['EventResponse'][]>>({})
  useEffect(() => {
    let active = true; setLoading(true); setError('')
    const load = requestId ? businessApi.serviceRequest(requestId, workspaceId).then((item) => [item]) : businessApi.jobs(offset, workspaceId)
    load.then((rows) => { if (active) setJobs(rows) }).catch((cause: Error) => { if (active) setError(cause.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [offset, version, requestId, workspaceId])
  return <section>{!embedded && <><p className="eyebrow mb-3">{t("Operación de Vision360 Studio")}</p><h2 className="text-3xl">{t("Solicitudes de digitalización")}</h2><p className="muted mt-3">{t("Seguimiento interno del trabajo. Los estados no realizan cobros ni publican recorridos automáticamente.")}</p></>}
    {requestId && <button className="my-4" onClick={onShowAll}>{t("Ver todas las solicitudes")}</button>}
    {error && <p role="alert">{t(error)}</p>}{loading && <p role="status" className="my-5">{t("Cargando solicitudes…")}</p>}
    {!loading && !jobs.length && <p className="card my-6 p-6 text-sm text-muted">{t("No hay solicitudes en esta página. Las consultas recibidas desde la web aparecerán acá.")}</p>}
    <div className="my-6 space-y-3">{jobs.map((job) => <article key={job.id} className="card overflow-hidden">
      <details className="group" open={requestId === job.id || undefined}>
        <summary className="flex cursor-pointer list-none items-center gap-3 p-5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
          <h3 className="min-w-0 flex-1 break-words">{job.name}</h3>
          <span className="badge shrink-0">{statusName(job.status)}</span>
          <svg className="size-5 shrink-0 text-accent transition-transform group-open:rotate-180 motion-reduce:transition-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
        </summary>
        <div className="border-t border-line p-5">
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div className="min-w-0"><dt className="text-xs text-muted">{t("Email")}</dt><dd className="mt-1 break-words">{job.email}</dd></div>
            <div className="min-w-0"><dt className="text-xs text-muted">WhatsApp</dt><dd className="mt-1 break-words">{job.whatsapp}</dd></div>
            <div className="min-w-0"><dt className="text-xs text-muted">{t("Localidad")}</dt><dd className="mt-1 break-words">{job.locality}</dd></div>
            <div className="min-w-0"><dt className="text-xs text-muted">{t("Tipo de propiedad")}</dt><dd className="mt-1 break-words">{job.property_kind}</dd></div>
            <div><dt className="text-xs text-muted">{t("Superficie aproximada")}</dt><dd className="mt-1">{job.area_m2} m²</dd></div>
            <div><dt className="text-xs text-muted">{t("Ambientes")}</dt><dd className="mt-1">{job.rooms}</dd></div>
            <div className="min-w-0 sm:col-span-2"><dt className="text-xs text-muted">{t("Mensaje")}</dt><dd className="mt-1 whitespace-pre-wrap break-words">{job.message || t("Sin mensaje adicional.")}</dd></div>
          </dl>
          {job.notification_status && <p className="mt-4 text-xs text-muted">{{ pending: t("Aviso por email pendiente"), accepted: t("Aviso por email enviado"), failed: t("No se pudo enviar el aviso por email. La solicitud está guardada."), not_configured: t("Aviso por email pendiente de activación") }[job.notification_status]}</p>}
          <p className="my-4 break-all text-[11px] text-subtle">{t("Referencia")} {job.id}</p>
          {!job.organization_id && <form key={job.status} className="grid gap-3 sm:grid-cols-3" aria-label={t("Actualizar solicitud {0}", [job.id])} onSubmit={async (event) => {
            event.preventDefault(); if (busy) return
            const data = new FormData(event.currentTarget); setBusy(true); setError('')
            try { await businessApi.transition(job.id, { expected_status: job.status, status: String(data.get('status')) as ServiceJob['status'], note: String(data.get('note')) }, workspaceId); setVersion((value) => value + 1); setHistory({}) }
            catch (cause) { setError(cause instanceof Error ? cause.message : t("No se pudo actualizar.")) }
            finally { setBusy(false) }
          }}><label>{t("Nuevo estado")}<select name="status" required defaultValue=""><option value="" disabled>{t("Elegí un estado")}</option>{statuses.map((status) => <option key={status} value={status}>{statusName(status)}</option>)}</select></label><label>{t("Nota interna")}<input name="note" maxLength={2000} /></label><button className="self-end mb-4" disabled={busy}>{t("Actualizar estado")}</button></form>}
          {job.organization_id ? <p className="my-4 text-sm text-accent">{t("Ya tiene un trabajo vinculado. Abrilo desde Trabajos en su organización.")}</p> : onPrepare && !['FINALIZADO', 'CANCELADO'].includes(job.status) && <button className="btn-primary mr-3" onClick={() => onPrepare(job)}>{t("Preparar trabajo para")} {job.name}</button>}
          <button disabled={busy} onClick={async () => {
            try { setHistory((current) => ({ ...current, [job.id]: [] })); const rows = await businessApi.events(job.id, workspaceId); setHistory((current) => ({ ...current, [job.id]: rows })) }
            catch (cause) { setError(cause instanceof Error ? cause.message : t("No se pudo consultar el historial.")) }
          }}>{t("Ver historial")}</button>{history[job.id] && <ul className="mt-4 space-y-2 text-xs text-muted">{history[job.id].length === 0 && <li>{t("Sin cambios registrados.")}</li>}{history[job.id].map((event, index) => <li key={index}>{statusName(event.previous_status)} → {statusName(event.status)}{event.note ? ` · ${event.note}` : ''}</li>)}</ul>}
        </div>
      </details>
    </article>)}</div><div className="row-actions"><button disabled={Boolean(requestId) || loading || offset === 0} onClick={() => setOffset(Math.max(0, offset-50))}>{t("Página anterior")}</button><span className="text-xs text-muted">{jobs.length}{' '}{t("solicitudes en esta página")}</span><button disabled={Boolean(requestId) || loading || jobs.length < 50} onClick={() => setOffset(offset+50)}>{t("Página siguiente")}</button><button disabled={loading} onClick={() => setVersion((value) => value + 1)}>{t("Actualizar bandeja")}</button></div>
  </section>
}
