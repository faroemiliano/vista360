import { useEffect, useState } from 'react'
import { businessApi } from '../../api/business'
import { subscriptionApi } from '../../api/subscriptions'
import type { Subscription } from '../../api/subscriptions'
import type { PublicPlanCode } from './selection'
import { publicPlanNames } from './selection'
import { PlanSummary } from './PlanSummary'

export function MyPlan({ selectedPlan }: { selectedPlan?: PublicPlanCode | '' }) {
  const [data, setData] = useState<Subscription | null>(null)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)
  useEffect(() => {
    let active = true
    setError(''); setData(null)
    businessApi.workspaces().then(rows => {
      const own = rows.find(row => row.is_owner)
      if (!own) throw new Error('No se encontró tu estudio propio.')
      return subscriptionApi.own(own.id)
    }).then(result => { if (active) setData(result) }).catch((cause: Error) => { if (active) setError(cause.message) })
    return () => { active = false }
  }, [version])
  return <section aria-label="Mi plan">
    {error ? <div role="alert"><p>{error}</p><button className="mt-3" onClick={() => setVersion(value => value + 1)}>Reintentar plan</button></div> : !data ? <p role="status">Consultando tu plan…</p> : <>
      {selectedPlan && <div className="mb-5 rounded-xl border border-accent/30 bg-accent/5 p-4" aria-label="Plan elegido"><p className="font-semibold">Elegiste {publicPlanNames[selectedPlan]}</p><p className="mt-2 text-sm text-muted">{data.plan.code === selectedPlan && data.status !== 'expired' ? 'Este es el plan vigente de tu cuenta.' : `Tu plan actual es ${data.plan.name}. Consultanos para coordinar la activación del plan elegido. No se realizó ningún cobro.`}</p>{(data.plan.code !== selectedPlan || data.status === 'expired') && <a className="mt-3 inline-flex min-h-11 items-center text-sm text-accent" href={`/inicio?plan=${selectedPlan}#contacto`}>Consultar activación de {publicPlanNames[selectedPlan]}</a>}</div>}
      <PlanSummary data={data} />
      <details className="mt-5 rounded-xl border border-line p-4"><summary>Planes disponibles</summary><div className="mt-4 grid gap-3">{data.catalog.map(plan => <div key={plan.code} className="border-b border-line pb-3 text-sm"><p className="font-semibold">{plan.name}{plan.trial_days ? ` · ${plan.trial_days} días` : ''}</p><p className="mt-1 text-muted">Hasta {plan.published_limit} recorridos publicados{plan.scene_limit ? ` y ${plan.scene_limit} ambientes por recorrido` : ''}.</p></div>)}</div></details>
      <p className="mt-5 text-sm text-muted">Las activaciones y renovaciones se coordinan con Vision360. No hay cobros automáticos.</p>
      <a className="mt-3 inline-block text-sm text-accent" href="/inicio#contacto">Consultar sobre mi plan</a>
    </>}
  </section>
}
