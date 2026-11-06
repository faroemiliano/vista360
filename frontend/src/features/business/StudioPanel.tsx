import { useEffect, useState } from 'react'
import { businessApi } from '../../api/business'
import type { ServiceJob } from '../../api/business'
import type { components } from '../../api/schema'

import { statusName, statuses } from './workflow'

export function StudioPanel({ onPrepare, embedded = false, requestId = '', onShowAll }: { onPrepare?: (job: ServiceJob) => void; embedded?: boolean; requestId?: string; onShowAll?: () => void } = {}) {
  const [jobs, setJobs] = useState<ServiceJob[]>([])
  const [offset, setOffset] = useState(0)
  const [version, setVersion] = useState(0)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [history, setHistory] = useState<Record<string, components['schemas']['EventResponse'][]>>({})
  useEffect(() => {
    let active = true; setLoading(true); setError('')
    const load = requestId ? businessApi.serviceRequest(requestId).then((item) => [item]) : businessApi.jobs(offset)
    load.then((rows) => { if (active) setJobs(rows) }).catch((cause: Error) => { if (active) setError(cause.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [offset, version, requestId])
  return <section>{!embedded && <><p className="eyebrow mb-3">Operación de Vision360 Studio</p><h2 className="text-3xl">Solicitudes de digitalización</h2><p className="muted mt-3">Seguimiento interno del trabajo. Los estados no realizan cobros ni publican recorridos automáticamente.</p></>}
    {requestId && <button className="my-4" onClick={onShowAll}>Ver todas las solicitudes</button>}
    {error && <p role="alert">{error}</p>}{loading && <p role="status" className="my-5">Cargando solicitudes…</p>}
    {!loading && !jobs.length && <p className="card my-6 p-6 text-sm text-muted">No hay solicitudes en esta página. Las consultas recibidas desde la web aparecerán acá.</p>}
    <div className="my-6 space-y-5">{jobs.map((job) => <article key={job.id} className="card p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3>{job.name}</h3><p className="muted mt-1">{job.locality} · {job.property_kind} · {job.area_m2} m² · {job.rooms} ambientes</p></div><span className="badge">{statusName(job.status)}</span></div>{job.notification_status && <p className="mt-3 text-xs text-muted">{{ pending: 'Aviso por email pendiente', accepted: 'Aviso por email enviado', failed: 'No se pudo enviar el aviso por email. La solicitud está guardada.', not_configured: 'Aviso por email pendiente de activación' }[job.notification_status]}</p>}<p className="my-3 break-words text-sm">{job.email} · {job.whatsapp}</p>{job.message && <p className="mb-4 whitespace-pre-wrap text-sm text-muted">{job.message}</p>}<p className="mb-4 break-all text-[11px] text-subtle">Referencia {job.id}</p>
      {!job.organization_id && <form key={job.status} className="grid gap-3 sm:grid-cols-3" aria-label={`Actualizar solicitud ${job.id}`} onSubmit={async (event) => {
        event.preventDefault(); if (busy) return
        const data = new FormData(event.currentTarget); setBusy(true); setError('')
        try { await businessApi.transition(job.id, { expected_status: job.status, status: String(data.get('status')) as ServiceJob['status'], note: String(data.get('note')) }); setVersion((value) => value + 1); setHistory({}) }
        catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo actualizar.') }
        finally { setBusy(false) }
      }}><label>Nuevo estado<select name="status" required defaultValue=""><option value="" disabled>Elegí un estado</option>{statuses.map((status) => <option key={status} value={status}>{statusName(status)}</option>)}</select></label><label>Nota interna<input name="note" maxLength={2000} /></label><button className="self-end mb-4" disabled={busy}>Actualizar estado</button></form>}
      {job.organization_id ? <p className="my-4 text-sm text-accent">Ya tiene un trabajo vinculado. Abrilo desde Trabajos en su organización.</p> : onPrepare && !['FINALIZADO', 'CANCELADO'].includes(job.status) && <button className="btn-primary mr-3" onClick={() => onPrepare(job)}>Preparar trabajo para {job.name}</button>}
      <button disabled={busy} onClick={async () => {
        try { setHistory((current) => ({ ...current, [job.id]: [] })); const rows = await businessApi.events(job.id); setHistory((current) => ({ ...current, [job.id]: rows })) }
        catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo consultar el historial.') }
      }}>Ver historial</button>{history[job.id] && <ul className="mt-4 space-y-2 text-xs text-muted">{history[job.id].length === 0 && <li>Sin cambios registrados.</li>}{history[job.id].map((event, index) => <li key={index}>{statusName(event.previous_status)} → {statusName(event.status)}{event.note ? ` · ${event.note}` : ''}</li>)}</ul>}
    </article>)}</div><div className="row-actions"><button disabled={Boolean(requestId) || loading || offset === 0} onClick={() => setOffset(Math.max(0, offset-50))}>Página anterior</button><span className="text-xs text-muted">{jobs.length} solicitudes en esta página</span><button disabled={Boolean(requestId) || loading || jobs.length < 50} onClick={() => setOffset(offset+50)}>Página siguiente</button><button disabled={loading} onClick={() => setVersion((value) => value + 1)}>Actualizar bandeja</button></div>
  </section>
}
