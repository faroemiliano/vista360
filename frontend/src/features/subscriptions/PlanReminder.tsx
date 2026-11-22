import { t } from '../../i18n'
import type { Subscription } from '../../api/subscriptions'
import { planDate } from './PlanSummary'

export function PlanReminder({ data, onOpen }: { data: Subscription | null; onOpen: () => void }) {
  if (!data?.renewal_reminder) return null
  const trial = data.plan.code === 'trial'
  return <aside aria-label={t("Recordatorio de vencimiento")} className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-accent/35 bg-accent/5 p-4">
    <div><p className="font-semibold">{trial ? t("Tu prueba gratuita está por terminar") : t("Recordatorio: tu plan está por vencer")}</p>
      <p className="mt-1 text-sm text-muted">{data.remaining_days === 1 ? t("Te queda 1 día") : t("Te quedan {0} días", [data.remaining_days])}. {data.period_end && t("Vence el {0}.", [planDate(data.period_end)])}</p>
      <p className="mt-1 text-xs text-muted">{trial ? t("Consultá los planes disponibles para continuar.") : t("Coordiná el pago personalmente con Vision360 para que administración renueve tu plan.")}</p>
    </div>
    <div className="flex flex-wrap gap-2"><button onClick={onOpen}>{t("Ver mi plan")}</button><a className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm text-accent" href={`/inicio?plan=${data.plan.code === 'legacy' ? 'professional' : data.plan.code}#contacto`}>{trial ? t("Consultar planes") : t("Coordinar renovación")}</a></div>
  </aside>
}
