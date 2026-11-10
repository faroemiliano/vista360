import { t } from '../../i18n'
import { useEffect, useState } from 'react'
import { getSession } from '../../api/client'
import { businessApi } from '../../api/business'
import { subscriptionApi } from '../../api/subscriptions'
import type { Subscription } from '../../api/subscriptions'
import type { PublicPlanCode } from './selection'
import { publicPlanNames } from './selection'
import { PlanSummary } from './PlanSummary'

export function MyPlan({ selectedPlan, onStart }: { selectedPlan?: PublicPlanCode | ''; onStart?: () => void }) {
  const [data, setData] = useState<Subscription | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [version, setVersion] = useState(0)
  useEffect(() => {
    let active = true
    setError(''); setData(null)
    const load = () => businessApi.workspaces().then(rows => {
      const own = rows.find(row => row.is_owner)
      if (!own) throw new Error(t("No se encontró tu estudio propio."))
      return subscriptionApi.own(own.id)
    }).then(result => { if (active) { setData(result); setError('') } }).catch((cause: Error) => { if (active) setError(cause.message) })
    void load()
    const refresh = () => { if (document.visibilityState === 'visible') void load() }
    const interval = window.setInterval(refresh, 60_000)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => { active = false; window.clearInterval(interval); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh) }
  }, [version])
  async function activateTrial() {
    if (!data || busy) return
    setBusy(true); setMessage('')
    try {
      await getSession()
      const updated = await subscriptionApi.startTrial(data.workspace_id)
      setData(updated); setMessage(t("Tu prueba gratuita está activa. Ya podés usar tu estudio."))
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : t("No se pudo activar la prueba.")) }
    finally { setBusy(false) }
  }
  return <section aria-label={t("Mi plan")}>
    {error ? <div role="alert"><p>{t(error)}</p><button className="mt-3" onClick={() => setVersion(value => value + 1)}>{t("Reintentar plan")}</button></div> : !data ? <p role="status">{t("Consultando tu plan…")}</p> : <>
      {selectedPlan && <div className="mb-5 rounded-xl border border-accent/30 bg-accent/5 p-4" aria-label={t("Plan elegido")}>
        <p className="font-semibold">{t("Elegiste")} {publicPlanNames[selectedPlan]}</p>
        {selectedPlan === 'trial' ? <>
          {data.plan.code === 'trial' && data.status !== 'expired' ? <><p className="mt-2 text-sm text-muted">{t("Tu prueba gratuita ya está activa. Podés usar el estudio sin tarjeta ni aprobación manual.")}</p>{onStart && <button className="btn-primary mt-3" onClick={onStart}>{t("Empezar a usar mi estudio")}</button>}</>
            : data.trial_available ? <><p className="mt-2 text-sm text-muted">{t("Activá tu prueba gratuita de 14 días. Incluye un recorrido publicado y hasta seis ambientes. No necesitás tarjeta ni aprobación manual.")}</p><button className="btn-primary mt-3" disabled={busy} onClick={() => void activateTrial()}>{busy ? t("Activando…") : t("Activar prueba gratuita")}</button></>
              : <p className="mt-2 text-sm text-muted">{data.plan.code === 'trial' ? t("Tu prueba gratuita terminó. Podés consultar los planes para continuar.") : t("Tu cuenta conserva su plan actual. La prueba gratuita no está disponible para esta cuenta.")}</p>}
        </> : <><p className="mt-2 text-sm text-muted">{data.plan.code === selectedPlan && data.status !== 'expired' ? t("Este es el plan vigente de tu cuenta.") : t("Tu plan actual es {0}. El plan elegido es mensual. Coordiná el pago personalmente con Vision360; administración lo habilitará después de confirmarlo. Tu elección no genera un cobro.", [t(data.plan.name)])}</p>{(data.plan.code !== selectedPlan || data.status === 'expired') && <a className="mt-3 inline-flex min-h-11 items-center text-sm text-accent" href={`/inicio?plan=${selectedPlan}#contacto`}>{t("Consultar activación de")} {publicPlanNames[selectedPlan]}</a>}</>}
      </div>}
      {message && <p role="status" className="my-4 text-sm">{t(message)}</p>}
      <PlanSummary data={data} />
      <details className="mt-5 rounded-xl border border-line p-4"><summary>{t("Planes disponibles")}</summary><div className="mt-4 grid gap-3">{data.catalog.map(plan => <div key={plan.code} className="border-b border-line pb-3 text-sm"><p className="font-semibold">{t(plan.name)}{plan.trial_days ? t(" · {0} días", [plan.trial_days]) : plan.billing_interval === 'month' ? t(" · Mensual") : ''}</p><p className="mt-1 text-muted">{t("Hasta")} {plan.published_limit}{' '}{t("recorridos publicados")}{plan.scene_limit ? t(" y {0} ambientes por recorrido", [plan.scene_limit]) : ''}.</p></div>)}</div></details>
      <p className="mt-5 text-sm text-muted">{t("La prueba gratuita se activa sin tarjeta. Profesional y Estudio son mensuales: el pago se coordina personalmente y administración habilita o renueva el plan al confirmarlo. No hay cobros ni renovación automáticos.")}</p>
      <a className="mt-3 inline-block text-sm text-accent" href="/inicio#contacto">{t("Consultar sobre mi plan")}</a>
    </>}
  </section>
}
