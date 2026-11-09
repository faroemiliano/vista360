import { useEffect, useRef, useState } from 'react'
import { getSession } from '../../api/client'
import { subscriptionApi } from '../../api/subscriptions'
import type { PlanCode, Subscription, SubscriptionEvent } from '../../api/subscriptions'
import { PlanSummary, planDate } from './PlanSummary'
import { useBlockNavigation } from '../../app/navigation'

export function ManageSubscription({ userId, email, onClose }: { userId: string; email: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [data, setData] = useState<Subscription | null>(null)
  const [events, setEvents] = useState<SubscriptionEvent[]>([])
  const [plan, setPlan] = useState<PlanCode>('professional')
  const [days, setDays] = useState(30)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [version, setVersion] = useState(0)
  useBlockNavigation(Boolean(note.trim()))
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close() }, [])
  useEffect(() => {
    let active = true
    setError('')
    Promise.all([subscriptionApi.account(userId), subscriptionApi.events(userId)]).then(([result, history]) => {
      if (active) { setData(result); setPlan(result.plan.code); setEvents(history) }
    }).catch((cause: Error) => { if (active) setError(cause.message) })
    return () => { active = false }
  }, [userId, version])
  function close() { if (!busy && (!note.trim() || window.confirm('¿Descartar la nota y cerrar la gestión del plan?'))) onClose() }
  async function save(cancel = false) {
    if (!data || busy) return
    setError(''); setMessage('')
    if (note.trim().length < 3) { setError('Escribí una nota de al menos tres caracteres para dejar constancia.'); return }
    if (!window.confirm(cancel ? '¿Programar la cancelación al terminar el período? Los datos y enlaces existentes se conservarán.' : `¿Asignar o renovar este plan para ${email}? Esto no registra ni ejecuta un cobro.`)) return
    setBusy(true)
    try {
      await getSession()
      const updated = cancel ? await subscriptionApi.cancel(userId, { revision: data.revision, note }) : await subscriptionApi.assign(userId, { plan_code: plan, duration_days: days, revision: data.revision, note })
      setData(updated); setNote(''); setMessage(cancel ? 'Cancelación programada.' : 'Plan actualizado. No se realizó ningún cobro.')
      setVersion(value => value + 1)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo guardar el plan.') }
    finally { setBusy(false) }
  }
  return <dialog ref={dialog} aria-labelledby="manage-plan-title" onCancel={event => { event.preventDefault(); close() }} className="m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-2xl overflow-y-auto rounded-2xl border border-line bg-surface-900 p-5 text-ink backdrop:bg-black/70 sm:p-7">
    <div className="flex items-center justify-between gap-3"><h2 id="manage-plan-title">Gestionar plan</h2><button disabled={busy} aria-label="Cerrar gestión del plan" onClick={close}>×</button></div>
    <p className="my-4 break-all text-sm text-muted">{email}</p>
    {data ? <>
      <PlanSummary data={data} />
      <form className="my-5" aria-label="Asignar plan" onSubmit={event => { event.preventDefault(); void save() }}>
        <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
          <label>Plan<select value={plan} onChange={event => setPlan(event.target.value as PlanCode)}><option value="legacy">Acceso anterior</option>{data.catalog.map(item => <option value={item.code} key={item.code}>{item.name}</option>)}</select></label>
          {plan !== 'legacy' && plan !== 'trial' && <label>Días del período<input type="number" min={1} max={366} required value={days} onChange={event => setDays(Number(event.target.value))} /></label>}
          <p className="text-xs text-muted sm:col-span-2">{plan === 'trial' ? 'La prueba dura 14 días. Si sigue vigente, se agregan al vencimiento actual.' : plan === 'legacy' ? 'Conserva el acceso sin límites comerciales del nuevo catálogo.' : 'El mismo plan vigente suma días al vencimiento actual. Al cambiar de plan, el período comienza hoy.'}</p>
          <label className="sm:col-span-2">Nota administrativa<textarea required minLength={3} maxLength={500} value={note} onChange={event => setNote(event.target.value)} placeholder="Ej.: activación manual acordada con el titular" /></label>
          <button className="btn-primary sm:col-span-2">Asignar o renovar plan</button>
        </fieldset>
      </form>
      {data.status === 'active' && data.period_end && <button disabled={busy} className="btn-quiet" onClick={() => void save(true)}>Cancelar al finalizar el período</button>}
      <details className="mt-5 rounded-xl border border-line p-4"><summary>Historial de cambios</summary>{!events.length ? <p className="mt-3 text-sm text-muted">Todavía no hay cambios manuales.</p> : <ol className="mt-3 space-y-3">{events.map(event => <li className="border-b border-line pb-3 text-sm" key={event.id}><p>{event.action === 'cancel' ? 'Cancelación programada' : 'Asignación o renovación'} · {planDate(event.created_at)}</p><p className="mt-1 break-words text-muted">{event.note}</p><p className="mt-1 text-xs text-muted">{String(event.before.plan_code)} → {String(event.after.plan_code)}</p></li>)}</ol>}</details>
    </> : !error && <p role="status">Consultando el plan…</p>}
    {error && <div role="alert" className="mt-4"><p>{error}</p><button disabled={busy} className="mt-2" onClick={() => setVersion(value => value + 1)}>Actualizar ficha</button></div>}{message && <p role="status" className="mt-4">{message}</p>}
  </dialog>
}
