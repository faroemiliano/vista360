import { useEffect, useState } from 'react'
import { subscriptionApi } from '../../api/subscriptions'
import type { Subscription } from '../../api/subscriptions'
import { planDate } from './PlanSummary'

export function PlanReminder({ workspaceId, refreshKey, onOpen }: { workspaceId: string; refreshKey: boolean; onOpen: () => void }) {
  const [data, setData] = useState<Subscription | null>(null)
  useEffect(() => {
    let active = true
    let loading = false
    setData(null)
    async function load() {
      if (loading) return
      loading = true
      try {
        const result = await subscriptionApi.own(workspaceId)
        if (active) setData(result)
      } catch { /* Se vuelve a consultar al recuperar foco o en el siguiente intervalo. */ }
      finally { loading = false }
    }
    void load()
    const refresh = () => { if (document.visibilityState === 'visible') void load() }
    const interval = window.setInterval(refresh, 60_000)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      active = false; window.clearInterval(interval)
      window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh)
    }
  }, [workspaceId, refreshKey])
  if (!data?.renewal_reminder || data.workspace_id !== workspaceId) return null
  const trial = data.plan.code === 'trial'
  return <aside aria-label="Recordatorio de vencimiento" className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-accent/35 bg-accent/5 p-4">
    <div><p className="font-semibold">{trial ? 'Tu prueba gratuita está por terminar' : 'Recordatorio: tu plan está por vencer'}</p>
      <p className="mt-1 text-sm text-muted">{data.remaining_days === 1 ? 'Te queda 1 día' : `Te quedan ${data.remaining_days} días`}. {data.period_end && `Vence el ${planDate(data.period_end)}.`}</p>
      <p className="mt-1 text-xs text-muted">{trial ? 'Consultá los planes disponibles para continuar.' : 'Coordiná el pago personalmente con Vision360 para que administración renueve tu plan.'}</p>
    </div>
    <div className="flex flex-wrap gap-2"><button onClick={onOpen}>Ver mi plan</button><a className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm text-accent" href={`/inicio?plan=${data.plan.code === 'legacy' ? 'professional' : data.plan.code}#contacto`}>{trial ? 'Consultar planes' : 'Coordinar renovación'}</a></div>
  </aside>
}
