import { useEffect, useState } from 'react'
import { businessApi } from '../../api/business'
import type { Organization, WorkJob } from '../../api/business'
import type { components } from '../../api/schema'
import type { WorkStep } from '../../components/WorkSteps'
import { statusName, statuses } from './workflow'

function localDate(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
export function WorkDetail({ job, organization, onChanged, onEditor, onNavigate, step, onStepChange, onDirtyChange, hasUnsavedChanges }: {
  hasUnsavedChanges: boolean;
  onDirtyChange: (dirty: boolean) => void;
  step: WorkStep; onStepChange: (step: WorkStep) => void;
  job: WorkJob; organization: Organization; onChanged: (job: WorkJob) => void; onEditor: () => void;
  onNavigate: (org: string, tab: string) => void
}) {
  const [busy, setBusy] = useState(false)
  useEffect(() => () => onDirtyChange(false), [onDirtyChange])
  useEffect(() => { setError(''); setMessage('') }, [step])
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [history, setHistory] = useState<components['schemas']['EventResponse'][]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const writable = organization.role !== 'viewer'
  const closed = ['FINALIZADO', 'CANCELADO'].includes(job.status)
  const link = job.public_path ? new URL(job.public_path, window.location.origin).href : ''
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)
  useEffect(() => {
    let active = true; setHistoryLoading(true)
    businessApi.workEvents(organization.id, job.id).then((rows) => { if (active) setHistory(rows) })
      .catch((cause: Error) => { if (active) setError(cause.message) }).finally(() => { if (active) setHistoryLoading(false) })
    return () => { active = false }
  }, [organization.id, job.id, job.work_revision])
  async function act(action: () => Promise<void>) {
    if (busy) return
    setBusy(true); setError(''); setMessage('')
    try { await action(); onDirtyChange(false) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo completar la operación.'); }
    finally { setBusy(false) }
  }
  return <div>
    {error && <p role="alert">{error}</p>}{message && <p role="status" className="my-4 text-sm text-accent">{message}</p>}
    <div className="mx-auto max-w-3xl">
      <div className="space-y-6">
        {step === 'data' && <section className="card p-5 sm:p-6"><p className="eyebrow mb-3">Cliente y propiedad</p><h3>Todo el proyecto, conectado</h3><p className="mt-3 font-semibold">Cliente: {organization.name}</p><p className="muted mt-3 break-words">Contacto del pedido: {job.name} · {job.email} · {job.whatsapp}</p><p className="muted mt-2">{job.property_kind} · {job.area_m2} m² · {job.rooms} ambientes</p>{job.message && <p className="my-3 whitespace-pre-wrap text-sm">{job.message}</p>}<div className="row-actions">{!organization.deleted_at && <button onClick={() => onNavigate(organization.id, 'clients')}>Abrir cliente</button>}{!organization.deleted_at && <button onClick={() => onNavigate(organization.id, 'properties')}>Abrir propiedad</button>}</div><p className="field-hint">El contacto y las notas son internos. No aparecen en el recorrido público.</p><button className="btn-primary mt-5" onClick={() => onStepChange('visit')}>Continuar a visita</button></section>}
        {step === 'visit' && <section className="card p-5 sm:p-6"><p className="eyebrow mb-3">Coordiná la captura y visita</p><h3>Coordinación del trabajo</h3>
          <form key={`${job.id}-${job.work_revision}`} className="mt-5" onChange={() => onDirtyChange(true)} onSubmit={(event) => {
            event.preventDefault(); const data = new FormData(event.currentTarget)
            void act(async () => { onChanged(await businessApi.workDetails(organization.id, job.id, {
              expected_revision: job.work_revision, scheduled_at: data.get('scheduled') ? new Date(String(data.get('scheduled'))).toISOString() : null,
              operations_notes: String(data.get('notes')) })); setMessage('Visita y notas guardadas.') })
          }}><fieldset className="min-w-0" disabled={!writable || busy || closed}><label>Fecha y hora de visita<input name="scheduled" type="datetime-local" defaultValue={localDate(job.scheduled_at)} /></label><p className="field-hint">Hora local del dispositivo. No envía invitaciones ni recordatorios.</p><label>Notas operativas<textarea name="notes" maxLength={5000} defaultValue={job.operations_notes} placeholder="Acceso al inmueble, contacto en el lugar y detalles de captura." /></label>{writable && !closed && <button className={job.scheduled_at ? '' : 'btn-primary'} disabled={busy}>Guardar visita y notas</button>}</fieldset></form>
          {closed && <p className="field-hint">Este trabajo está cerrado. Podés reabrirlo desde Cambiar estado del trabajo.</p>}
          {writable && !closed && ['SOLICITADO', 'PRESUPUESTADO'].includes(job.status) && <button className="mt-4" disabled={busy || hasUnsavedChanges} onClick={() => void act(async () => {
            onChanged(await businessApi.workStatus(organization.id, job.id, { expected_status: job.status, status: 'CONFIRMADO', note: 'Trabajo confirmado para realizar la visita.' }))
          })}>Confirmar trabajo</button>}
          <button className="btn-primary mt-5" onClick={onEditor}>Continuar a fotos</button>
        </section>}
        {step === 'delivery' && <section className="card p-5 sm:p-6"><p className="eyebrow mb-3">Entrega a la inmobiliaria</p><h3>{job.delivered_at ? 'Entrega registrada' : 'Enlace para el cliente'}</h3>
          {link ? <><label className="mt-5">Enlace de entrega<input readOnly value={link} onFocus={(event) => event.currentTarget.select()} /></label><div className="row-actions"><a className="text-sm text-accent underline" href={link} target="_blank" rel="noopener noreferrer">Abrir recorrido público</a><button disabled={busy} onClick={() => void act(async () => { if (!navigator.clipboard) throw new Error('Seleccioná el campo y copiá el enlace manualmente.'); await navigator.clipboard.writeText(link); setMessage('Enlace copiado. Enviáselo al cliente por tu canal habitual.') })}>Copiar enlace de entrega</button></div>{local && <p className="field-hint">Este enlace es local. Podés simular la entrega aquí; enviarlo a clientes por Internet requiere desplegar la app.</p>}</> : <p className="muted mt-3">El recorrido no tiene una publicación activa. Abrí el editor y publicalo para obtener el enlace.</p>}
          {job.has_unpublished_changes && <p className="my-4 text-sm text-amber-200">Hay cambios sin publicar. El enlace conserva la versión anterior; publicá los cambios antes de registrar la entrega.</p>}
          {job.delivered_at && <p className="muted mt-4">Registrada el {new Date(job.delivered_at).toLocaleString('es-AR')}. {link ? 'El enlace sigue activo.' : 'El enlace ya no está activo; el registro de entrega se conserva.'}</p>}
          {writable && !closed && link && !job.has_unpublished_changes && job.status !== 'PUBLICADO' && <button className="btn-primary mt-5" disabled={busy} onClick={() => void act(async () => {
            onChanged(await businessApi.workStatus(organization.id, job.id, { expected_status: job.status, status: 'PUBLICADO', note: 'Recorrido revisado y listo para entregar.' })); setMessage('Trabajo listo para registrar la entrega.')
          })}>Marcar como listo para entregar</button>}
          {!closed && writable && link && !job.has_unpublished_changes && job.status === 'PUBLICADO' && <form className="mt-5" onChange={() => onDirtyChange(true)} onSubmit={(event) => {
            event.preventDefault(); const data = new FormData(event.currentTarget)
            void act(async () => { onChanged(await businessApi.deliverWork(organization.id, job.id, { expected_revision: job.work_revision, note: String(data.get('deliveryNote')) })); setMessage('Entrega registrada y trabajo finalizado.') })
          }}><label>Detalle de la entrega<input name="deliveryNote" required maxLength={2000} placeholder="Ej.: enlace enviado a Laura por WhatsApp." /></label><label className="flex items-start gap-3 text-sm"><input type="checkbox" required className="!w-auto" />Confirmo que compartí el enlace con el cliente. Esto no envía mensajes automáticamente.</label><button className="btn-primary" disabled={busy || !link || job.has_unpublished_changes || job.status !== 'PUBLICADO'}>Registrar entrega y finalizar</button>{job.status !== 'PUBLICADO' && <p className="field-hint">Si el recorrido está publicado, pulsá «Marcar como listo para entregar».</p>}</form>}
          {job.has_unpublished_changes && <button className="btn-primary mt-5" onClick={() => onStepChange('review')}>Publicar los cambios pendientes</button>}
          {!link && <button className="btn-primary mt-5" onClick={() => onStepChange('review')}>Revisar y publicar recorrido</button>}
        </section>}
      </div>
      <aside className="mt-6 space-y-4">
        <details className="card p-5"><summary>Cambiar estado del trabajo</summary>{writable ? <form key={job.status} className="mt-5" onSubmit={(event) => {
          event.preventDefault(); const data = new FormData(event.currentTarget)
          void act(async () => onChanged(await businessApi.workStatus(organization.id, job.id, { expected_status: job.status,
            status: String(data.get('status')) as WorkJob['status'], note: String(data.get('note')) })))
        }}><fieldset className="min-w-0" disabled={busy || hasUnsavedChanges}><label>Próximo estado<select name="status" required defaultValue=""><option value="" disabled>Elegí un estado</option>{statuses.map((status) => <option key={status} value={status}>{statusName(status)}</option>)}</select></label><p className="field-hint">Podés elegir cualquier estado o reabrir el trabajo. PUBLICADO requiere una publicación vigente; FINALIZADO también requiere una nota de entrega. No envía mensajes.</p><label>Nota de seguimiento<input name="note" maxLength={2000} /></label><button disabled={busy}>Guardar estado</button></fieldset></form> : <p className="muted mt-3">Tu acceso es de solo lectura.</p>}<button className="mt-4" disabled={busy || hasUnsavedChanges} onClick={() => void act(async () => onChanged(await businessApi.work(organization.id, job.id)))}>Actualizar trabajo</button></details>
        <details className="card p-5"><summary>Historial del trabajo</summary>{historyLoading ? <p role="status" className="muted mt-3">Consultando historial…</p> : <ol className="mt-4 space-y-4">{history.map((event, index) => <li key={index} className="border-l-2 border-accent/20 pl-3 text-xs"><p className="font-semibold">{event.previous_status === event.status ? 'Actualización del trabajo' : `${statusName(event.previous_status)} → ${statusName(event.status)}`}</p><p className="mt-1 text-muted">{new Date(event.created_at).toLocaleString('es-AR')}</p>{event.note && <p className="mt-2 whitespace-pre-wrap">{event.note}</p>}</li>)}</ol>}</details>
      </aside>
    </div>
  </div>
}
