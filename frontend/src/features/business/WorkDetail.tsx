import { t, dateLocale } from '../../i18n'
import { lazy, Suspense, useEffect, useState } from 'react'
import { businessApi } from '../../api/business'
import type { Organization, WorkJob } from '../../api/business'
import type { components } from '../../api/schema'
import type { WorkStep } from '../../components/WorkSteps'
import { statusName, statuses } from './workflow'

const DeliveryDocumentForm = lazy(() => import('./DeliveryDocument').then(module => ({ default: module.DeliveryDocumentForm })))

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
    catch (cause) { setError(cause instanceof Error ? cause.message : t("No se pudo completar la operación.")); }
    finally { setBusy(false) }
  }
  return <div>
    {error && <p role="alert">{t(error)}</p>}{message && <p role="status" className="my-4 text-sm text-accent">{t(message)}</p>}
    <div className="mx-auto max-w-3xl">
      <div className="space-y-6">
        {step === 'data' && <section className="card p-5 sm:p-6"><p className="eyebrow mb-3">{t("Cliente y propiedad")}</p><h3>{t("Todo el proyecto, conectado")}</h3><p className="mt-3 font-semibold">{t("Cliente:")} {organization.name}</p><p className="muted mt-3 break-words">{t("Contacto del pedido:")} {job.name} · {job.email} · {job.whatsapp}</p><p className="muted mt-2">{job.property_kind} · {job.area_m2} m² · {job.rooms}{' '}{t("ambientes")}</p>{job.message && <p className="my-3 whitespace-pre-wrap text-sm">{job.message}</p>}<div className="row-actions">{!organization.deleted_at && <button onClick={() => onNavigate(organization.id, 'clients')}>{t("Abrir cliente")}</button>}{!organization.deleted_at && <button onClick={() => onNavigate(organization.id, 'properties')}>{t("Abrir propiedad")}</button>}</div><p className="field-hint">{t("El contacto y las notas son internos. No aparecen en el recorrido público.")}</p><button className="btn-primary mt-5" onClick={() => onStepChange('visit')}>{t("Continuar a visita")}</button></section>}
        {step === 'visit' && <section className="card p-5 sm:p-6"><p className="eyebrow mb-3">{t("Coordiná la captura y visita")}</p><h3>{t("Coordinación del trabajo")}</h3>
          <form key={`${job.id}-${job.work_revision}`} className="mt-5" onChange={() => onDirtyChange(true)} onSubmit={(event) => {
            event.preventDefault(); const data = new FormData(event.currentTarget)
            void act(async () => { onChanged(await businessApi.workDetails(organization.id, job.id, {
              expected_revision: job.work_revision, scheduled_at: data.get('scheduled') ? new Date(String(data.get('scheduled'))).toISOString() : null,
              operations_notes: String(data.get('notes')) })); setMessage(t("Visita y notas guardadas.")) })
          }}><fieldset className="min-w-0" disabled={!writable || busy || closed}><label>{t("Fecha y hora de visita")}<input name="scheduled" type="datetime-local" defaultValue={localDate(job.scheduled_at)} /></label><p className="field-hint">{t("Hora local del dispositivo. No envía invitaciones ni recordatorios.")}</p><label>{t("Notas operativas")}<textarea name="notes" maxLength={5000} defaultValue={job.operations_notes} placeholder={t("Acceso al inmueble, contacto en el lugar y detalles de captura.")} /></label>{writable && !closed && <button className={job.scheduled_at ? '' : 'btn-primary'} disabled={busy}>{t("Guardar visita y notas")}</button>}</fieldset></form>
          {closed && <p className="field-hint">{t("Este trabajo está cerrado. Podés reabrirlo desde Cambiar estado del trabajo.")}</p>}
          {writable && !closed && ['SOLICITADO', 'PRESUPUESTADO'].includes(job.status) && <button className="mt-4" disabled={busy || hasUnsavedChanges} onClick={() => void act(async () => {
            onChanged(await businessApi.workStatus(organization.id, job.id, { expected_status: job.status, status: 'CONFIRMADO', note: t("Trabajo confirmado para realizar la visita.") }))
          })}>{t("Confirmar trabajo")}</button>}
          <button className="btn-primary mt-5" onClick={onEditor}>{t("Continuar a fotos")}</button>
        </section>}
        {step === 'delivery' && <section className="card p-5 sm:p-6"><p className="eyebrow mb-3">{t("Entrega a la inmobiliaria")}</p><h3>{job.delivered_at ? t("Entrega registrada") : t("Enlace para el cliente")}</h3>
          {link ? <><label className="mt-5">{t("Enlace de entrega")}<input readOnly value={link} onFocus={(event) => event.currentTarget.select()} /></label><div className="row-actions"><a className="text-sm text-accent underline" href={link} target="_blank" rel="noopener noreferrer">{t("Abrir recorrido público")}</a><button disabled={busy} onClick={() => void act(async () => { if (!navigator.clipboard) throw new Error(t("Seleccioná el campo y copiá el enlace manualmente.")); await navigator.clipboard.writeText(link); setMessage(t("Enlace copiado. Enviáselo al cliente por tu canal habitual.")) })}>{t("Copiar enlace de entrega")}</button></div>{local && <p className="field-hint">{t("Este enlace es local. Podés simular la entrega aquí; enviarlo a clientes por Internet requiere desplegar la app.")}</p>}</> : <p className="muted mt-3">{t("El recorrido no tiene una publicación activa. Abrí el editor y publicalo para obtener el enlace.")}</p>}
          {job.has_unpublished_changes && <p className="my-4 text-sm text-amber-200">{t("Hay cambios sin publicar. El enlace conserva la versión anterior; publicá los cambios antes de registrar la entrega.")}</p>}
          {job.delivered_at && <p className="muted mt-4">{t("Registrada el")} {new Date(job.delivered_at).toLocaleString(dateLocale())}. {link ? t("El enlace sigue activo.") : t("El enlace ya no está activo; el registro de entrega se conserva.")}</p>}
          {link && <Suspense fallback={<p role="status">{t('Cargando')}</p>}><DeliveryDocumentForm key={job.id} job={job} clientName={organization.name} writable={writable} blocked={busy || hasUnsavedChanges} onChanged={onChanged} /></Suspense>}
          {writable && !closed && link && !job.has_unpublished_changes && job.status !== 'PUBLICADO' && <button className="btn-primary mt-5" disabled={busy} onClick={() => void act(async () => {
            onChanged(await businessApi.workStatus(organization.id, job.id, { expected_status: job.status, status: 'PUBLICADO', note: t("Recorrido revisado y listo para entregar.") })); setMessage(t("Trabajo listo para registrar la entrega."))
          })}>{t("Marcar como listo para entregar")}</button>}
          {!closed && writable && link && !job.has_unpublished_changes && job.status === 'PUBLICADO' && <form className="mt-5" onChange={() => onDirtyChange(true)} onSubmit={(event) => {
            event.preventDefault(); const data = new FormData(event.currentTarget)
            void act(async () => { onChanged(await businessApi.deliverWork(organization.id, job.id, { expected_revision: job.work_revision, note: String(data.get('deliveryNote')) })); setMessage(t("Entrega registrada y trabajo finalizado.")) })
          }}><label>{t("Detalle de la entrega")}<input name="deliveryNote" required maxLength={2000} placeholder={t("Ej.: enlace enviado a Laura por WhatsApp.")} /></label><label className="flex items-start gap-3 text-sm"><input type="checkbox" required className="!w-auto" />{t("Confirmo que compartí el enlace con el cliente. Esto no envía mensajes automáticamente.")}</label><button className="btn-primary" disabled={busy || !link || job.has_unpublished_changes || job.status !== 'PUBLICADO'}>{t("Registrar entrega y finalizar")}</button>{job.status !== 'PUBLICADO' && <p className="field-hint">{t("Si el recorrido está publicado, pulsá «Marcar como listo para entregar».")}</p>}</form>}
          {job.has_unpublished_changes && <button className="btn-primary mt-5" onClick={() => onStepChange('review')}>{t("Publicar los cambios pendientes")}</button>}
          {!link && <button className="btn-primary mt-5" onClick={() => onStepChange('review')}>{t("Revisar y publicar recorrido")}</button>}
        </section>}
      </div>
      <aside className="mt-6 space-y-4">
        <details className="card p-5"><summary>{t("Cambiar estado del trabajo")}</summary>{writable ? <form key={job.status} className="mt-5" onSubmit={(event) => {
          event.preventDefault(); const data = new FormData(event.currentTarget)
          void act(async () => onChanged(await businessApi.workStatus(organization.id, job.id, { expected_status: job.status,
            status: String(data.get('status')) as WorkJob['status'], note: String(data.get('note')) })))
        }}><fieldset className="min-w-0" disabled={busy || hasUnsavedChanges}><label>{t("Próximo estado")}<select name="status" required defaultValue=""><option value="" disabled>{t("Elegí un estado")}</option>{statuses.map((status) => <option key={status} value={status}>{statusName(status)}</option>)}</select></label><p className="field-hint">{t("Podés elegir cualquier estado o reabrir el trabajo. PUBLICADO requiere una publicación vigente; FINALIZADO también requiere una nota de entrega. No envía mensajes.")}</p><label>{t("Nota de seguimiento")}<input name="note" maxLength={2000} /></label><button disabled={busy}>{t("Guardar estado")}</button></fieldset></form> : <p className="muted mt-3">{t("Tu acceso es de solo lectura.")}</p>}<button className="mt-4" disabled={busy || hasUnsavedChanges} onClick={() => void act(async () => onChanged(await businessApi.work(organization.id, job.id)))}>{t("Actualizar trabajo")}</button></details>
        <details className="card p-5"><summary>{t("Historial del trabajo")}</summary>{historyLoading ? <p role="status" className="muted mt-3">{t("Consultando historial…")}</p> : <ol className="mt-4 space-y-4">{history.map((event, index) => <li key={index} className="border-l-2 border-accent/20 pl-3 text-xs"><p className="font-semibold">{event.previous_status === event.status ? t("Actualización del trabajo") : `${statusName(event.previous_status)} → ${statusName(event.status)}`}</p><p className="mt-1 text-muted">{new Date(event.created_at).toLocaleString(dateLocale())}</p>{event.note && <p className="mt-2 whitespace-pre-wrap">{event.note}</p>}</li>)}</ol>}</details>
      </aside>
    </div>
  </div>
}
