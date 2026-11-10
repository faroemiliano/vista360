import { t, dateLocale } from '../../i18n'
import type { Subscription } from '../../api/subscriptions'
export const planDate = (value: string) => new Date(value).toLocaleDateString(dateLocale(), { day: '2-digit', month: 'short', year: 'numeric' })
const bytes = (value: number) => value >= 1024 ** 3 ? `${(value / 1024 ** 3).toFixed(1)} GiB` : `${(value / 1024 ** 2).toFixed(1)} MiB`

export function PlanSummary({ data }: { data: Subscription }) {
  const nearStorage = data.plan.storage_limit_bytes && data.usage.storage_reserved_bytes >= data.plan.storage_limit_bytes * .8
  const nearTours = data.plan.published_limit && data.usage.published + data.usage.preparing >= data.plan.published_limit * .8
  return <div>
    <div className="rounded-xl border border-line bg-surface-850 p-4">
      <p className="text-lg font-semibold">{t(data.plan.name)}{data.plan.billing_interval === 'month' ? t(" · Mensual") : ''}</p>
      <p className="mt-2 text-sm text-muted">{data.status === 'expired' ? t("Período finalizado") : data.status === 'cancelled' ? t("Cancelación programada: acceso hasta terminar el período") : t("Activo")}</p>
      <p className="mt-2 text-xs text-muted">{data.period_end ? `${data.status === 'expired' ? t("Finalizó el") : t("Vigente hasta el")} ${planDate(data.period_end)}` : t("Tu acceso actual se conserva")}</p>
      {data.remaining_days !== null && <p className="mt-3 font-semibold text-accent">{data.remaining_days === 0 ? t("Tu período finalizó") : data.remaining_days === 1 ? t("Te queda 1 día") : t("Te quedan {0} días", [data.remaining_days])}</p>}
      {data.renewal_reminder && <p className="mt-3 text-sm text-muted">{data.plan.code === 'trial' ? t("Tu prueba gratuita está por terminar. Consultá los planes para continuar.") : t("Tu plan está por vencer. Coordiná la renovación con Vision360; el pago y la habilitación son manuales.")}</p>}
    </div>
    <dl className="my-4 grid gap-3 sm:grid-cols-2">
      <div className="rounded-xl border border-line p-4"><dt className="text-xs text-muted">{t("Recorridos publicados")}</dt><dd className="mt-2 font-semibold">{data.usage.published}{data.plan.published_limit !== null ? ` de ${data.plan.published_limit}` : ''}</dd>{!!data.usage.preparing && <p className="mt-1 text-xs text-muted">{data.usage.preparing}{' '}{t("preparando publicación")}</p>}</div>
      <div className="rounded-xl border border-line p-4"><dt className="text-xs text-muted">{t("Reserva estimada de almacenamiento")}</dt><dd className="mt-2 font-semibold">{bytes(data.usage.storage_reserved_bytes)}{data.plan.storage_limit_bytes !== null ? ` de ${bytes(data.plan.storage_limit_bytes)}` : ''}</dd></div>
    </dl>
    {data.plan.scene_limit !== null && <p className="my-3 text-sm text-muted">{t("Hasta")} {data.plan.scene_limit}{' '}{t("ambientes por recorrido.")}</p>}
    {!data.limits_enabled ? <p className="my-3 text-sm text-muted">{t("Durante esta etapa de pruebas los límites comerciales no bloquean el uso.")}</p> : data.status === 'expired' ? <p role="status" className="my-3 text-sm">{t("Para volver a publicar o cargar fotos, solicitá renovar el plan. Tus datos y enlaces existentes se conservan.")}</p> : (nearStorage || nearTours) ? <p role="status" className="my-3 text-sm">{t("Estás cerca del límite de tu plan. Podés liberar espacio, despublicar un recorrido o consultar una ampliación.")}</p> : null}
    <p className="text-xs leading-relaxed text-muted">{t("Incluye las fotos de tus borradores y recorridos, con un margen reservado para procesarlas y publicarlas.")}</p>
  </div>
}
